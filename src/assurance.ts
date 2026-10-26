import { Schema } from "effect";

const Identifier = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}(?![\s\S])/u),
);
export const METADATA_LEAKAGE = Object.freeze([
  "INPUT_SHAPE",
  "MODEL_PROGRAM",
  "CRYPTO_PAYLOAD_SIZE",
  "TIMING",
  "ACCESS_PATTERN",
  "KEY_REUSE",
  "CACHE_STATE",
] as const);
const LeakageList = Schema.Array(Schema.Literals(METADATA_LEAKAGE)).check(
  Schema.isMaxLength(METADATA_LEAKAGE.length),
);
const ProfileIdentity = {
  profile_id: Schema.Literal("FHE-Q1"),
  profile_version: Schema.Literal("1"),
};
const Claims = Schema.Struct({
  input_confidentiality: Schema.Literal("OWNER_KEY_ENCRYPTION"),
  computation_integrity: Schema.Literal("UNPROVEN"),
  input_validity: Schema.Literal("NOT_ESTABLISHED"),
  model_visibility: Schema.Literal("PUBLIC"),
  output_privacy: Schema.Literal("ENCRYPTED_TO_OWNER"),
  witness_privacy: Schema.Literal("PUBLIC_DATA_ONLY"),
  availability: Schema.Literal("BEST_EFFORT"),
});

/** Narrow baseline declarations, not evidence that any implementation is qualified. */
export const AssuranceProfile = Schema.Struct({
  ...ProfileIdentity,
  enabled: Schema.Boolean,
  review_status: Schema.Literals(["UNREVIEWED", "REVIEWED"]),
  review_evidence: Schema.Array(Identifier).check(Schema.isMaxLength(8)),
  legal_disposition_id: Identifier,
  parameter_profile_id: Identifier,
  ownership_model: Schema.Literal("SINGLE_OWNER"),
  claims: Claims,
  assumptions: Schema.Struct({
    owner_endpoint_trusted: Schema.Literal(true),
    control_plane_release_trusted: Schema.Literal(true),
    parameter_review_required: Schema.Literal(true),
    tenant_isolation_required: Schema.Literal(true),
    residual_side_channels: Schema.Literal(true),
    owner_compromise_excluded: Schema.Literal(true),
  }),
  metadata_leakage: LeakageList.check(Schema.isMinLength(METADATA_LEAKAGE.length)),
  private_key_custody: Schema.Literal("OWNER_ONLY"),
  release_authority: Schema.Literal("TEMPORAL_WORKFLOW"),
  allowed_proof_relations: Schema.Array(
    Schema.Literals(["TFHE_COMPACT_INPUT", "PUBLIC_METADATA_COMMITMENT"]),
  ).check(Schema.isMaxLength(2)),
});
export type AssuranceProfile = typeof AssuranceProfile.Type;

/** A disclosure declaration; not an authenticated owner approval or disclosure grant. */
export const ConsentDeclaration = Schema.Struct({
  ...ProfileIdentity,
  model_visibility: Schema.Literal("PUBLIC"),
  computation_integrity: Schema.Literal("UNPROVEN"),
  owner_endpoint_trust: Schema.Literal("REQUIRED"),
  residual_side_channels: Schema.Literal("NOT_ELIMINATED"),
  owner_compromise: Schema.Literal("OUT_OF_SCOPE"),
  accepted_leakage: LeakageList,
  allow_unverified_release: Schema.Boolean,
});
export const AssuranceRequest = Schema.Struct({
  ...ProfileIdentity,
  requirements: Schema.Struct({
    ...Claims.fields,
    computation_integrity: Schema.Literals(["UNPROVEN", "FHE_EVALUATION_PROVEN"]),
    input_validity: Schema.Literals(["NOT_ESTABLISHED", "COMPACT_ENCRYPTION_PROVEN"]),
    model_visibility: Schema.Literals(["PUBLIC", "PRIVATE"]),
    witness_privacy: Schema.Literals(["PUBLIC_DATA_ONLY", "ZERO_KNOWLEDGE"]),
    availability: Schema.Literals(["BEST_EFFORT", "GUARANTEED"]),
  }),
  evidence_policy: Schema.Literals(["NONE", "OPTIONAL_LATER", "REQUIRED_BEFORE_RELEASE"]),
  evidence_relations: Schema.Array(
    Schema.Literals(["TFHE_COMPACT_INPUT", "PUBLIC_METADATA_COMMITMENT", "FHE_EVALUATION"]),
  ).check(Schema.isMaxLength(3)),
  consent: ConsentDeclaration,
});
export type AssuranceRequest = typeof AssuranceRequest.Type;

function unique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`DUPLICATE_${field}`);
}

export function decodeAssuranceProfile(input: unknown): AssuranceProfile {
  const profile = Schema.decodeUnknownSync(AssuranceProfile, { onExcessProperty: "error" })(input);
  unique(profile.metadata_leakage, "LEAKAGE");
  unique(profile.allowed_proof_relations, "RELATION");
  unique(profile.review_evidence, "REVIEW");
  if (profile.enabled && profile.review_status !== "REVIEWED")
    throw new Error("PROFILE_UNREVIEWED");
  if (profile.review_status === "REVIEWED" && profile.review_evidence.length === 0) {
    throw new Error("REVIEW_EVIDENCE_REQUIRED");
  }
  return profile;
}

export function decodeAssuranceRequest(input: unknown): AssuranceRequest {
  const request = Schema.decodeUnknownSync(AssuranceRequest, { onExcessProperty: "error" })(input);
  unique(request.evidence_relations, "RELATION");
  unique(request.consent.accepted_leakage, "LEAKAGE");
  return request;
}

/** Pure compatibility check: the caller must independently authenticate/allowlist the profile.
 * Empty denials are NOT runtime authorization, proof verification or authenticated consent.
 */
export function assessAssurance(profileInput: unknown, requestInput: unknown): readonly string[] {
  const profile = decodeAssuranceProfile(profileInput);
  const request = decodeAssuranceRequest(requestInput);
  const denials: string[] = [];
  if (!profile.enabled) denials.push("PROFILE_DISABLED");
  for (const key of Object.keys(profile.claims) as (keyof typeof profile.claims)[]) {
    if (request.requirements[key] !== profile.claims[key]) denials.push(`UNSUPPORTED_${key}`);
  }
  for (const leakage of profile.metadata_leakage) {
    if (!request.consent.accepted_leakage.includes(leakage))
      denials.push(`LEAKAGE_NOT_ACCEPTED_${leakage}`);
  }
  for (const relation of request.evidence_relations) {
    if (!(profile.allowed_proof_relations as readonly string[]).includes(relation)) {
      denials.push(`UNSUPPORTED_RELATION_${relation}`);
    }
  }
  if (request.evidence_policy === "NONE" && request.evidence_relations.length !== 0) {
    denials.push("NONE_HAS_RELATIONS");
  }
  if (request.evidence_policy !== "NONE" && request.evidence_relations.length === 0) {
    denials.push("EVIDENCE_RELATION_REQUIRED");
  }
  if (
    request.evidence_policy !== "REQUIRED_BEFORE_RELEASE" &&
    !request.consent.allow_unverified_release
  ) {
    denials.push("UNVERIFIED_RELEASE_NOT_ACCEPTED");
  }
  return denials;
}

export const baselineAssuranceFixture: AssuranceProfile = {
  profile_id: "FHE-Q1",
  profile_version: "1",
  enabled: false,
  review_status: "UNREVIEWED",
  review_evidence: [],
  legal_disposition_id: "unresolved-fhe-q1",
  parameter_profile_id: "unreviewed-fhe-q1-parameters",
  ownership_model: "SINGLE_OWNER",
  claims: {
    input_confidentiality: "OWNER_KEY_ENCRYPTION",
    computation_integrity: "UNPROVEN",
    input_validity: "NOT_ESTABLISHED",
    model_visibility: "PUBLIC",
    output_privacy: "ENCRYPTED_TO_OWNER",
    witness_privacy: "PUBLIC_DATA_ONLY",
    availability: "BEST_EFFORT",
  },
  assumptions: {
    owner_endpoint_trusted: true,
    control_plane_release_trusted: true,
    parameter_review_required: true,
    tenant_isolation_required: true,
    residual_side_channels: true,
    owner_compromise_excluded: true,
  },
  metadata_leakage: [...METADATA_LEAKAGE],
  private_key_custody: "OWNER_ONLY",
  release_authority: "TEMPORAL_WORKFLOW",
  allowed_proof_relations: [],
};
export const baselineConsentFixture: typeof ConsentDeclaration.Type = {
  profile_id: "FHE-Q1",
  profile_version: "1",
  model_visibility: "PUBLIC",
  computation_integrity: "UNPROVEN",
  owner_endpoint_trust: "REQUIRED",
  residual_side_channels: "NOT_ELIMINATED",
  owner_compromise: "OUT_OF_SCOPE",
  accepted_leakage: [...METADATA_LEAKAGE],
  allow_unverified_release: true,
};
export const baselineRequestFixture: AssuranceRequest = {
  profile_id: "FHE-Q1",
  profile_version: "1",
  requirements: { ...baselineAssuranceFixture.claims },
  evidence_policy: "NONE",
  evidence_relations: [],
  consent: baselineConsentFixture,
};
