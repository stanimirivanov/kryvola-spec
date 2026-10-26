import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import canonicalize from "canonicalize";
import { Schema } from "effect";
import { Uint64Decimal } from "./control.js";
import { FheQ1Arithmetic, FheQ1Operator, FheQ1Precision } from "./fhe-q1.js";

const Id = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}(?![\s\S])/u));
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/u));
const Text = Schema.String.check(Schema.isPattern(/^[\s\S]{0,256}(?![\s\S])/u));
const U64 = Uint64Decimal;
const list = <S extends Schema.Top>(schema: S, max = 128) =>
  Schema.Array(schema).check(Schema.isMinLength(1), Schema.isMaxLength(max));
const base = { schema_version: Schema.Literal("1"), tenant_scope: Id };
const context = { logical_job_id: Id, plan_digest: Digest, key_context_digest: Digest };
const Shape = list(U64, 8);
const Chunk = Schema.Struct({
  index: U64,
  byte_offset: U64,
  byte_length: U64,
  chunk_digest: Digest,
});
const Parameters = Schema.Struct({
  scheme: Schema.Literal("TFHE"),
  parameter_set_digest: Digest,
  radix_bits: U64,
  message_modulus: U64,
  carry_modulus: U64,
});
const Precision = Schema.Struct({
  dtype: Schema.Literals(["uint8", "uint16", "uint32", "uint64"]),
  fractional_bits: U64,
  overflow: Schema.Literal("REJECT"),
});
const Manifest = Schema.Struct({
  ...base,
  object_type: Schema.Literal("manifest"),
  artifact_kind: Schema.Literals(["CIPHERTEXT", "EVALUATION_KEY"]),
  producer_identity: Id,
  key_context_digest: Digest,
  native_codec_id: Schema.Literal("tfhe-rs-safe"),
  native_codec_version: Id,
  parameters: Parameters,
  precision: Precision,
  shape: Shape,
  serialized_bytes: U64,
  max_expanded_bytes: U64,
  ordered_chunk_entries: list(Chunk, 1024),
  full_blob_digest: Digest,
});
const Plan = Schema.Struct({
  ...base,
  object_type: Schema.Literal("plan"),
  display_name: Text,
  key_context_digest: Digest,
  model_digest: Digest,
  program_digest: Digest,
  engine_digest: Digest,
  parameters: Parameters,
  precision: Precision,
  input_shape: Shape,
  output_shape: Shape,
  operators: list(Schema.Literals(["ADD", "MUL_CLEAR"])),
  input_manifest_digests: list(Digest),
  output_contract_digest: Digest,
  resource_profile_digest: Digest,
  evidence_policy_digest: Digest,
  leakage_profile_digest: Digest,
  consent_digest: Digest,
  security_profile: Schema.Literal("FHE-Q1"),
});
/** CANONICAL_V2_SCHEMAS adds modular candidates without reinterpreting signed v1. */
export const CANONICAL_V2_SCHEMAS = {
  manifest: Schema.Struct({
    ...Manifest.fields,
    schema_version: Schema.Literal("2"),
    arithmetic: FheQ1Arithmetic,
    precision: FheQ1Precision,
  }),
  plan: Schema.Struct({
    ...Plan.fields,
    schema_version: Schema.Literal("2"),
    arithmetic: FheQ1Arithmetic,
    precision: FheQ1Precision,
    operators: list(FheQ1Operator, 2),
  }),
};
/** CanonicalVersion is selected explicitly by the caller; existing APIs default to v1. */
export type CanonicalVersion = "1" | "2";
const Approval = Schema.Struct({
  ...base,
  object_type: Schema.Literal("approval"),
  ...context,
  subject_kind: Schema.Literals(["manifest", "plan", "key-context", "journal", "receipt"]),
  subject_digest: Digest,
  purpose: Schema.Literals(["COMPUTE", "EVIDENCE", "RELEASE"]),
  recipient: Id,
  policy_digest: Digest,
  consent_digest: Digest,
  valid_from_unix_ms: U64,
  expires_unix_ms: U64,
});
const KeyContext = Schema.Struct({
  ...base,
  object_type: Schema.Literal("key-context"),
  key_context_id: Id,
  key_epoch: U64,
  owner_identity: Id,
  public_key_digest: Digest,
  evaluation_key_blob_digest: Digest,
  parameters: Parameters,
  native_codec_version: Id,
  security_profile: Schema.Literal("FHE-Q1"),
});
const Journal = Schema.Struct({
  ...base,
  object_type: Schema.Literal("journal"),
  ...context,
  operation_id: Id,
  attempt_epoch: U64,
  execution_id: Id,
  fence: U64,
  session_epoch: U64,
  relation: Schema.Literal("MANIFEST_PROCESSING"),
  claim: Schema.Literal("STRUCTURAL_VALIDITY_ONLY"),
  guest_digest: Digest,
  verifier_digest: Digest,
  program_digest: Digest,
  model_digest: Digest,
  proof_system: Schema.Literals(["SP1", "RISC_ZERO"]),
  proof_mode: Id,
  security_version: Id,
  input_manifest_digests: list(Digest),
  output_manifest_digests: list(Digest),
  evidence_policy_digest: Digest,
  valid_from_unix_ms: U64,
  expires_unix_ms: U64,
});
const Receipt = Schema.Struct({
  ...base,
  object_type: Schema.Literal("receipt"),
  ...context,
  operation_id: Id,
  attempt_epoch: U64,
  execution_id: Id,
  fence: U64,
  session_epoch: U64,
  stage_id: Id,
  engine_digest: Digest,
  program_digest: Digest,
  input_manifest_digests: list(Digest),
  output_manifest_digests: list(Digest),
  capability_profile_digest: Digest,
  leakage_profile_digest: Digest,
  evidence_policy_digest: Digest,
  evidence_journal_digests: Schema.Array(Digest).check(Schema.isMaxLength(128)),
  evidence_status: Schema.Literals(["NOT_REQUESTED", "PENDING", "CLAIMED"]),
  signer: Id,
  started_unix_ms: U64,
  completed_unix_ms: U64,
});
const OperationIdentity = Schema.Struct({
  ...base,
  object_type: Schema.Literal("operation-identity"),
  logical_job_id: Id,
  plan_digest: Digest,
  stage_id: Id,
  workflow_epoch: U64,
});
export const CANONICAL_SCHEMAS = {
  manifest: Manifest,
  plan: Plan,
  approval: Approval,
  "key-context": KeyContext,
  journal: Journal,
  receipt: Receipt,
  "operation-identity": OperationIdentity,
};
export type CanonicalKind = keyof typeof CANONICAL_SCHEMAS;
type CanonicalValue =
  | {
      [K in CanonicalKind]: (typeof CANONICAL_SCHEMAS)[K]["Type"];
    }[CanonicalKind]
  | typeof CANONICAL_V2_SCHEMAS.plan.Type
  | typeof CANONICAL_V2_SCHEMAS.manifest.Type;
export const SignedKind = Schema.Literals([
  "manifest",
  "plan",
  "approval",
  "key-context",
  "journal",
  "receipt",
]);
const Header = {
  schema_version: Schema.Literal("1"),
  algorithm: Schema.Literal("Ed25519"),
  payload_kind: SignedKind,
  payload_digest: Digest,
  signer: Id,
  key_id: Id,
  key_epoch: U64,
};
export const SignatureEnvelope = Schema.Struct({
  ...Header,
  signature: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{85}[AQgw](?![\s\S])/u)),
});
export const SignatureHeader = Schema.Struct(Header);
const HeaderV2 = {
  ...Header,
  schema_version: Schema.Literal("2"),
  payload_kind: Schema.Literals(["manifest", "plan"]),
};
/** SignatureHeaderV2 binds only a v2 manifest or plan; other signed objects remain v1. */
export const SignatureHeaderV2 = Schema.Struct(HeaderV2);
/** SignatureEnvelopeV2 uses a separate signature domain and preserves the v1 envelope. */
export const SignatureEnvelopeV2 = Schema.Struct({
  ...HeaderV2,
  signature: SignatureEnvelope.fields.signature,
});
export const CANONICAL_LIMITS = {
  document_bytes: 1048576,
  depth: 16,
  chunk_bytes: 4194304,
  artifact_bytes: 1073741824,
} as const;
const utf8 = new TextEncoder();
const fail = (message: string): never => {
  throw new Error(message);
};

// This is a closed, number-free JCS profile; production trust/allowlists are separate.
function jsonValues(value: unknown, depth = 0): void {
  if (depth > CANONICAL_LIMITS.depth) fail("document depth");
  if (typeof value === "string") {
    if (!value.isWellFormed()) fail("Unicode scalar value");
  } else if (Array.isArray(value)) for (const child of value) jsonValues(child, depth + 1);
  else if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const [key, child] of Object.entries(value)) {
      jsonValues(key, depth + 1);
      jsonValues(child, depth + 1);
    }
  } else fail("only strings, arrays and plain objects are permitted");
}
function semantics(kind: CanonicalKind, value: unknown): void {
  const v = value as CanonicalValue;
  if (
    (v.object_type === "plan" || v.object_type === "manifest") &&
    v.schema_version === "2" &&
    v.parameters.radix_bits !== v.precision.dtype.slice(4)
  )
    fail("dtype/radix width mismatch");
  if (
    v.object_type === "plan" &&
    v.schema_version === "2" &&
    new Set(v.operators).size !== v.operators.length
  )
    fail("duplicate required operators");
  const shapes =
    v.object_type === "manifest"
      ? [v.shape]
      : v.object_type === "plan"
        ? [v.input_shape, v.output_shape]
        : [];
  for (const shape of shapes) {
    let product = 1n;
    for (const item of shape) {
      if (BigInt(item) === 0n) fail("zero dimension");
      product *= BigInt(item);
    }
    if (product > 1048576n) fail("shape element bound");
  }
  if ("precision" in v && BigInt(v.precision.fractional_bits) !== 0n)
    fail("integer baseline precision");
  if (
    "parameters" in v &&
    [v.parameters.radix_bits, v.parameters.message_modulus, v.parameters.carry_modulus].some(
      (item) => BigInt(item) === 0n,
    )
  )
    fail("positive parameters");
  if ("expires_unix_ms" in v && BigInt(v.expires_unix_ms) <= BigInt(v.valid_from_unix_ms))
    fail("validity interval");
  if (v.object_type === "receipt" && BigInt(v.completed_unix_ms) < BigInt(v.started_unix_ms))
    fail("receipt interval");
  if (kind !== "manifest" || v.object_type !== "manifest") return;
  let offset = 0n;
  for (const [index, chunk] of v.ordered_chunk_entries.entries()) {
    const size = BigInt(chunk.byte_length);
    if (
      BigInt(chunk.index) !== BigInt(index) ||
      BigInt(chunk.byte_offset) !== offset ||
      size < 1n ||
      size > 4194304n
    )
      fail("chunk ordering/size");
    offset += size;
  }
  if (
    offset !== BigInt(v.serialized_bytes) ||
    offset > 1073741824n ||
    BigInt(v.max_expanded_bytes) < offset ||
    BigInt(v.max_expanded_bytes) > 1073741824n
  )
    fail("artifact size");
}
export function canonicalBytes(
  kind: CanonicalKind | "signature",
  input: unknown,
  version: CanonicalVersion = "1",
): Uint8Array {
  jsonValues(input);
  if (version !== "1" && version !== "2") fail("unsupported canonical version");
  const schema =
    kind === "signature"
      ? version === "1"
        ? SignatureEnvelope
        : SignatureEnvelopeV2
      : version === "1"
        ? CANONICAL_SCHEMAS[kind]
        : kind === "plan" || kind === "manifest"
          ? CANONICAL_V2_SCHEMAS[kind]
          : undefined;
  if (!schema) throw new Error("unsupported kind/version");
  const value = Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input);
  if (kind !== "signature") semantics(kind, value);
  const bytes = utf8.encode(canonicalize(value));
  if (bytes.length > CANONICAL_LIMITS.document_bytes) fail("document size");
  return bytes;
}
export function decodeCanonical(
  kind: CanonicalKind | "signature",
  bytes: Uint8Array,
  version: CanonicalVersion = "1",
): unknown {
  if (bytes.length > CANONICAL_LIMITS.document_bytes) fail("document size");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  // Bound nesting before JSON.parse. Braces within strings do not count.
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") {
      if (++depth > CANONICAL_LIMITS.depth) fail("document depth");
    } else if (c === "}" || c === "]") depth--;
  }
  const value: unknown = JSON.parse(text);
  const canonical = canonicalBytes(kind, value, version);
  // Duplicate keys (including escaped aliases) cannot equal the unique-key JCS output.
  if (canonical.length !== bytes.length || canonical.some((byte, i) => byte !== bytes[i]))
    fail("noncanonical or duplicate fields");
  return value;
}
const domain = (tag: string, version: CanonicalVersion = "1") =>
  utf8.encode(`kryvola/${tag}/v${version}\0`);
const hash = (...parts: Uint8Array[]) => {
  const state = blake3.create({ dkLen: 32 });
  for (const part of parts) state.update(part);
  return bytesToHex(state.digest());
};
export const commitment = (
  kind: CanonicalKind,
  value: unknown,
  version: CanonicalVersion = "1",
): string => {
  const bytes = canonicalBytes(kind, value, version);
  return hash(domain(kind, version), bytes);
};
export function uint64le(value: string): Uint8Array {
  Schema.decodeUnknownSync(U64)(value);
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}
export function chunkDigest(index: string, bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > CANONICAL_LIMITS.chunk_bytes) fail("chunk size");
  return hash(domain("chunk"), uint64le(index), uint64le(String(bytes.length)), bytes);
}
export function blobDigest(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > CANONICAL_LIMITS.artifact_bytes) fail("blob size");
  return hash(domain("blob"), bytes);
}
export function operationId(input: unknown): string {
  return commitment("operation-identity", input);
}
export function signaturePreimage(
  header: unknown,
  payload: Uint8Array,
  version: CanonicalVersion = "1",
): Uint8Array {
  jsonValues(header);
  const h = Schema.decodeUnknownSync(version === "1" ? SignatureHeader : SignatureHeaderV2, {
    onExcessProperty: "error",
  })(header);
  const value = decodeCanonical(h.payload_kind, payload, version);
  if (h.payload_digest !== commitment(h.payload_kind, value, version))
    fail("payload digest mismatch");
  const metadata = utf8.encode(canonicalize(h));
  const parts = [
    domain(`signature/${h.payload_kind}`, version),
    uint64le(String(metadata.length)),
    metadata,
    uint64le(String(payload.length)),
    payload,
  ];
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
