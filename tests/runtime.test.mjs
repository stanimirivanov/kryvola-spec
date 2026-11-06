import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Schema } from "effect";
import { decodeRuntime, RUNTIME_SCHEMAS } from "../dist/runtime.js";
import * as projection from "../tools/projection.mjs";
import { sha256 } from "../tools/provenance.mjs";

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

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const components = () => JSON.parse(read("openapi/runtime.schemas.json")).components.schemas;

test("OpenAPI owns HTTP bodies and the decoder is a checked projection", () => {
  const api = read("openapi/runtime.yaml");
  assert.doesNotMatch(api, /generated\/runtime\//);
  assert.match(api, /runtime\.schemas\.json#\/components\/schemas\//);
  assert.equal(projection.renderRuntime(components()), read("src/runtime.ts"));
});

test("all runtime wire schemas retain the pre-ownership bytes", () => {
  const baseline = JSON.parse(read("tests/fixtures/runtime-baseline.json"));
  assert.deepEqual(
    Object.keys(baseline).sort(),
    Object.keys(RUNTIME_SCHEMAS)
      .map((n) => `${n}.schema.json`)
      .sort(),
  );
  for (const [name, schema] of Object.entries(RUNTIME_SCHEMAS)) {
    const bytes = read(`generated/runtime/${name}.schema.json`);
    assert.equal(sha256(bytes), baseline[`${name}.schema.json`], name);
    assert.deepEqual(projection.toJsonSchema(schema), JSON.parse(bytes), name);
  }
});

test("OpenAPI changes drive decoding and unsupported constructs fail closed", async () => {
  const schemas = components();
  schemas.CreateUploadRequest.properties.byte_length.maximum = 1;
  const source = projection
    .renderRuntime(schemas)
    .replaceAll('"effect"', JSON.stringify(import.meta.resolve("effect")))
    .replaceAll(
      '"./control.js"',
      JSON.stringify(new URL("../dist/control.js", import.meta.url).href),
    );
  const declarations = source
    .slice(0, source.indexOf("const utf8 ="))
    .replace('import { assertControlBytes } from "./transport.js";', "");
  const { RUNTIME_SCHEMAS: changed } = await import(
    `data:text/javascript,${encodeURIComponent(declarations)}`
  );
  const request = { ...version, tenant_scope: "t", byte_length: 2 };
  assert.deepEqual(decode("CreateUploadRequest", request), request);
  assert.throws(() => Schema.decodeUnknownSync(changed.CreateUploadRequest)(request));
  for (const mutate of [
    (s) => {
      s.CreateUploadRequest.properties.byte_length.multipleOf = 2;
    },
    (s) => {
      s.CreateUploadRequest.additionalProperties = true;
    },
    (s) => {
      s.CreateUploadRequest.required.pop();
    },
    (s) => {
      s.CreateUploadRequest.properties.byte_length = { $ref: "https://untrusted.invalid/schema" };
    },
    (s) => {
      s.CreateUploadRequest = { $ref: "#/components/schemas/CreateUploadRequest" };
    },
  ]) {
    const invalid = components();
    mutate(invalid);
    assert.throws(() => projection.renderRuntime(invalid));
  }
});
