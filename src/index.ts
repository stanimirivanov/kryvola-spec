import { Schema } from "effect";

export {
  AssuranceProfile,
  AssuranceRequest,
  assessAssurance,
  baselineAssuranceFixture,
  baselineConsentFixture,
  baselineRequestFixture,
  ConsentDeclaration,
  decodeAssuranceProfile,
  decodeAssuranceRequest,
  METADATA_LEAKAGE,
} from "./assurance.js";

export * from "./control.js";

export const CONTRACT_VERSION = "0.1.0-preview.4";
export const LIMITS = {
  control_bytes: "65536",
  temporal_payload_bytes: "32768",
  temporal_call_bytes: "131072",
  chunk_default_bytes: "1048576",
  chunk_max_bytes: "4194304",
  artifact_max_bytes: "1073741824",
} as const;

const Identifier = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}(?![\s\S])/u),
);
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/u));
const Decimal = Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]{0,19})(?![\s\S])/u));

/** Reference metadata only. Possession never grants artifact access. */
export const ArtifactRef = Schema.Struct({
  opaque_artifact_id: Identifier,
  tenant_scope: Identifier,
  immutable_version: Identifier,
  manifest_digest: Digest,
  byte_length: Decimal,
  media_type: Schema.Literal("application/vnd.kryvola.tfhe-ciphertext"),
  schema_version: Schema.Literal("1"),
});
export type ArtifactRef = typeof ArtifactRef.Type;

// Explicit stable wire tags. New fields require new tags; never infer them from declaration order.
export const ARTIFACT_REF_FIELD_NUMBERS = {
  opaque_artifact_id: 1,
  tenant_scope: 2,
  immutable_version: 3,
  manifest_digest: 4,
  byte_length: 5,
  media_type: 6,
  schema_version: 7,
} as const;

/** This schema deliberately cannot describe a qualified production release. */
export const FoundationInventory = Schema.Struct({
  schema_version: Schema.Literal("1"),
  stage: Schema.Literal("foundation"),
  production_ready: Schema.Literal(false),
  profiles: Schema.Array(
    Schema.Struct({
      profile_id: Schema.Literal("FHE-Q1"),
      enabled: Schema.Literal(false),
      qualification: Schema.Literal("unqualified"),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
});

export function decodeArtifactRef(input: unknown): ArtifactRef {
  const value = Schema.decodeUnknownSync(ArtifactRef, { onExcessProperty: "error" })(input);
  if (BigInt(value.byte_length) > BigInt(LIMITS.artifact_max_bytes)) {
    throw new Error("ArtifactRef.byte_length exceeds the foundation 1 GiB profile");
  }
  return value;
}

export const artifactRefFixture: ArtifactRef = {
  opaque_artifact_id: "artifact-fixture-1",
  tenant_scope: "tenant-fixture",
  immutable_version: "version-1",
  manifest_digest: "a".repeat(64),
  byte_length: "1048576",
  media_type: "application/vnd.kryvola.tfhe-ciphertext",
  schema_version: "1",
};
