import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Schema } from "effect";
import {
  canonicalBytes,
  commitment,
  decodeCanonical,
  signaturePreimage,
} from "../dist/canonical.js";
import { engineFixtures, validatePlannedExecuteRequest } from "../dist/engine.js";
import { FheQ1Arithmetic, FheQ1Operator, FheQ1Precision } from "../dist/fhe-q1.js";

const corpus = JSON.parse(
  readFileSync(new URL("../fixtures/canonical/modular-v2.json", import.meta.url)),
);
const legacy = JSON.parse(
  readFileSync(new URL("../fixtures/canonical/corpus.json", import.meta.url)),
);
const plan = corpus.objects.find((v) => v.kind === "plan").value;
const encode = (value) => canonicalBytes("plan", value, "2");
function intent(value = plan) {
  const request = structuredClone(engineFixtures.execute);
  request.operation.plan_ref.plan_digest = commitment("plan", value, "2");
  request.required_operators = value.operators;
  request.input_refs[0].manifest_digest = value.input_manifest_digests[0];
  return request;
}

test("modular v2 has fixed canonical, commitment and signature vectors without changing v1", () => {
  const key = createPublicKey({
    key: Buffer.from(`302a300506032b6570032100${corpus.public_key_hex}`, "hex"),
    format: "der",
    type: "spki",
  });
  for (const vector of corpus.objects) {
    const raw = Buffer.from(vector.canonical_hex, "hex");
    assert.deepEqual(canonicalBytes(vector.kind, vector.value, "2"), new Uint8Array(raw));
    assert.deepEqual(decodeCanonical(vector.kind, raw, "2"), vector.value);
    assert.equal(commitment(vector.kind, vector.value, "2"), vector.digest);
    const { signature, ...header } = vector.envelope;
    const preimage = signaturePreimage(header, raw, "2");
    assert.equal(Buffer.from(preimage).toString("hex"), vector.preimage_hex);
    assert.equal(verify(null, preimage, key, Buffer.from(signature, "base64url")), true);
    assert.deepEqual(
      decodeCanonical("signature", canonicalBytes("signature", vector.envelope, "2"), "2"),
      vector.envelope,
    );
    assert.throws(() => decodeCanonical(vector.kind, raw));
    assert.throws(() => signaturePreimage(header, raw));
    assert.throws(() => decodeCanonical(vector.kind, Buffer.from(` ${raw.toString()}`), "2"));
    assert.throws(() => canonicalBytes(vector.kind, { ...vector.value, unknown: "x" }, "2"));
    const old = legacy.objects.find((v) => v.kind === vector.kind);
    assert.equal(commitment(vector.kind, old.value), old.digest);
    assert.throws(() => decodeCanonical(vector.kind, Buffer.from(old.canonical_hex, "hex"), "2"));
    assert.throws(() => signaturePreimage({ ...header, schema_version: "1" }, raw, "2"));
    const wrongDomain = Buffer.from(preimage);
    const versionOffset = wrongDomain.indexOf(Buffer.from("/v2\0")) + 2;
    assert.ok(versionOffset > 1);
    wrongDomain[versionOffset] = 49;
    assert.equal(verify(null, wrongDomain, key, Buffer.from(signature, "base64url")), false);
  }
  assert.throws(() =>
    canonicalBytes("receipt", legacy.objects.find((v) => v.kind === "receipt").value, "2"),
  );
  assert.throws(() => canonicalBytes("plan", plan, "3"));
  for (const vector of corpus.negative)
    assert.throws(
      () => decodeCanonical(vector.kind, Buffer.from(vector.bytes_hex, "hex"), "2"),
      vector.name,
    );
});

test("every v2 operator constructs Engine intent under the shared arithmetic contract", () => {
  assert.deepEqual(plan.operators, engineFixtures.capabilities.operators);
  Schema.decodeUnknownSync(FheQ1Arithmetic)(plan.arithmetic);
  Schema.decodeUnknownSync(FheQ1Precision)(plan.precision);
  for (const operators of [["ADD"], ["MUL"], ["ADD", "MUL"]]) {
    const value = { ...plan, operators };
    const request = intent(value);
    assert.deepEqual(
      validatePlannedExecuteRequest(encode(value), request, engineFixtures.capabilities, "0"),
      request,
    );
  }
  const reordered = intent();
  reordered.required_operators = ["MUL", "ADD"];
  assert.doesNotThrow(() =>
    validatePlannedExecuteRequest(encode(plan), reordered, engineFixtures.capabilities, "0"),
  );
  for (const change of [
    { operators: ["MUL_CLEAR"] },
    { operators: ["ADD", "ADD"] },
    { arithmetic: "CHECKED" },
    { precision: { ...plan.precision, overflow: "REJECT" } },
    { schema_version: "3" },
  ])
    assert.throws(() => encode({ ...plan, ...change }));
  assert.throws(() =>
    validatePlannedExecuteRequest(
      Buffer.from(legacy.objects.find((v) => v.kind === "plan").canonical_hex, "hex"),
      intent(),
      engineFixtures.capabilities,
      "0",
    ),
  );
});

test("plan-to-Engine validation rejects context, input-order and capability substitution", () => {
  for (const mutate of [
    (r) => {
      r.required_operators = ["ADD"];
    },
    (r) => {
      r.required_operators = ["ADD", "ADD"];
    },
    (r) => {
      r.operation.plan_ref.plan_digest = "a".repeat(64);
    },
    (r) => {
      r.operation.key_context_ref.key_context_digest = "a".repeat(64);
    },
    (r) => {
      r.output_contract_digest = "a".repeat(64);
    },
    (r) => {
      r.resource_profile_digest = "a".repeat(64);
    },
    (r) => {
      r.input_refs[0].manifest_digest = "a".repeat(64);
    },
  ]) {
    const request = intent();
    mutate(request);
    assert.throws(() =>
      validatePlannedExecuteRequest(encode(plan), request, engineFixtures.capabilities, "0"),
    );
  }
  for (const change of [
    { engine_digest: "a".repeat(64) },
    { program_digest: "a".repeat(64) },
    { tenant_scope: "other" },
    { parameters: { ...plan.parameters, parameter_set_digest: "a".repeat(64) } },
  ]) {
    const changed = { ...plan, ...change };
    assert.throws(() =>
      validatePlannedExecuteRequest(
        encode(changed),
        intent(changed),
        engineFixtures.capabilities,
        "0",
      ),
    );
  }
  for (const change of [
    { operators: ["ADD"] },
    { arithmetic: "CHECKED" },
    { max_parallel_executions: "0" },
  ])
    assert.throws(() =>
      validatePlannedExecuteRequest(
        encode(plan),
        intent(),
        { ...engineFixtures.capabilities, ...change },
        "0",
      ),
    );
  assert.throws(() =>
    validatePlannedExecuteRequest(
      encode(plan),
      intent(),
      engineFixtures.capabilities,
      "18446744073709551615",
    ),
  );
  const orderedPlan = {
    ...plan,
    input_manifest_digests: [plan.input_manifest_digests[0], "d".repeat(64)],
  };
  const orderedRequest = intent(orderedPlan);
  orderedRequest.input_refs.push({
    ...orderedRequest.input_refs[0],
    manifest_digest: "d".repeat(64),
  });
  assert.doesNotThrow(() =>
    validatePlannedExecuteRequest(
      encode(orderedPlan),
      orderedRequest,
      engineFixtures.capabilities,
      "0",
    ),
  );
  orderedRequest.input_refs.reverse();
  assert.throws(() =>
    validatePlannedExecuteRequest(
      encode(orderedPlan),
      orderedRequest,
      engineFixtures.capabilities,
      "0",
    ),
  );
});

test("plaintext contract oracle wraps operation overflow but rejects out-of-range operands", () => {
  // Test oracle only: no ciphertext evaluation or engine qualification is performed.
  const evaluate = (dtype, operator, left, right) => {
    Schema.decodeUnknownSync(FheQ1Precision)({ dtype, fractional_bits: "0", overflow: "WRAP" });
    Schema.decodeUnknownSync(FheQ1Operator)(operator);
    const modulus = 1n << BigInt(dtype.slice(4)),
      a = BigInt(left),
      b = BigInt(right);
    if (a < 0n || b < 0n || a >= modulus || b >= modulus) throw new Error("input range");
    return String((operator === "ADD" ? a + b : a * b) % modulus);
  };
  for (const v of corpus.arithmetic_cases)
    assert.equal(evaluate(v.dtype, v.operator, v.left, v.right), v.result);
  for (const width of [8, 16, 32, 64]) {
    const dtype = `uint${width}`,
      modulus = 1n << BigInt(width);
    for (const operator of ["ADD", "MUL"]) {
      assert.throws(() => evaluate(dtype, operator, "-1", "0"));
      assert.throws(() => evaluate(dtype, operator, String(modulus), "0"));
      const changed = {
        ...plan,
        precision: { ...plan.precision, dtype },
        parameters: { ...plan.parameters, radix_bits: String(width) },
      };
      assert.doesNotThrow(() => encode(changed));
    }
  }
  assert.throws(() => evaluate("uint8", "MUL_CLEAR", "1", "2"));
  assert.throws(() => encode({ ...plan, parameters: { ...plan.parameters, radix_bits: "16" } }));
});
