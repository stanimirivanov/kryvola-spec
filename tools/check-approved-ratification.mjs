/** Administrative consistency only. Authentication remains a Platform gate. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readClosureRecord, roles, scope } from "./check-closure-record.mjs";
import { checkLedger, evidenceReader } from "./check-composition-qualification.mjs";
import { checkDecision } from "./check-ratification-decision.mjs";
import { sha256 } from "./provenance.mjs";

const localRead = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
const keys = (value, names) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...names].sort());
};
const digest = (value) => assert.match(value, /^[a-f0-9]{64}$/);
const text = (value) => assert.ok(typeof value === "string" && value.trim().length > 0);
export function checkSuccessor(record, read, history = localRead) {
  keys(record, [
    "version",
    "status",
    "scope",
    "predecessor_sha256",
    "proposal_revision",
    "ledger_sha256",
    "ratification_sha256",
    "packet_sha256",
    "reviews",
    "production_ready",
    "profile_enabled",
    "m0_accepted",
    "m1_admitted",
  ]);
  assert.equal(record.version, 1);
  assert.ok(["PROPOSED_SUCCESSOR", "RECORDED_SUCCESSOR"].includes(record.status));
  assert.equal(record.scope, scope);
  for (const flag of ["production_ready", "profile_enabled", "m0_accepted", "m1_admitted"])
    assert.equal(record[flag], false);
  assert.match(record.proposal_revision, /^[a-f0-9]{40}$/);
  const previous = history("docs/m0-ratification-decision.md");
  checkDecision(previous.toString(), history);
  assert.equal(record.predecessor_sha256, sha256(previous));
  for (const name of [
    "predecessor_sha256",
    "ledger_sha256",
    "ratification_sha256",
    "packet_sha256",
  ])
    digest(record[name]);
  const bound = (name, expected) => {
    const raw = read(name);
    assert.equal(sha256(raw), expected, `Changed subject: ${name}`);
    return JSON.parse(raw);
  };
  const ledger = bound("ledger.json", record.ledger_sha256);
  assert.equal(checkLedger(ledger, (name) => read(`composition/${name}`)).evidence_checked, true);
  const ratification = bound("ratification.json", record.ratification_sha256);
  keys(ratification, [
    "version",
    "status",
    "scope",
    "contract_revision",
    "candidate_sha256",
    "composition_sha256",
    "exclusions",
    "conditions",
  ]);
  assert.equal(ratification.version, 1);
  assert.equal(ratification.status, "RATIFIED_FOR_M0_NONPRODUCTION");
  assert.equal(ratification.scope, scope);
  assert.equal(ratification.contract_revision, ledger.components.spec.source_revision);
  assert.equal(
    ratification.contract_revision,
    readClosureRecord(previous.toString()).contract_revision,
  );
  assert.equal(ratification.candidate_sha256, ledger.candidate_sha256);
  assert.equal(ratification.composition_sha256, ledger.report_sha256);
  assert.deepEqual(ratification.conditions, []);
  assert.ok(Array.isArray(ratification.exclusions));
  ratification.exclusions.forEach(text);
  assert.equal(new Set(ratification.exclusions).size, ratification.exclusions.length);
  const packet = bound("review-packet.json", record.packet_sha256);
  keys(packet, [
    "version",
    "scope",
    "contract_revision",
    "candidate_digests",
    "composition_sha256",
    "exclusions",
  ]);
  assert.equal(packet.version, 1);
  assert.equal(packet.scope, scope);
  assert.equal(packet.contract_revision, ratification.contract_revision);
  assert.equal(packet.composition_sha256, ledger.report_sha256);
  assert.deepEqual(packet.exclusions, ratification.exclusions);
  const subjects = {
    "candidate.json": "composition/candidate/candidate.json",
    "admitted-candidate.json": "admitted-candidate.json",
    "selection.json": "composition/candidate/selection.json",
    "model.json": "composition/candidate/model.json",
    "measurement.json": "composition/candidate/measurement.json",
    "ratification.json": "ratification.json",
    "composition-report.json": "composition/report.json",
    "legal.json": "legal.json",
    "generated/manifest.json": "generated/manifest.json",
  };
  keys(packet.candidate_digests, Object.keys(subjects));
  for (const [name, path] of Object.entries(subjects)) {
    digest(packet.candidate_digests[name]);
    assert.equal(packet.candidate_digests[name], sha256(read(path)), `Packet subject: ${name}`);
  }
  assert.equal(sha256(read("generated/manifest.json")), sha256(history("generated/manifest.json")));
  const admitted = JSON.parse(read("admitted-candidate.json"));
  const base = JSON.parse(read("composition/candidate/candidate.json"));
  assert.equal(admitted.ratification_revision, record.proposal_revision);
  const stable = (value) =>
    Object.fromEntries(
      Object.entries(value).filter(([k]) => !["ratification_revision", "legal"].includes(k)),
    );
  assert.deepEqual(stable(admitted), stable(base));
  const legal = JSON.parse(read("legal.json"));
  assert.equal(legal.disposition, "REVIEWED_ALLOWED_NONPRODUCTION_FAKE_ONLY");
  assert.equal(legal.parameter_security, "APPROVED_RESEARCH_BASELINE_ONLY");
  assert.equal(legal.crypto_permissions, "DISTRIBUTION_SERVICE_DENIED");
  assert.deepEqual(legal.conditions, []);
  assert.deepEqual(admitted.legal, {
    disposition: "REVIEWED_ALLOWED",
    intended_use: legal.intended_use,
    evidence_sha256: [sha256(read("legal.json"))],
  });
  assert.ok(Array.isArray(record.reviews));
  if (record.status === "PROPOSED_SUCCESSOR") assert.deepEqual(record.reviews, []);
  else {
    assert.deepEqual(record.reviews.map((r) => r.role).sort(), [...roles].sort());
    for (const review of record.reviews) {
      keys(review, ["role", "decision_sha256", "bundle_sha256"]);
      digest(review.decision_sha256);
      digest(review.bundle_sha256);
      const slug = review.role.toLowerCase().replaceAll(" ", "-");
      const decision = bound(`reviews/${slug}.json`, review.decision_sha256);
      assert.equal(sha256(read(`reviews/${slug}.sigstore.json`)), review.bundle_sha256);
      assert.equal(decision.role, review.role);
      assert.equal(decision.subject_sha256, record.packet_sha256);
      assert.equal(decision.intended_use, legal.intended_use);
      assert.equal(decision.decision, "APPROVE");
      assert.deepEqual(decision.conditions, []);
      text(decision.identity);
      text(decision.authority);
    }
  }
  return {
    status: "CONSISTENT_NOT_AUTHENTICATED",
    record_status: record.status,
    authenticated: false,
    m0_accepted: false,
    m1_admitted: false,
    production_ready: false,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [recordPath, folder, ...extra] = process.argv.slice(2);
    assert.ok(recordPath && folder && extra.length === 0);
    const recordRead = evidenceReader(resolve(recordPath, ".."));
    const name = resolve(recordPath).split("/").at(-1);
    console.log(
      JSON.stringify(checkSuccessor(JSON.parse(recordRead(name)), evidenceReader(folder))),
    );
  } catch {
    console.error("SUCCESSOR_RECORD_REJECTED");
    process.exitCode = 1;
  }
}
