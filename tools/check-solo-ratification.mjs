/** Historical decision consistency, never live authentication or deployment admission. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scope } from "./check-closure-record.mjs";
import { sha256 } from "./provenance.mjs";

const localRead = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
const keys = (value, expected) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), expected.sort());
};
const sha = (value) => assert.match(value, /^[a-f0-9]{64}$/);
export function checkSoloRatification(record, read = localRead) {
  keys(record, [
    "version",
    "governance",
    "status",
    "scope",
    "contract_revision",
    "predecessor_sha256",
    "proposal_sha256",
    "governance_adr_sha256",
    "subject_sha256",
    "agentic_review_sha256",
    "candidate_sha256",
    "composition_sha256",
    "selection_sha256",
    "intended_use",
    "reviewed_revision",
    "approval_sha256",
    "verification_sha256",
    "verification",
    "exclusions",
    "m0_ratified",
    "m0_accepted",
    "m1_admitted",
    "production_ready",
    "profile_enabled",
    "deployment_authorized",
  ]);
  assert.equal(record.version, 2);
  assert.equal(record.governance, "SOLO_OWNER_AGENTIC_V1");
  assert.equal(record.status, "RATIFIED_FOR_M0_NONPRODUCTION");
  assert.equal(record.scope, scope);
  assert.equal(record.m0_ratified, true);
  for (const name of [
    "m0_accepted",
    "m1_admitted",
    "production_ready",
    "profile_enabled",
    "deployment_authorized",
  ])
    assert.equal(record[name], false);
  const bound = (name, digest) => {
    sha(digest);
    const raw = read(name);
    assert.equal(sha256(raw), digest, name);
    return raw;
  };
  bound("docs/m0-ratification-decision.md", record.predecessor_sha256);
  bound("docs/m0-ratification-proposal.json", record.proposal_sha256);
  bound("docs/adr/0004-solo-owner-agentic-review.md", record.governance_adr_sha256);
  const subject = JSON.parse(bound("docs/m0-solo-review/solo-subject.json", record.subject_sha256));
  const report = JSON.parse(
    bound("docs/m0-solo-review/agentic-review.json", record.agentic_review_sha256),
  );
  assert.equal(subject.version, 2);
  assert.equal(subject.governance, record.governance);
  assert.equal(subject.scope, record.scope);
  assert.equal(subject.production_ready, false);
  assert.equal(subject.profile_enabled, false);
  assert.equal(report.version, 1);
  assert.equal(report.kind, "AGENTIC_REVIEW");
  assert.equal(report.subject_sha256, record.subject_sha256);
  assert.deepEqual(report.blockers, []);
  for (const key of [
    "candidate_sha256",
    "composition_sha256",
    "selection_sha256",
    "intended_use",
    "exclusions",
  ])
    assert.deepEqual(record[key], subject[key]);
  const ledger = JSON.parse(read("docs/m0-composition-qualification.json"));
  assert.equal(ledger.status, "RECORDED_NONPRODUCTION_QUALIFICATION");
  assert.equal(record.composition_sha256, ledger.report_sha256);
  assert.equal(record.candidate_sha256, ledger.candidate_sha256);
  assert.equal(record.contract_revision, ledger.components.spec.source_revision);
  const approval = JSON.parse(
    bound("docs/m0-ratification-approved.approval.json", record.approval_sha256),
  );
  keys(approval, ["id", "owner_login", "url", "updated_at", "body"]);
  assert.equal(approval.owner_login, "stanimirivanov");
  assert.ok(Number.isSafeInteger(approval.id) && approval.id > 0);
  assert.equal(
    approval.url,
    `https://github.com/stanimirivanov/kryvola-spec/pull/54#issuecomment-${approval.id}`,
  );
  assert.match(record.reviewed_revision, /^[a-f0-9]{40}$/);
  assert.equal(
    approval.body.replaceAll("\r\n", "\n").trim(),
    `KRYVOLA_SOLO_OWNER_APPROVAL_V1\nsubject_sha256=${record.subject_sha256}\nagentic_review_sha256=${record.agentic_review_sha256}\nintended_use=${record.intended_use}\nreviewed_revision=${record.reviewed_revision}`,
  );
  keys(record.verification, [
    "verifier_revision",
    "verified_at",
    "operator_policy_sha256",
    "policy_valid_until",
  ]);
  assert.match(record.verification.verifier_revision, /^[a-f0-9]{40}$/);
  sha(record.verification.operator_policy_sha256);
  const time = (value) => {
    assert.match(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const t = Date.parse(value);
    assert.ok(Number.isFinite(t));
    return t;
  };
  assert.ok(time(approval.updated_at) <= time(record.verification.verified_at));
  assert.ok(time(record.verification.verified_at) < time(record.verification.policy_valid_until));
  const result = JSON.parse(
    bound("docs/m0-ratification-approved.verification.json", record.verification_sha256),
  );
  assert.equal(result.kind, "QUALIFIED_SOLO_OWNER_REVIEW");
  assert.equal(result.governance, record.governance);
  assert.equal(result.owner_approved, true);
  assert.equal(result.eligible_for_m0_ratification, true);
  assert.equal(result.subject_sha256, record.subject_sha256);
  assert.equal(result.agentic_review_sha256, record.agentic_review_sha256);
  for (const name of [
    "m0_accepted",
    "m1_admitted",
    "production_ready",
    "profile_enabled",
    "deployment_authorized",
  ])
    assert.equal(result[name], false);
  return {
    status: "CONSISTENT_HISTORICAL_SOLO_RATIFICATION",
    authenticated: false,
    m0_ratified: true,
    m0_accepted: false,
    m1_admitted: false,
    production_ready: false,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2);
    console.log(
      JSON.stringify(
        checkSoloRatification(JSON.parse(localRead("docs/m0-ratification-approved.json"))),
      ),
    );
  } catch {
    console.error("SOLO_RATIFICATION_RECORD_REJECTED");
    process.exitCode = 1;
  }
}
