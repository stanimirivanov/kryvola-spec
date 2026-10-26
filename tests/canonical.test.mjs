import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { blake3 } from "@noble/hashes/blake3.js";
import canonicalize from "canonicalize";
import {
  blobDigest,
  CANONICAL_SCHEMAS,
  canonicalBytes,
  chunkDigest,
  commitment,
  decodeCanonical,
  operationId,
  signaturePreimage,
  uint64le,
} from "../dist/canonical.js";

const corpus = JSON.parse(
  readFileSync(new URL("../fixtures/canonical/corpus.json", import.meta.url)),
);
const negative = JSON.parse(
  readFileSync(new URL("../fixtures/canonical/negative.json", import.meta.url)),
);
const hex = (bytes) => Buffer.from(bytes).toString("hex");
const bytes = (text) => Buffer.from(text, "utf8");
const item = (kind) => corpus.objects.find((object) => object.kind === kind);
const header = (envelope) => {
  const { signature, ...rest } = envelope;
  return rest;
};
const publicKey = createPublicKey({
  key: Buffer.from(`302a300506032b6570032100${corpus.public_key_hex}`, "hex"),
  format: "der",
  type: "spki",
});

test("fixed corpus pins all closed canonical kinds, JCS bytes, BLAKE3 and Ed25519 framing", () => {
  assert.deepEqual(
    corpus.objects.map(({ kind }) => kind).sort(),
    Object.keys(CANONICAL_SCHEMAS).sort(),
  );
  // Independent upstream known answer, not a Kryvola-generated expected digest.
  assert.equal(
    hex(blake3(new Uint8Array())),
    "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
  );
  assert.equal(
    verify(
      null,
      new Uint8Array(),
      publicKey,
      Buffer.from(
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
        "hex",
      ),
    ),
    true,
  );
  for (const vector of corpus.objects) {
    assert.equal(hex(canonicalBytes(vector.kind, vector.value)), vector.canonical_hex);
    assert.deepEqual(
      decodeCanonical(vector.kind, Buffer.from(vector.canonical_hex, "hex")),
      vector.value,
    );
    assert.equal(commitment(vector.kind, vector.value), vector.digest);
    if (vector.envelope) {
      const preimage = signaturePreimage(
        header(vector.envelope),
        Buffer.from(vector.canonical_hex, "hex"),
      );
      assert.equal(hex(preimage), vector.preimage_hex);
      assert.equal(
        verify(null, preimage, publicKey, Buffer.from(vector.envelope.signature, "base64url")),
        true,
      );
      assert.deepEqual(
        decodeCanonical("signature", canonicalBytes("signature", vector.envelope)),
        vector.envelope,
      );
    }
    assert.throws(() => canonicalBytes(vector.kind, { ...vector.value, unknown: "x" }));
    assert.throws(() => canonicalBytes(vector.kind, { ...vector.value, schema_version: "2" }));
    assert.throws(() =>
      canonicalBytes(vector.kind, { ...vector.value, tenant_scope: "other tenant" }),
    );
  }
});

test("raw-byte corpus rejects duplicates, numeric values, malformed Unicode and noncanonical encodings", () => {
  for (const vector of negative)
    assert.throws(
      () => decodeCanonical(vector.kind, Buffer.from(vector.bytes_hex, "hex")),
      vector.name,
    );
  const value = item("plan").value;
  assert.throws(() => canonicalBytes("plan", { ...value, display_name: "\ud800" }));
  assert.doesNotThrow(() => canonicalBytes("plan", { ...value, display_name: "😀".repeat(256) }));
  assert.throws(() => canonicalBytes("plan", { ...value, display_name: "😀".repeat(257) }));
  assert.throws(() => canonicalBytes("plan", { ...value, input_shape: [1] }));
  assert.throws(() => decodeCanonical("plan", bytes("[".repeat(17) + "]".repeat(17))), /depth/);
  assert.throws(() => decodeCanonical("plan", new Uint8Array(1048577)), /size/);
  assert.throws(() => canonicalBytes("plan", { ...value, input_shape: ["1048577"] }), /shape/);
  assert.throws(() => canonicalBytes("plan", { ...value, input_shape: ["0"] }), /dimension/);
  const approval = item("approval").value;
  assert.throws(
    () => canonicalBytes("approval", { ...approval, expires_unix_ms: "0" }),
    /interval/,
  );
  assert.throws(() =>
    canonicalBytes("approval", { ...approval, expires_unix_ms: "18446744073709551616" }),
  );
  assert.throws(() =>
    canonicalBytes("signature", { ...item("plan").envelope, signature: "A".repeat(85) + "B" }),
  );
});

test("restricted JCS preserves Unicode without normalization and orders UTF-16 code units", () => {
  assert.equal(canonicalize({ "\ue000": "x", "😀": "y", é: "z" }), '{"é":"z","😀":"y","":"x"}');
  const plan = item("plan").value;
  assert.notEqual(
    commitment("plan", { ...plan, display_name: "é" }),
    commitment("plan", { ...plan, display_name: "e\u0301" }),
  );
  assert.equal(
    canonicalize({ b: '\n\t"\\', a: "18446744073709551615" }),
    '{"a":"18446744073709551615","b":"\\n\\t\\\"\\\\"}',
  );
  assert.equal(hex(uint64le("18446744073709551615")), "ffffffffffffffff");
  assert.equal(hex(uint64le("256")), "0001000000000000");
  for (const value of ["01", "-1", "1\n", "18446744073709551616"])
    assert.throws(() => uint64le(value));
});

test("chunk framing binds index, length and exact bytes; manifest binds order and totals", () => {
  const chunk = Buffer.from(corpus.chunk.bytes_hex, "hex");
  assert.equal(chunkDigest(corpus.chunk.index, chunk), corpus.chunk.digest);
  assert.equal(blobDigest(chunk), corpus.chunk.blob_digest);
  assert.notEqual(chunkDigest("1", chunk), corpus.chunk.digest);
  assert.notEqual(chunkDigest("0", chunk.subarray(0, 3)), corpus.chunk.digest);
  assert.notEqual(chunkDigest("0", Buffer.from("000102fe", "hex")), corpus.chunk.digest);
  assert.throws(() => chunkDigest("0", new Uint8Array()));
  assert.doesNotThrow(() => chunkDigest("0", new Uint8Array(4194304)));
  assert.throws(() => chunkDigest("0", new Uint8Array(4194305)));
  const original = item("manifest").value;
  for (const change of [
    { byte_offset: "1" },
    { index: "1" },
    { byte_length: "0" },
    { byte_length: "4194305" },
  ]) {
    assert.throws(() =>
      canonicalBytes("manifest", {
        ...original,
        ordered_chunk_entries: [{ ...original.ordered_chunk_entries[0], ...change }],
      }),
    );
  }
  const entries = Array.from({ length: 256 }, (_, i) => ({
    index: String(i),
    byte_offset: String(i * 4194304),
    byte_length: "4194304",
    chunk_digest: "ab".repeat(32),
  }));
  const maximum = {
    ...original,
    serialized_bytes: "1073741824",
    max_expanded_bytes: "1073741824",
    ordered_chunk_entries: entries,
  };
  assert.doesNotThrow(() => canonicalBytes("manifest", maximum));
  assert.throws(() => canonicalBytes("manifest", { ...maximum, serialized_bytes: "1073741825" }));
  assert.throws(() =>
    canonicalBytes("manifest", { ...maximum, ordered_chunk_entries: entries.toReversed() }),
  );
  assert.throws(() => canonicalBytes("manifest", { ...original, max_expanded_bytes: "3" }));
  assert.throws(() =>
    canonicalBytes("manifest", { ...original, native_codec_id: "unsafe-generic" }),
  );
});

test("operation identity and signatures bind context without authorizing release", () => {
  const operation = item("operation-identity").value;
  assert.equal(operationId(operation), item("operation-identity").digest);
  for (const field of [
    "tenant_scope",
    "logical_job_id",
    "stage_id",
    "plan_digest",
    "workflow_epoch",
  ]) {
    const replacement =
      field === "plan_digest" ? "cd".repeat(32) : field === "workflow_epoch" ? "0" : "other";
    assert.notEqual(operationId({ ...operation, [field]: replacement }), operationId(operation));
  }
  assert.throws(() => operationId({ ...operation, execution_id: "retry-1" }));
  const vector = item("plan"),
    h = header(vector.envelope),
    payload = Buffer.from(vector.canonical_hex, "hex");
  for (const field of ["key_id", "signer", "key_epoch"]) {
    const changed = signaturePreimage(
      { ...h, [field]: field === "key_epoch" ? "1" : "other" },
      payload,
    );
    assert.equal(
      verify(null, changed, publicKey, Buffer.from(vector.envelope.signature, "base64url")),
      false,
    );
  }
  assert.throws(() => signaturePreimage({ ...h, payload_kind: "receipt" }, payload));
  for (const field of ["tenant_scope", "key_context_digest", "model_digest", "program_digest"]) {
    const changed = {
      ...vector.value,
      [field]: field === "tenant_scope" ? "other" : "cd".repeat(32),
    };
    assert.throws(() => signaturePreimage(h, canonicalBytes("plan", changed)), field);
  }
  assert.throws(() => signaturePreimage({ ...h, algorithm: "Ed25519ph" }, payload));
  const wrongDomain = Buffer.from(vector.preimage_hex, "hex");
  wrongDomain[8] ^= 1;
  assert.equal(
    verify(null, wrongDomain, publicKey, Buffer.from(vector.envelope.signature, "base64url")),
    false,
  );
});

test("key material, context and evaluation-key manifest have an acyclic commitment graph", () => {
  const blob = Buffer.from(corpus.chunk.bytes_hex, "hex");
  const context = { ...item("key-context").value, evaluation_key_blob_digest: blobDigest(blob) };
  const manifest = {
    ...item("manifest").value,
    artifact_kind: "EVALUATION_KEY",
    key_context_digest: commitment("key-context", context),
  };
  assert.equal(manifest.full_blob_digest, context.evaluation_key_blob_digest);
  assert.doesNotThrow(() => canonicalBytes("manifest", manifest));
  // Committing back to this manifest would require a cryptographic fixed point.
  assert.throws(() =>
    canonicalBytes("key-context", {
      ...context,
      evaluation_key_manifest_digest: commitment("manifest", manifest),
    }),
  );
});
