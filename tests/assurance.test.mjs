import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessAssurance,
  baselineAssuranceFixture,
  baselineConsentFixture,
  baselineRequestFixture,
  CONTRACT_VERSION,
  decodeAssuranceProfile,
  decodeAssuranceRequest,
  METADATA_LEAKAGE,
} from "../dist/index.js";

const clone = structuredClone;
const generated = (name) =>
  JSON.parse(readFileSync(new URL(`../generated/${name}`, import.meta.url), "utf8"));
// Synthetic trusted declarations exercise compatibility only, never real review or proof acceptance.
const testProfile = () => ({
  ...clone(baselineAssuranceFixture),
  enabled: true,
  review_status: "REVIEWED",
  review_evidence: ["test-only-review"],
  legal_disposition_id: "test-only-legal",
  parameter_profile_id: "test-only-parameters",
});

test("published baseline round-trips but remains disabled and unreviewed", () => {
  assert.deepEqual(decodeAssuranceProfile(baselineAssuranceFixture), baselineAssuranceFixture);
  assert.deepEqual(decodeAssuranceRequest(baselineRequestFixture), baselineRequestFixture);
  assert.deepEqual(assessAssurance(baselineAssuranceFixture, baselineRequestFixture), [
    "PROFILE_DISABLED",
  ]);
  assert.deepEqual(assessAssurance(testProfile(), baselineRequestFixture), []);
});

test("profile activation and bounded declarations reject inconsistent or unsupported claims", () => {
  for (const [change, reason] of [
    [{ enabled: true }, /PROFILE_UNREVIEWED/],
    [{ review_status: "REVIEWED" }, /REVIEW_EVIDENCE_REQUIRED/],
    [{ metadata_leakage: METADATA_LEAKAGE.map(() => "TIMING") }, /DUPLICATE_LEAKAGE/],
    [
      { allowed_proof_relations: ["TFHE_COMPACT_INPUT", "TFHE_COMPACT_INPUT"] },
      /DUPLICATE_RELATION/,
    ],
  ])
    assert.throws(() => decodeAssuranceProfile({ ...baselineAssuranceFixture, ...change }), reason);
  for (const change of [
    { profile_id: "FHE-A1" },
    { profile_version: "2" },
    { release_authority: "RAY_WORKER" },
    { private_key_custody: "COMPUTE_WORKER" },
    { metadata_leakage: [] },
    { parameter_profile_id: "parameters\n" },
    { review_evidence: Array(9).fill("review") },
    { private_key: "forbidden" },
    { ownership_model: "MULTI_OWNER" },
    {
      claims: {
        ...baselineAssuranceFixture.claims,
        computation_integrity: "FHE_EVALUATION_PROVEN",
      },
    },
  ])
    assert.throws(() => decodeAssuranceProfile({ ...baselineAssuranceFixture, ...change }));
});

test("independent stronger requirements never silently downgrade", () => {
  for (const [dimension, value] of [
    ["computation_integrity", "FHE_EVALUATION_PROVEN"],
    ["input_validity", "COMPACT_ENCRYPTION_PROVEN"],
    ["model_visibility", "PRIVATE"],
    ["witness_privacy", "ZERO_KNOWLEDGE"],
    ["availability", "GUARANTEED"],
  ]) {
    const request = clone(baselineRequestFixture);
    request.requirements[dimension] = value;
    assert.ok(assessAssurance(testProfile(), request).includes(`UNSUPPORTED_${dimension}`));
  }
  for (const dimension of ["input_confidentiality", "output_privacy"]) {
    const request = clone(baselineRequestFixture);
    request.requirements[dimension] = "PLAINTEXT";
    assert.throws(() => decodeAssuranceRequest(request));
  }
});

test("signatures encryption redundancy input proofs and metadata proofs cannot prove FHE evaluation", () => {
  for (const nonProof of ["EXECUTION_SIGNATURE", "FHE_ENCRYPTION", "REDUNDANT_EXECUTION"]) {
    assert.throws(() =>
      decodeAssuranceProfile({ ...testProfile(), allowed_proof_relations: [nonProof] }),
    );
  }
  for (const relation of ["TFHE_COMPACT_INPUT", "PUBLIC_METADATA_COMMITMENT"]) {
    const profile = { ...testProfile(), allowed_proof_relations: [relation] };
    const request = clone(baselineRequestFixture);
    request.requirements.computation_integrity = "FHE_EVALUATION_PROVEN";
    request.evidence_policy = "REQUIRED_BEFORE_RELEASE";
    request.evidence_relations = [relation];
    assert.deepEqual(assessAssurance(profile, request), ["UNSUPPORTED_computation_integrity"]);
  }
});

test("consent must disclose every baseline leakage and residual assumption", () => {
  for (const leakage of METADATA_LEAKAGE) {
    const request = clone(baselineRequestFixture);
    request.consent.accepted_leakage = METADATA_LEAKAGE.filter((x) => x !== leakage);
    assert.deepEqual(assessAssurance(testProfile(), request), [`LEAKAGE_NOT_ACCEPTED_${leakage}`]);
  }
  for (const field of [
    "model_visibility",
    "computation_integrity",
    "owner_endpoint_trust",
    "residual_side_channels",
    "owner_compromise",
  ]) {
    const request = clone(baselineRequestFixture);
    delete request.consent[field];
    assert.throws(() => decodeAssuranceRequest(request));
  }
  const request = clone(baselineRequestFixture);
  request.consent.accepted_leakage = ["TIMING", "TIMING"];
  assert.throws(() => decodeAssuranceRequest(request), /DUPLICATE_LEAKAGE/);
  assert.throws(() =>
    decodeAssuranceRequest({ ...baselineRequestFixture, ciphertext: "forbidden" }),
  );
});

test("evidence policies reject missing unsupported or contradictory evidence and release consent", () => {
  const profile = { ...testProfile(), allowed_proof_relations: ["PUBLIC_METADATA_COMMITMENT"] };
  for (const policy of ["NONE", "OPTIONAL_LATER", "REQUIRED_BEFORE_RELEASE"]) {
    for (const unverified of [false, true]) {
      const request = clone(baselineRequestFixture);
      request.evidence_policy = policy;
      request.evidence_relations = policy === "NONE" ? [] : ["PUBLIC_METADATA_COMMITMENT"];
      request.consent.allow_unverified_release = unverified;
      assert.deepEqual(
        assessAssurance(profile, request),
        policy !== "REQUIRED_BEFORE_RELEASE" && !unverified
          ? ["UNVERIFIED_RELEASE_NOT_ACCEPTED"]
          : [],
      );
    }
  }
  for (const policy of ["OPTIONAL_LATER", "REQUIRED_BEFORE_RELEASE"]) {
    assert.deepEqual(
      assessAssurance(profile, { ...baselineRequestFixture, evidence_policy: policy }),
      ["EVIDENCE_RELATION_REQUIRED"],
    );
  }
  assert.deepEqual(
    assessAssurance(profile, {
      ...baselineRequestFixture,
      evidence_relations: ["PUBLIC_METADATA_COMMITMENT"],
    }),
    ["NONE_HAS_RELATIONS"],
  );
  assert.deepEqual(
    assessAssurance(profile, {
      ...baselineRequestFixture,
      evidence_policy: "REQUIRED_BEFORE_RELEASE",
      evidence_relations: ["FHE_EVALUATION"],
    }),
    ["UNSUPPORTED_RELATION_FHE_EVALUATION"],
  );
  assert.throws(
    () =>
      decodeAssuranceRequest({
        ...baselineRequestFixture,
        evidence_relations: ["TFHE_COMPACT_INPUT", "TFHE_COMPACT_INPUT"],
      }),
    /DUPLICATE_RELATION/,
  );
});

test("generated schemas retain strict baseline constraints fixtures and source provenance", () => {
  for (const [path, expected] of [
    ["fixtures/fhe-q1-assurance.json", baselineAssuranceFixture],
    ["fixtures/fhe-q1-consent.json", baselineConsentFixture],
    ["fixtures/fhe-q1-request.json", baselineRequestFixture],
  ])
    assert.deepEqual(generated(path), expected);
  for (const name of ["assurance-profile", "assurance-request", "consent-declaration"]) {
    assert.equal(generated(`${name}.schema.json`).additionalProperties, false);
  }
  const schema = generated("assurance-profile.schema.json");
  assert.equal(schema.properties.claims.additionalProperties, false);
  for (const [key, value] of Object.entries(baselineAssuranceFixture.claims)) {
    const claim = schema.properties.claims.properties[key];
    assert.equal(claim.const ?? claim.enum?.[0], value);
  }
  assert.equal(schema.properties.metadata_leakage.minItems, METADATA_LEAKAGE.length);
  assert.equal(schema.properties.metadata_leakage.maxItems, METADATA_LEAKAGE.length);
  assert.ok(schema.properties.parameter_profile_id.pattern.endsWith("(?![\\s\\S])"));
  const source = readFileSync(new URL("../src/assurance.ts", import.meta.url));
  assert.equal(
    generated("manifest.json").sources["src/assurance.ts"],
    createHash("sha256").update(source).digest("hex"),
  );
  assert.equal(generated("manifest.json").contract_version, CONTRACT_VERSION);
});
