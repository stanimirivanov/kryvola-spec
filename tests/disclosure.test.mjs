import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { blake3 } from "@noble/hashes/blake3.js";
import {
  CANONICAL_V3_SCHEMAS,
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

const signedCorpus = () =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/canonical/approval-receipt-v3.json", import.meta.url),
      "utf8",
    ),
  );
const bytes = (hex) => Buffer.from(hex, "hex");
const signatureHeader = ({ signature, ...metadata }) => metadata;
const fixtureKey = (corpus) =>
  createPublicKey({
    key: bytes(`302a300506032b6570032100${corpus.public_key_hex}`),
    format: "der",
    type: "spki",
  });

test("v3 approval and receipt fixed vectors pin canonical bytes, preimages and Ed25519 signatures", () => {
  const corpus = signedCorpus(),
    key = fixtureKey(corpus);
  assert.equal(corpus.status, "UNRATIFIED_TEST_ONLY");
  assert.deepEqual(corpus.objects.map((v) => v.kind).sort(), ["approval", "receipt"]);
  for (const v of corpus.objects) {
    const payload = bytes(v.canonical_hex),
      metadata = signatureHeader(v.envelope);
    assert.equal(
      Buffer.from(canonicalBytes(v.kind, v.value, "3")).toString("hex"),
      v.canonical_hex,
    );
    assert.deepEqual(decodeCanonical(v.kind, payload, "3"), v.value);
    assert.equal(commitment(v.kind, v.value, "3"), v.digest);
    assert.equal(metadata.payload_digest, v.digest);
    const preimage = signaturePreimage(metadata, payload, "3");
    assert.equal(Buffer.from(preimage).toString("hex"), v.preimage_hex);
    assert.equal(
      verify(null, bytes(v.preimage_hex), key, Buffer.from(v.envelope.signature, "base64url")),
      true,
    );
    assert.deepEqual(
      decodeCanonical("signature", canonicalBytes("signature", v.envelope, "3"), "3"),
      v.envelope,
    );
    assert.throws(() => canonicalBytes("signature", metadata, "3"));
    const tampered = Buffer.from(v.envelope.signature, "base64url");
    tampered[0] ^= 1;
    assert.equal(verify(null, preimage, key, tampered), false);
  }
});

function substitute(field, value) {
  if (Array.isArray(value))
    return value.length ? [substitute("digest", value[0]), ...value.slice(1)] : ["b".repeat(64)];
  if (/^[0-9a-f]{64}$/.test(value)) return (value[0] === "a" ? "b" : "a") + value.slice(1);
  if (/^[0-9]+$/.test(value))
    return String(
      BigInt(value) === 18446744073709551615n ? BigInt(value) - 1n : BigInt(value) + 1n,
    );
  if (field === "subject_kind") return value === "plan" ? "manifest" : "plan";
  if (field === "purpose") return value === "COMPUTE" ? "RELEASE" : "COMPUTE";
  if (field === "evidence_status") return value === "PENDING" ? "NOT_REQUESTED" : "PENDING";
  return `${value}-other`;
}

test("every declared approval and receipt field is required and cryptographically bound", () => {
  const corpus = signedCorpus(),
    key = fixtureKey(corpus);
  const fixed = new Set(["schema_version", "object_type", "disclosure_index", "assurance"]);
  for (const v of corpus.objects) {
    assert.deepEqual(
      Object.keys(v.value).sort(),
      Object.keys(CANONICAL_V3_SCHEMAS[v.kind].fields).sort(),
    );
    const metadata = signatureHeader(v.envelope);
    for (const field of Object.keys(v.value)) {
      const { [field]: omitted, ...incomplete } = v.value;
      assert.notEqual(omitted, undefined);
      assert.throws(() => canonicalBytes(v.kind, incomplete, "3"), `${v.kind}.${field} omission`);
      const changed = { ...v.value, [field]: substitute(field, v.value[field]) };
      if (fixed.has(field)) {
        assert.throws(() => canonicalBytes(v.kind, changed, "3"), `${v.kind}.${field} literal`);
        continue;
      }
      const payload = canonicalBytes(v.kind, changed, "3");
      assert.notEqual(commitment(v.kind, changed, "3"), v.digest, field);
      assert.throws(
        () => signaturePreimage(metadata, payload, "3"),
        /payload digest mismatch/,
        field,
      );
      const rebound = { ...metadata, payload_digest: commitment(v.kind, changed, "3") };
      assert.equal(
        verify(
          null,
          signaturePreimage(rebound, payload, "3"),
          key,
          Buffer.from(v.envelope.signature, "base64url"),
        ),
        false,
        field,
      );
    }
  }
});

test("approval and receipt signatures bind all header fields and their versioned kind", () => {
  const corpus = signedCorpus(),
    key = fixtureKey(corpus);
  for (const v of corpus.objects) {
    const payload = bytes(v.canonical_hex),
      metadata = signatureHeader(v.envelope);
    for (const field of Object.keys(metadata)) {
      const { [field]: omitted, ...incomplete } = metadata;
      assert.notEqual(omitted, undefined);
      assert.throws(() => signaturePreimage(incomplete, payload, "3"), field);
      const replacement =
        field === "payload_kind"
          ? v.kind === "approval"
            ? "receipt"
            : "approval"
          : substitute(field, metadata[field]);
      const changed = { ...metadata, [field]: replacement };
      if (["algorithm", "schema_version", "payload_kind", "payload_digest"].includes(field)) {
        assert.throws(() => signaturePreimage(changed, payload, "3"), field);
      } else {
        assert.equal(
          verify(
            null,
            signaturePreimage(changed, payload, "3"),
            key,
            Buffer.from(v.envelope.signature, "base64url"),
          ),
          false,
          field,
        );
      }
    }
    for (const version of ["1", "2"]) {
      assert.throws(() => decodeCanonical(v.kind, payload, version));
      assert.throws(() => signaturePreimage(metadata, payload, version));
    }
    assert.throws(() =>
      decodeCanonical(v.kind === "approval" ? "receipt" : "approval", payload, "3"),
    );
  }
});

test("approval and receipt reject duplicate, escaped, reordered and noncanonical encodings", () => {
  for (const v of signedCorpus().objects) {
    const canonical = bytes(v.canonical_hex),
      text = canonical.toString("utf8");
    const reordered = Object.fromEntries(
      Object.entries(v.value).sort(([a], [b]) => b.localeCompare(a)),
    );
    assert.deepEqual(canonicalBytes(v.kind, reordered, "3"), new Uint8Array(canonical));
    const duplicate = text.replace("{", '{"schema_version":"3",');
    const escaped = text.replace('"tenant_scope"', String.raw`"tenant_\u0073cope"`);
    // Standard JSON decoding yields identical values; the canonical parser must still reject.
    assert.deepEqual(JSON.parse(duplicate), v.value);
    assert.deepEqual(JSON.parse(escaped), v.value);
    for (const raw of [
      Buffer.from(` ${text}`),
      Buffer.from(`${text}\n`),
      Buffer.from(JSON.stringify(reordered)),
      Buffer.from(duplicate),
      Buffer.from(escaped),
      Buffer.from(text.replace('"workflow_epoch":"1"', '"workflow_epoch":1')),
      Buffer.concat([Buffer.from([239, 187, 191]), canonical]),
      Buffer.from([255]),
    ])
      assert.throws(() => decodeCanonical(v.kind, raw, "3"), `${v.kind}: ${raw.subarray(0, 32)}`);
    for (const [field, value] of Object.entries(v.value)) {
      if (Array.isArray(value) && value.length > 1)
        assert.throws(
          () =>
            signaturePreimage(
              signatureHeader(v.envelope),
              canonicalBytes(v.kind, { ...v.value, [field]: [...value].reverse() }, "3"),
              "3",
            ),
          /payload digest mismatch/,
        );
    }
    assert.throws(() => canonicalBytes(v.kind, { ...v.value, unknown: "x" }, "3"));
    assert.throws(() => canonicalBytes(v.kind, { ...v.value, tenant_scope: "\ud800" }, "3"));
  }
});
