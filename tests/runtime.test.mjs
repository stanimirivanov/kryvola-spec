import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeRuntime, RUNTIME_SCHEMAS } from "../dist/runtime.js";

const digest = "a".repeat(64);
const version = { schema_version: "1" };
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const decode = (name, value) => decodeRuntime(name, encode(value));

test("upload admission is bounded and excludes credentials and bytes", () => {
  const request = { ...version, tenant_scope: "tenant-1", byte_length: 1073741824 };
  assert.deepEqual(decode("CreateUploadRequest", request), request);
  for (const extra of [{ ciphertext: "abc" }, { credentials: "abc" }, { byte_length: 1073741825 }])
    assert.throws(() => decode("CreateUploadRequest", { ...request, ...extra }));
  assert.throws(() => decodeRuntime("CreateUploadRequest", new Uint8Array(65537)), /64 KiB/);
});

test("pending cancellation has no committed fence", () => {
  const pending = { ...version, outcome: "CANCELLATION_PENDING" };
  const committed = { ...version, outcome: "CANCELLED", fence: "2" };
  assert.deepEqual(decode("CancelOperationResponse", pending), pending);
  assert.deepEqual(decode("CancelOperationResponse", committed), committed);
  assert.throws(() => decode("CancelOperationResponse", { ...pending, fence: "2" }));
  assert.throws(() => decode("CancelOperationResponse", { ...version, outcome: "CANCELLED" }));
});

test("expired attempt and idempotency conflict are distinct error codes", () => {
  for (const code of ["ATTEMPT_EXPIRED", "IDEMPOTENCY_CONFLICT"])
    assert.deepEqual(decode("RuntimeError", { ...version, code }), { ...version, code });
});

test("result selection accepts a digest and rejects nested bulk data", () => {
  const attempt = {
    ...version,
    tenant_scope: "t",
    operation_id: "op",
    workflow_epoch: "1",
    attempt_epoch: "1",
    fence: "2",
  };
  const request = { ...version, attempt, execution_id: "exec", output_manifest_digest: digest };
  assert.deepEqual(decode("SelectResultRequest", request), request);
  assert.throws(() =>
    decode("SelectResultRequest", { ...request, attempt: { ...attempt, key: "x" } }),
  );
});

test("all runtime contracts are generated outside existing wire projections", () => {
  for (const name of Object.keys(RUNTIME_SCHEMAS)) {
    const schema = JSON.parse(
      readFileSync(new URL(`../generated/runtime/${name}.schema.json`, import.meta.url), "utf8"),
    );
    assert.ok(schema.$schema);
  }
});
