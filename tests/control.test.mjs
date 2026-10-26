import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Schema } from "effect";
import * as c from "../dist/control.js";
import { CONTRACT_VERSION } from "../dist/index.js";
import { renderControl, toJsonSchema } from "../tools/projection.mjs";
import { sha256 } from "../tools/provenance.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const json = (path) => JSON.parse(read(path));
const decode = (schema, input) =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input);
const { CONTROL_SCHEMAS: schemas, CONTROL_FIELD_NUMBERS: tags, controlFixtures: f } = c;

test("controls require every field, exact versions and metadata-only boundaries", () => {
  for (const [name, schema] of Object.entries(schemas)) {
    assert.deepEqual(decode(schema, f[name]), f[name]);
    for (const field of Object.keys(f[name])) {
      const missing = { ...f[name] };
      delete missing[field];
      assert.throws(() => decode(schema, missing), `${name}.${field}`);
    }
    for (const schema_version of ["2", 1, "01", "1\n"]) {
      assert.throws(() => decode(schema, { ...f[name], schema_version }));
    }
    for (const field of ["private_key", "capability", "bearer_token", "ciphertext", "url"]) {
      assert.throws(() => decode(schema, { ...f[name], [field]: "forbidden" }));
    }
  }
  for (const field of ["plan_ref", "key_context_ref", "disclosure_identity"]) {
    assert.throws(() =>
      c.decodeOperation({
        ...f.Operation,
        [field]: { ...f.Operation[field], private_key: "forbidden" },
      }),
    );
  }
  assert.throws(() =>
    c.decodeExecution({ ...f.Execution, attempt: { ...f.Attempt, bearer_token: "forbidden" } }),
  );
});

test("uint64 bounds are exact in Effect and exported JSON Schema", () => {
  const pattern = new RegExp(toJsonSchema(c.Uint64Decimal).pattern, "u");
  const max = 18446744073709551615n;
  const values = [0n, max - 1n, max, max + 1n, -1n];
  for (let n = 0n; n <= 20n; n++) {
    for (const delta of [-1n, 0n, 1n]) values.push(10n ** n + delta);
  }
  for (const number of values) {
    const value = String(number),
      valid = number >= 0n && number <= max;
    assert.equal(pattern.test(value), valid, value);
    if (valid) assert.equal(decode(c.Uint64Decimal, value), value);
    else assert.throws(() => decode(c.Uint64Decimal, value));
  }
  for (const value of [0, 1.5, "", "00", "01", "+1", "-0", "1e3", "1.0", " 1", "1\n"]) {
    assert.throws(() => decode(c.Uint64Decimal, value));
    if (typeof value === "string") assert.equal(pattern.test(value), false);
  }
  for (const [name, field] of [
    ["Operation", "workflow_epoch"],
    ["Operation", "deadline_unix_ms"],
    ["Attempt", "attempt_epoch"],
    ["Attempt", "fence"],
    ["Execution", "session_epoch"],
    ["KeyContextRef", "key_epoch"],
    ["DisclosureIdentity", "disclosure_index"],
  ]) {
    assert.throws(() => decode(schemas[name], { ...f[name], [field]: String(max + 1n) }));
  }
});

test("identifiers, commitments and tenant/job correlation fail closed", () => {
  for (const operation_id of ["", "x".repeat(129), "job\n", "https://host/path"]) {
    assert.throws(() => c.decodeOperation({ ...f.Operation, operation_id }));
  }
  for (const policy_digest of ["a".repeat(63), "A".repeat(64), `${"a".repeat(64)}\n`]) {
    assert.throws(() => c.decodeOperation({ ...f.Operation, policy_digest }));
  }
  for (const field of ["plan_ref", "key_context_ref", "disclosure_identity"]) {
    assert.throws(
      () =>
        c.decodeOperation({
          ...f.Operation,
          [field]: { ...f.Operation[field], tenant_scope: "other" },
        }),
      /tenant mismatch/,
    );
  }
  assert.throws(
    () =>
      c.decodeOperation({
        ...f.Operation,
        disclosure_identity: { ...f.DisclosureIdentity, logical_job_id: "other" },
      }),
    /job mismatch/,
  );
});

test("retry/launch identities remain separate from operation and disclosure identity", () => {
  const op = c.decodeOperation(f.Operation),
    before = structuredClone(op);
  for (const attempt_epoch of ["0", "1"]) {
    for (const execution_id of ["launch-1", "launch-2"]) {
      c.checkExecutionContext(op, {
        ...f.Execution,
        execution_id,
        attempt: { ...f.Attempt, attempt_epoch, fence: "2" },
      });
    }
  }
  assert.deepEqual(op, before);
  for (const field of ["tenant_scope", "operation_id", "workflow_epoch"]) {
    assert.throws(
      () =>
        c.checkExecutionContext(op, {
          ...f.Execution,
          attempt: { ...f.Attempt, [field]: field === "workflow_epoch" ? "1" : "other" },
        }),
      /mismatch/,
    );
  }
  assert.throws(
    () => c.checkExecutionContext(op, { ...f.Execution, deadline_unix_ms: "1" }),
    /deadline/,
  );
});

test("physical completion cannot be decoded as evidence or release status", () => {
  for (const status of [
    "COMPUTE_SELECTED",
    "EVIDENCE_PENDING",
    "EVIDENCE_VERIFIED",
    "RELEASED",
    "EVIDENCE_FAILED",
    "CANCELLED",
    "EXPIRED",
  ])
    assert.equal(decode(c.PublicResultStatus, status), status);
  for (const status of ["CREATED", "RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN", "RELEASED\n"]) {
    assert.throws(() => decode(c.PublicResultStatus, status));
  }
  for (const physical_state of ["RELEASED", "EVIDENCE_VERIFIED", "UNKNOWN"]) {
    assert.throws(() => c.decodeExecution({ ...f.Execution, physical_state }));
  }
});

test("generation pins schemas, fixtures, explicit presence/tags and provenance", () => {
  for (const [name, schema] of Object.entries({
    ...schemas,
    PublicResultStatus: c.PublicResultStatus,
    PhysicalExecutionState: c.PhysicalExecutionState,
  })) {
    assert.deepEqual(json(`generated/control/${name}.schema.json`), toJsonSchema(schema));
  }
  assert.deepEqual(json("generated/fixtures/control.json"), f);
  assert.equal(
    read("generated/proto/kryvola/spec/v1/control.proto").toString(),
    renderControl(schemas, tags),
  );
  assert.match(renderControl(schemas, tags), /optional string workflow_epoch = 5;/);
  assert.match(renderControl(schemas, tags), /Attempt attempt = 2;/);
  for (const tag of [0, 19000, 19999, 536870912, 1.5, 2]) {
    assert.throws(() =>
      renderControl(schemas, { ...tags, PlanRef: { ...tags.PlanRef, schema_version: tag } }),
    );
  }
  assert.throws(() =>
    renderControl({ Bad: Schema.Struct({ flag: Schema.Boolean }) }, { Bad: { flag: 1 } }),
  );
  const manifest = json("generated/manifest.json");
  assert.equal(manifest.contract_version, CONTRACT_VERSION);
  assert.equal(manifest.sources["src/control.ts"], sha256(read("src/control.ts")));
});
