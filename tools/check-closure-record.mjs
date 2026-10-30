import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRatification, pins } from "./check-ratification.mjs";
import { sha256 } from "./provenance.mjs";

export const roles = Object.freeze([
  "Spec lead",
  "Fabric lead",
  "Engines lead",
  "ML lead",
  "Platform lead",
  "Security reviewer",
  "Legal reviewer",
  "Operational owner",
]);
export const scope = "M0_CONTRACT_FEASIBILITY_AND_NONPRODUCTION_COMPOSITION";
const revision = "1a5b57a590487ba116913050af8041f5e5f1fb52";
const digestPattern = /^[a-f0-9]{64}$/;
const localRead = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

function keys(value, expected) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Expected record");
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), "Unknown or missing fields");
}
function text(value) {
  assert.ok(typeof value === "string" && value.trim().length > 0, "Missing text");
}

// Repository-local administrative consistency only. Never authenticates a reviewer.
export function checkClosureRecord(record, { read = localRead, previousBytes = null } = {}) {
  keys(record, [
    "version",
    "status",
    "scope",
    "contract_revision",
    "candidate_digests",
    "production_ready",
    "profile_enabled",
    "m1_admitted",
    "composition_sha256",
    "reviews",
    "supersedes",
  ]);
  assert.equal(record.version, 1);
  assert.equal(record.status, "PENDING_AUTHENTICATION_AND_ACCEPTANCE");
  assert.equal(record.scope, scope, "Ambiguous closure scope");
  assert.equal(record.contract_revision, revision);
  for (const flag of ["production_ready", "profile_enabled", "m1_admitted"])
    assert.equal(record[flag], false, "No activation or admission");
  assert.ok(record.composition_sha256 === null || digestPattern.test(record.composition_sha256));
  keys(record.candidate_digests, Object.keys(pins));
  for (const [path, expected] of Object.entries(pins)) {
    assert.equal(record.candidate_digests[path], expected, "Candidate pin changed");
    assert.equal(sha256(read(path)), expected, `Candidate bytes changed: ${path}`);
  }
  assert.ok(Array.isArray(record.reviews));
  assert.equal(record.reviews.length, roles.length);
  assert.deepEqual(record.reviews.map((review) => review.role).sort(), [...roles].sort());
  for (const review of record.reviews) {
    keys(review, [
      "role",
      "identity",
      "authority",
      "decision",
      "review_url",
      "evidence_sha256",
      "subject_sha256",
      "intended_use",
      "conditions",
    ]);
    assert.ok(["PENDING", "APPROVE", "REJECT", "CONDITIONAL"].includes(review.decision));
    assert.ok(Array.isArray(review.conditions));
    review.conditions.forEach(text);
    if (review.decision === "PENDING") {
      for (const field of [
        "identity",
        "authority",
        "review_url",
        "evidence_sha256",
        "subject_sha256",
        "intended_use",
      ])
        assert.equal(review[field], null);
      assert.equal(review.conditions.length, 0);
    } else {
      for (const field of ["identity", "authority", "intended_use"]) text(review[field]);
      assert.equal(new URL(review.review_url).protocol, "https:");
      assert.ok(digestPattern.test(review.evidence_sha256));
      assert.ok(digestPattern.test(review.subject_sha256));
      if (["REJECT", "CONDITIONAL"].includes(review.decision))
        assert.ok(review.conditions.length > 0, "Decision needs reasons/conditions");
    }
  }
  if (record.supersedes === null) {
    assert.equal(previousBytes, null, "Unexpected predecessor");
  } else {
    keys(record.supersedes, ["sha256", "reason"]);
    text(record.supersedes.reason);
    assert.ok(previousBytes instanceof Uint8Array, "Exact predecessor bytes required");
    assert.equal(record.supersedes.sha256, sha256(previousBytes), "Wrong predecessor");
    const previous = JSON.parse(new TextDecoder().decode(previousBytes));
    assert.equal(previous.version, record.version);
    assert.equal(previous.scope, record.scope, "Scope change needs a new convention");
    assert.equal(previous.contract_revision, record.contract_revision);
    assert.deepEqual(previous.candidate_digests, record.candidate_digests);
  }
  return "CONSISTENT_NOT_AUTHENTICATED";
}

export function readClosureRecord(markdown) {
  const blocks = [...markdown.matchAll(/```closure-record\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, "Expected exactly one administrative record");
  return JSON.parse(blocks[0][1]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRatification(localRead("docs/m0-ratification.md").toString());
  console.log(checkClosureRecord(readClosureRecord(localRead("docs/m0-closure.md").toString())));
}
