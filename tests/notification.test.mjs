import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeNotification, encodeNotification } from "../dist/notification.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const fixture = JSON.parse(read("fixtures/notifications/v2.json"));
const { envelope, key, body } = fixture;
const utf8 = (text) => new TextEncoder().encode(text);

test("the golden wakeup preserves maximum SQL identity and the private v1 key framing", () => {
  assert.deepEqual(encodeNotification(envelope), { key: utf8(key), body: utf8(body) });
  assert.deepEqual(decodeNotification(utf8(body), utf8(key), false), envelope);
  for (const kind of ["operation_created", "result_selected", "cancelled", "recovery_fenced"]) {
    const record = encodeNotification({ ...envelope, kind });
    assert.deepEqual(record.key, utf8(key));
    assert.equal(decodeNotification(record.body, record.key, false).kind, kind);
  }
  const left = encodeNotification({ ...envelope, tenant_scope: "a:b", operation_id: "c" });
  const right = encodeNotification({ ...envelope, tenant_scope: "a", operation_id: "b:c" });
  assert.notDeepEqual(left.key, right.key);
});

test("versions, identity, kinds and reference-only fields are strict", () => {
  for (const patch of [
    { version: 1 },
    { version: "2" },
    { id: 7 },
    { id: "0" },
    { id: "-1" },
    { id: "01" },
    { id: "9223372036854775808" },
    { id: "10000000000000000000" },
    { tenant_scope: "café" },
    { operation_id: "x".repeat(129) },
    { kind: "released" },
    { credential: "secret" },
    { ciphertext: "payload" },
    { extra: "unknown" },
  ]) {
    const invalid = { ...envelope, ...patch };
    assert.throws(() => encodeNotification(invalid));
    const sorted = Object.fromEntries(Object.entries(invalid).sort());
    assert.throws(() => decodeNotification(utf8(JSON.stringify(sorted)), utf8(key), false));
  }
});

test("serialized framing rejects ambiguity, headers and excessive bytes before parsing", () => {
  const bytes = utf8(body);
  const partition = utf8(key);
  assert.throws(() => decodeNotification(bytes, utf8("11:tenant:eastop:42"), false));
  assert.throws(() => decodeNotification(bytes, partition, true), /headers/);
  assert.throws(() => decodeNotification(utf8(`{"id":"7",${body.slice(1)}`), partition, false));
  assert.throws(() => decodeNotification(utf8(` ${body}`), partition, false));
  assert.throws(() => decodeNotification(new Uint8Array([255]), partition, false));
  assert.throws(
    () => decodeNotification(new Uint8Array(64513 - partition.length), partition, false),
    /budget/,
  );
  assert.throws(() => decodeNotification(bytes, new Uint8Array(65537), false), /budget/);
});

test("published schema and interoperability vector are discoverable", () => {
  const directory = "generated/notifications/v2";
  const schema = JSON.parse(read(`${directory}/Notification.schema.json`));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.version.enum, [2]);
  const id = new RegExp(schema.properties.id.pattern);
  assert.ok(id.test(envelope.id));
  assert.ok(id.test("1"));
  assert.equal(id.test("9223372036854775808"), false);
  assert.equal(id.test("1\n"), false);
  assert.equal(read(`${directory}/vector.json`), read("fixtures/notifications/v2.json"));
});
