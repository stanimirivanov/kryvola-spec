import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import canonicalize from "canonicalize";
import { Effect, Result } from "effect";
import { decodeCanonical } from "../dist/canonical.js";
import { controlFixtures, decodeOperation } from "../dist/control.js";
import {
  decodeCanonicalEffect,
  decodeOperationEffect,
  ReferenceValidationError,
} from "../dist/index.js";

const json = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/canonical/${name}.json`, import.meta.url)));
const text = (value) => new TextEncoder().encode(value);
const run = (effect) => Effect.runSync(Effect.result(effect));
function safeFailure(effect, code) {
  const result = run(effect);
  assert.ok(Result.isFailure(result)); // A defect would escape Effect.result/runSync.
  const error = result.failure;
  assert.ok(error instanceof ReferenceValidationError);
  assert.equal(error._tag, "ReferenceValidationError");
  assert.equal(error.code, code);
  assert.equal(error.message, "Reference validation failed");
  assert.equal("cause" in error, false);
  for (const representation of [error.message, String(error), JSON.stringify(error), error.stack]) {
    assert.equal(representation.includes("TOKEN_X"), false);
  }
  return error;
}

test("operation facade preserves successful values and runs semantic correlation checks", () => {
  const input = structuredClone(controlFixtures.Operation);
  assert.deepEqual(Effect.runSync(decodeOperationEffect(input)), decodeOperation(input));
  for (const field of ["plan_ref", "key_context_ref", "disclosure_identity"]) {
    const invalid = structuredClone(input);
    invalid[field].tenant_scope = "TOKEN_X";
    safeFailure(decodeOperationEffect(invalid), "INVALID_OPERATION");
  }
  const invalid = structuredClone(input);
  invalid.disclosure_identity.logical_job_id = "TOKEN_X";
  safeFailure(decodeOperationEffect(invalid), "INVALID_OPERATION");
  safeFailure(decodeOperationEffect({ ...input, workflow_epoch: "TOKEN_X" }), "INVALID_OPERATION");
  safeFailure(decodeOperationEffect({ ...input, extra: "TOKEN_X" }), "INVALID_OPERATION");
  const flipped = Effect.runSync(Effect.flip(decodeOperationEffect(null)));
  assert.equal(flipped.code, "INVALID_OPERATION");
});

test("canonical facade preserves all v1/v2 golden objects and signature envelopes", () => {
  for (const [name, version] of [
    ["corpus", "1"],
    ["modular-v2", "2"],
  ]) {
    for (const vector of json(name).objects) {
      const bytes = Buffer.from(vector.canonical_hex, "hex");
      assert.deepEqual(
        Effect.runSync(decodeCanonicalEffect(vector.kind, bytes, version)),
        decodeCanonical(vector.kind, bytes, version),
      );
      if (vector.envelope) {
        assert.deepEqual(
          Effect.runSync(
            decodeCanonicalEffect("signature", text(canonicalize(vector.envelope)), version),
          ),
          vector.envelope,
        );
      }
    }
  }
});

test("canonical failures are typed and sanitized across parsing, bounds and semantic phases", () => {
  for (const vector of json("negative")) {
    safeFailure(
      decodeCanonicalEffect(vector.kind, Buffer.from(vector.bytes_hex, "hex"), "1"),
      "INVALID_CANONICAL",
    );
  }
  for (const vector of json("modular-v2").negative) {
    safeFailure(
      decodeCanonicalEffect(vector.kind, Buffer.from(vector.bytes_hex, "hex"), "2"),
      "INVALID_CANONICAL",
    );
  }
  for (const bytes of [
    text("TOKEN_X"),
    new Uint8Array([255]),
    new Uint8Array(1048577),
    text("[".repeat(17)),
    text('{"TOKEN_X":"TOKEN_X"}'),
  ]) {
    safeFailure(decodeCanonicalEffect("plan", bytes, "1"), "INVALID_CANONICAL");
  }
  const plan = structuredClone(json("modular-v2").objects.find((v) => v.kind === "plan").value);
  plan.parameters.radix_bits = "16"; // Structurally valid, but inconsistent with uint8.
  safeFailure(decodeCanonicalEffect("plan", text(canonicalize(plan)), "2"), "INVALID_CANONICAL");
  const validBytes = Buffer.from(
    json("corpus").objects.find((v) => v.kind === "plan").canonical_hex,
    "hex",
  );
  safeFailure(decodeCanonicalEffect("TOKEN_X", validBytes, "1"), "INVALID_CANONICAL");
  safeFailure(decodeCanonicalEffect("plan", validBytes, "TOKEN_X"), "INVALID_CANONICAL");
  safeFailure(decodeCanonicalEffect("receipt", validBytes, "2"), "INVALID_CANONICAL");
  assert.throws(() => decodeCanonical("plan", text("TOKEN_X")), SyntaxError);
});

test("facades defer validation until execution and revalidate on every execution", () => {
  const input = structuredClone(controlFixtures.Operation);
  const pending = decodeOperationEffect(input);
  input.disclosure_identity.logical_job_id = "TOKEN_X";
  safeFailure(pending, "INVALID_OPERATION");
  input.disclosure_identity.logical_job_id = input.logical_job_id;
  assert.ok(Result.isSuccess(run(pending)));
  const bytes = Buffer.from(
    json("corpus").objects.find((v) => v.kind === "plan").canonical_hex,
    "hex",
  );
  const canonical = decodeCanonicalEffect("plan", bytes, "1");
  const firstByte = bytes[0];
  bytes[0] = 255;
  safeFailure(canonical, "INVALID_CANONICAL");
  bytes[0] = firstByte;
  assert.ok(Result.isSuccess(run(canonical)));
});
