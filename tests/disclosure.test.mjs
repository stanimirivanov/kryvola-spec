import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { blake3 } from "@noble/hashes/blake3.js";
import {
  canonicalBytes,
  commitment,
  decodeCanonical,
  disclosureId,
  signaturePreimage,
} from "../dist/canonical.js";

const vector = JSON.parse(
  readFileSync(new URL("../fixtures/canonical/disclosure-v3.json", import.meta.url), "utf8"),
);
const { identity, authorization, header } = vector;
const kind = "release-authorization";
const encode = (value) => canonicalBytes(kind, value, "3");

test("v3 golden vector pins canonical bytes, domain separation, and framing", () => {
  assert.equal(Buffer.from(encode(authorization)).toString(), vector.canonical_utf8);
  assert.equal(commitment(kind, authorization, "3"), header.payload_digest);
  assert.equal(disclosureId(identity), vector.disclosure_id);
  const preimage = signaturePreimage(header, encode(authorization), "3");
  assert.equal(Buffer.from(blake3(preimage)).toString("hex"), vector.preimage_blake3);
});
test("release authorization binds every required field and rejects old formats", () => {
  const bytes = encode(authorization);
  assert.deepEqual(decodeCanonical(kind, bytes, "3"), authorization);
  assert.throws(() => decodeCanonical(kind, bytes, "1"));
  assert.throws(() => decodeCanonical(kind, bytes, "2"));
  for (const key of Object.keys(authorization)) {
    const { [key]: omitted, ...rest } = authorization;
    assert.ok(omitted);
    assert.throws(() => encode(rest), key);
  }
  assert.throws(() => encode({ ...authorization, disclosure_index: "1" }));
  assert.throws(() => encode({ ...authorization, expires_unix_ms: "100" }));
  assert.throws(() => decodeCanonical(kind, Buffer.concat([bytes, Buffer.from(" ")]), "3"));
});
test("substitution cannot reuse the original signed payload digest", () => {
  const signed = { ...header, payload_digest: commitment(kind, authorization, "3") };
  assert.ok(signaturePreimage(signed, encode(authorization), "3").length);
  for (const [key, value] of Object.entries({
    recipient: "other",
    output_manifest_digest: "b".repeat(64),
    workflow_epoch: "2",
    attempt_epoch: "4",
    fence: "6",
    policy_epoch: "5",
    consent_digest: "b".repeat(64),
  })) {
    assert.throws(
      () => signaturePreimage(signed, encode({ ...authorization, [key]: value }), "3"),
      /payload digest mismatch/,
    );
  }
});
test("the disclosure ledger key is scoped to the stable tuple", () => {
  const key = disclosureId(identity);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, disclosureId({ ...identity, recipient: "other" }));
  assert.throws(() => disclosureId({ ...identity, workflow_epoch: "2" }));
});

test("v3 approval and receipt bind current policy and workload without changing v1", () => {
  const corpus = JSON.parse(
    readFileSync(new URL("../fixtures/canonical/corpus.json", import.meta.url), "utf8"),
  );
  for (const kind of ["approval", "receipt"]) {
    const legacy = corpus.objects.find((item) => item.kind === kind).value;
    const next = {
      ...legacy,
      schema_version: "3",
      workflow_epoch: "1",
      policy_epoch: "2",
      policy_digest: authorization.policy_digest,
      consent_digest: authorization.consent_digest,
      model_digest: authorization.model_digest,
      ...(kind === "approval"
        ? {
            output_stage: "output",
            disclosure_index: "0",
            operation_id: "op",
            session_epoch: "1",
            program_digest: authorization.program_digest,
            evidence_policy_digest: authorization.evidence_policy_digest,
          }
        : { assurance: "CONFIDENTIALITY_ONLY" }),
    };
    assert.deepEqual(decodeCanonical(kind, canonicalBytes(kind, next, "3"), "3"), next);
    const { policy_epoch: omitted, ...incomplete } = next;
    assert.ok(omitted);
    assert.throws(() => canonicalBytes(kind, incomplete, "3"));
    assert.throws(() => canonicalBytes(kind, next, "1"));
    assert.doesNotThrow(() => canonicalBytes(kind, legacy));
  }
});
