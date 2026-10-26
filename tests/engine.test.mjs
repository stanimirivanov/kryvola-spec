import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Schema } from "effect";
import { CONTROL_SCHEMAS, PublicResultStatus } from "../dist/control.js";
import * as e from "../dist/engine.js";
import { ArtifactRef } from "../dist/index.js";
import {
  assertControlBytes,
  assertEventRecordBytes,
  assertTemporalCallBytes,
} from "../dist/transport.js";
import { renderControl, toJsonSchema } from "../tools/projection.mjs";
import { sha256 } from "../tools/provenance.mjs";

const f = e.engineFixtures;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
const target = {
  schema_version: "1",
  attempt: f.execute.execution.attempt,
  execution_id: f.execute.execution.execution_id,
};
const messages = {
  Capabilities: f.capabilities,
  GetCapabilitiesRequest: { schema_version: "1" },
  GetCapabilitiesResponse: { schema_version: "1", capabilities: f.capabilities },
  ExecuteRequest: f.execute,
  ExecuteResponse: { schema_version: "1", execution: f.execute.execution },
  GetExecutionStatusRequest: target,
  GetExecutionStatusResponse: f.observation,
  CancelExecutionRequest: { ...target, cancellation_id: "cancel-1" },
  CancelExecutionResponse: {
    ...target,
    cancellation_id: "cancel-1",
    cancellation_state: "REQUESTED",
  },
  ExecutionObservedEvent: f.event,
};
test("every RPC/event message requires fields, versions and reference-only metadata", () => {
  for (const [name, schema] of Object.entries(e.ENGINE_SCHEMAS)) {
    const value = messages[name];
    assert.deepEqual(decode(schema, value), value);
    for (const field of Object.keys(value)) {
      const missing = { ...value };
      delete missing[field];
      assert.throws(() => decode(schema, missing), `${name}.${field}`);
    }
    for (const extra of [
      { schema_version: "2" },
      { private_key: "secret" },
      { capability: "token" },
      { proof: "bytes" },
    ]) {
      assert.throws(() => decode(schema, { ...value, ...extra }));
    }
  }
  assert.throws(() => decode(e.ExecuteRequest, { ...f.execute, input_refs: [] }));
  assert.throws(() =>
    decode(e.ExecuteRequest, {
      ...f.execute,
      input_refs: Array(129).fill(f.execute.input_refs[0]),
    }),
  );
  assert.throws(() =>
    decode(e.ExecuteRequest, {
      ...f.execute,
      operation: { ...f.execute.operation, bearer_token: "secret" },
    }),
  );
});
test("reference negotiation rejects expired, unsupported or mismatched execution intent", () => {
  const validate = (changes = {}, caps = f.capabilities, now = "0") =>
    e.validateExecuteRequest({ ...f.execute, ...changes }, caps, now);
  assert.deepEqual(validate(), f.execute);
  for (const now of [f.execute.operation.deadline_unix_ms, "18446744073709551615"])
    assert.throws(() => validate({}, f.capabilities, now), /DEADLINE/);
  assert.throws(() => validate({ security_profile: "FHE-A1" }), /UNSUPPORTED_PROFILE/);
  for (const field of ["engine_digest", "parameter_set_digest", "program_digest"])
    assert.throws(() => validate({ [field]: "0".repeat(64) }), /Unsupported/);
  assert.throws(
    () => validate({ required_operators: ["MUL"] }, { ...f.capabilities, operators: ["ADD"] }),
    /Unsupported/,
  );
  assert.throws(
    () => validate({}, { ...f.capabilities, max_parallel_executions: "0" }),
    /UNAVAILABLE/,
  );
  for (const changes of [
    { session_epoch: "1" },
    { physical_state: "RUNNING" },
    { deadline_unix_ms: "1" },
  ]) {
    assert.throws(() => validate({ execution: { ...f.execute.execution, ...changes } }));
  }
  assert.throws(
    () => validate({ input_refs: [{ ...f.execute.input_refs[0], tenant_scope: "other" }] }),
    /tenant/,
  );
  assert.throws(
    () => validate({ input_refs: [{ ...f.execute.input_refs[0], byte_length: "1073741825" }] }),
    /1 GiB/,
  );
});
test("execution observations and events cannot establish public release", () => {
  assert.deepEqual(e.decodeExecutionEvent(f.event), f.event);
  for (const changes of [
    { error_code: "INTERNAL" },
    { output_refs: [] },
    { error_code: "UNKNOWN" },
  ])
    assert.throws(() => e.decodeExecutionObservation({ ...f.observation, ...changes }));
  assert.throws(() =>
    e.decodeExecutionObservation({
      ...f.observation,
      execution: { ...f.observation.execution, physical_state: "RUNNING" },
    }),
  );
  assert.throws(() =>
    e.decodeExecutionObservation({
      ...f.observation,
      output_refs: [{ ...f.observation.output_refs[0], tenant_scope: "other" }],
    }),
  );
  assert.throws(
    () =>
      e.decodeExecutionEvent({
        ...f.event,
        operation: { ...f.event.operation, workflow_epoch: "1" },
      }),
    /mismatch/,
  );
  assert.throws(() =>
    e.decodeExecutionEvent({ ...f.event, aggregate_sequence: "18446744073709551616" }),
  );
  assert.throws(() =>
    decode(e.CancelExecutionResponse, {
      ...messages.CancelExecutionResponse,
      cancellation_state: "CANCELLED",
    }),
  );
});
test("transport guards measure serialized byte views at and above every boundary", () => {
  const encoded = (n) => new TextEncoder().encode(JSON.stringify("x".repeat(n - 2)));
  for (const guard of [assertControlBytes, assertEventRecordBytes]) {
    guard(encoded(65536));
    assert.throws(() => guard(encoded(65537)), /64 KiB/);
    guard(new TextEncoder().encode(JSON.stringify("é".repeat(32767))));
    assert.throws(() => guard(new TextEncoder().encode(JSON.stringify("é".repeat(32768)))));
    assert.throws(() => guard({ byteLength: 1 }), /serialized/);
  }
  const payload = encoded(32768);
  assertTemporalCallBytes([payload, payload, payload, payload]);
  assert.throws(() => assertTemporalCallBytes([encoded(32769)]), /32 KiB/);
  assert.throws(
    () => assertTemporalCallBytes([payload, payload, payload, payload, new Uint8Array(1)]),
    /128 KiB/,
  );
  assert.throws(
    () => assertTemporalCallBytes([payload, payload, payload, payload], new Uint8Array(1)),
    /128 KiB/,
  );
  assertTemporalCallBytes([], new Uint8Array(131072));
  assert.throws(() => assertTemporalCallBytes([], new Uint8Array(131073)), /128 KiB/);
  assertControlBytes(new Uint8Array(65537).subarray(1));
});
test("exports preserve bounded lists, wire tags, RPCs, provenance and OpenAPI statuses", () => {
  for (const [name, schema] of Object.entries(e.ENGINE_SCHEMAS))
    assert.deepEqual(
      JSON.parse(read(`generated/engine/${name}.schema.json`)),
      toJsonSchema(schema),
    );
  const options = {
    externalSchemas: { ...CONTROL_SCHEMAS, ArtifactRef },
    imports: ["kryvola/spec/v1/artifact_ref.proto", "kryvola/spec/v1/control.proto"],
    methods: e.ENGINE_METHODS,
  };
  const wire = renderControl(e.ENGINE_SCHEMAS, e.ENGINE_FIELD_NUMBERS, options);
  assert.equal(read("generated/proto/kryvola/spec/v1/engine.proto").toString(), wire);
  assert.match(wire, /repeated ArtifactRef input_refs = 9;/);
  for (const method of e.ENGINE_METHODS)
    assert.ok(wire.includes(`rpc ${method}(${method}Request) returns (${method}Response);`));
  assert.throws(
    () =>
      renderControl(
        { Bad: Schema.Struct({ values: Schema.Array(Schema.Literal("x")) }) },
        { Bad: { values: 1 } },
      ),
    /bounded/,
  );
  assert.throws(
    () =>
      renderControl(e.ENGINE_SCHEMAS, e.ENGINE_FIELD_NUMBERS, { ...options, methods: ["Missing"] }),
    /Missing RPC/,
  );
  assert.deepEqual(JSON.parse(read("generated/fixtures/engine.json")), f);
  const manifest = JSON.parse(read("generated/manifest.json"));
  for (const path of ["src/engine.ts", "src/transport.ts"])
    assert.equal(manifest.sources[path], sha256(read(path)));
  const api = read("openapi/status.yaml").toString();
  const statuses = api
    .match(/enum:\s*\[([^\]]+)\]/)[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.deepEqual(statuses, toJsonSchema(PublicResultStatus).enum);
  assert.match(api, /"202":/);
});
