import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sha256 } from "../tools/provenance.mjs";

const read = (name) => readFileSync(new URL(`../docs/${name}`, import.meta.url));
test("actual solo review package binds qualified evidence and retains pending approval", () => {
  const subjectRaw = read("m0-solo-review/solo-subject.json");
  const reportRaw = read("m0-solo-review/agentic-review.json");
  const subject = JSON.parse(subjectRaw),
    report = JSON.parse(reportRaw);
  const policy = JSON.parse(read("m0-solo-review/operator-policy.pending.json"));
  const ledger = JSON.parse(read("m0-composition-qualification.json"));
  assert.equal(subject.governance, "SOLO_OWNER_AGENTIC_V1");
  assert.equal(subject.version, 2);
  assert.equal(subject.candidate_sha256, ledger.candidate_sha256);
  assert.equal(subject.composition_sha256, ledger.report_sha256);
  assert.equal(subject.production_ready, false);
  assert.equal(subject.profile_enabled, false);
  assert.equal(report.subject_sha256, sha256(subjectRaw));
  assert.equal(policy.subject_sha256, sha256(subjectRaw));
  assert.equal(policy.agentic_review_sha256, sha256(reportRaw));
  assert.equal(policy.selection_sha256, subject.selection_sha256);
  assert.equal(policy.composition_sha256, subject.composition_sha256);
  assert.equal(policy.intended_use, subject.intended_use);
  assert.equal(policy.owner_login, "stanimirivanov");
  assert.equal(policy.repository, "stanimirivanov/kryvola-spec");
  for (const name of ["pull_request", "reviewed_revision", "approval_comment_id"])
    assert.equal(policy[name], null);
  assert.deepEqual(report.repositories.sort(), ["engines", "fabric", "ml", "platform", "spec"]);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.checks.compatibility.status, "PASS");
  for (const domain of ["security", "dependency_licensing", "operations"])
    assert.equal(report.checks[domain].status, "LIMITATION");
  assert.ok(report.residual_risks.length > 0 && report.limitations.length > 0);
  assert.deepEqual(
    subject.exclusions,
    JSON.parse(read("m0-ratification-proposal.json")).exclusions,
  );
});
