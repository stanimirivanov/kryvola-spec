/** Local evidence consistency only; never authenticates or admits a release set. */
import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./provenance.mjs";

export const components = Object.freeze(["spec", "fabric", "engines", "ml", "platform"]);
const flags = { production_ready: false, m0_accepted: false, m1_admitted: false };
const keys = (value, expected) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
};
const digest = (value) => assert.match(value, /^[a-f0-9]{64}$/);
const revision = (value) => assert.match(value, /^[a-f0-9]{40}$/);
const nonproduction = (value) => {
  for (const [key, expected] of Object.entries(flags)) assert.equal(value[key], expected, key);
};
function reference(value) {
  assert.equal(typeof value, "string");
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.equal(url.username + url.password + url.search, "");
  assert.match(url.hash, /^#sha256=[a-f0-9]{64}$/);
  assert.ok(url.pathname.length > 1 && !/\/(latest|main|master)(\/|$)/i.test(url.pathname));
}
export function checkLedger(ledger, read) {
  keys(ledger, [
    "version",
    "status",
    "components",
    "candidate_sha256",
    "input_lock_sha256",
    "report_sha256",
    "evidence",
    "cleanup_verified",
    ...Object.keys(flags),
  ]);
  assert.equal(ledger.version, 1);
  nonproduction(ledger);
  const subjects = [
    "components",
    "candidate_sha256",
    "input_lock_sha256",
    "report_sha256",
    "evidence",
    "cleanup_verified",
  ];
  if (ledger.status === "PENDING_QUALIFICATION") {
    for (const key of subjects) assert.equal(ledger[key], null, `Pending ${key}`);
    return {
      status: "PENDING_QUALIFICATION",
      evidence_checked: false,
      authenticated: false,
      ...flags,
    };
  }
  assert.equal(ledger.status, "RECORDED_NONPRODUCTION_QUALIFICATION");
  assert.equal(typeof read, "function", "Retained evidence is required");
  assert.equal(ledger.cleanup_verified, true);
  for (const key of ["candidate_sha256", "input_lock_sha256", "report_sha256"]) digest(ledger[key]);
  keys(ledger.components, components);
  for (const [name, component] of Object.entries(ledger.components)) {
    keys(component, ["name", "version", "source_revision", "artifact_sha256"]);
    assert.equal(component.name, `kryvola-${name}`);
    revision(component.source_revision);
    digest(component.artifact_sha256);
    assert.equal(typeof component.version, "string");
    assert.match(component.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  }
  keys(ledger.evidence, ["reference", "archive_sha256"]);
  reference(ledger.evidence.reference);
  digest(ledger.evidence.archive_sha256);
  assert.equal(
    new URL(ledger.evidence.reference).hash,
    `#sha256=${ledger.evidence.archive_sha256}`,
  );
  assert.equal(sha256(read("evidence.tar")), ledger.evidence.archive_sha256);
  const reportRaw = read("report.json");
  assert.equal(sha256(reportRaw), ledger.report_sha256);
  const report = JSON.parse(reportRaw);
  assert.equal(report.kind, "EXACT_NONPRODUCTION_FIXTURE_COMPOSITION_TESTED");
  nonproduction(report);
  assert.equal(report.cleanup_verified, true);
  assert.deepEqual(report.components, ledger.components);
  assert.equal(report.platform_source, ledger.components.platform.source_revision);
  assert.equal(report.candidate_sha256, ledger.candidate_sha256);
  assert.equal(report.input_lock_sha256, ledger.input_lock_sha256);
  const retained = [
    "candidate/candidate.json",
    "candidate/lock.json",
    "candidate/selection.json",
    "candidate/model.json",
    "candidate/measurement.json",
    "live/network-report.json",
    "live/fake-workflow-report.json",
    "live/release-conformance-report.json",
    "live/isolation-report.json",
    "live/network-observations.jsonl",
  ];
  keys(report.subjects, retained);
  for (const [name, expected] of Object.entries(report.subjects)) {
    digest(expected);
    assert.equal(sha256(read(name)), expected, `Retained subject changed: ${name}`);
  }
  const candidateRaw = read("candidate/candidate.json"),
    lockRaw = read("candidate/lock.json");
  assert.equal(sha256(candidateRaw), ledger.candidate_sha256);
  assert.equal(sha256(lockRaw), ledger.input_lock_sha256);
  const candidate = JSON.parse(candidateRaw),
    lock = JSON.parse(lockRaw);
  assert.deepEqual(candidate.components, ledger.components);
  assert.equal(candidate.production_ready, false);
  assert.equal(candidate.profile_enabled, false);
  assert.equal(candidate.qualification, "UNQUALIFIED");
  assert.equal(candidate.ratification_revision, null);
  assert.equal(candidate.legal.disposition, "UNRESOLVED");
  assert.equal(lock.candidate_sha256, ledger.candidate_sha256);
  assert.equal(lock.kind, "VERIFIED_PUBLISHERS_UNSIGNED_UNTESTED_M0_CANDIDATE");
  assert.equal(lock.composition_tests, "NOT_RUN");
  assert.equal(lock.legal, "PENDING");
  assert.equal(lock.ratification, "PENDING");
  assert.equal(lock.m0_accepted, false);
  assert.equal(lock.m1_admitted, false);
  for (const [key, path] of [
    ["selection_sha256", "selection"],
    ["model_sha256", "model"],
    ["measurement_sha256", "measurement"],
  ]) {
    assert.equal(lock[key], sha256(read(`candidate/${path}.json`)));
  }
  return {
    status: "RECORDED_NONPRODUCTION_QUALIFICATION",
    evidence_checked: true,
    authenticated: false,
    ...flags,
  };
}
export function evidenceReader(folder) {
  const root = resolve(folder);
  assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink());
  return (name) => {
    assert.ok(/^[a-zA-Z0-9._/-]+$/.test(name) && !name.startsWith("/"));
    const parts = name.split("/");
    assert.ok(parts.every((part) => part && part !== "." && part !== ".."));
    let path = root;
    for (const [index, part] of parts.entries()) {
      path = resolve(path, part);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink());
      assert.ok(index === parts.length - 1 ? stat.isFile() : stat.isDirectory());
      assert.ok(stat.size <= (name === "evidence.tar" ? 64 << 20 : 16 << 20));
    }
    return readFileSync(path);
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [ledgerPath, evidencePath, ...extra] = process.argv.slice(2);
    assert.equal(extra.length, 0);
    const path =
      ledgerPath ??
      fileURLToPath(new URL("../docs/m0-composition-qualification.json", import.meta.url));
    console.log(
      JSON.stringify(
        checkLedger(
          JSON.parse(readFileSync(path)),
          evidencePath ? evidenceReader(evidencePath) : undefined,
        ),
      ),
    );
  } catch {
    console.error("COMPOSITION_LEDGER_REJECTED");
    process.exitCode = 1;
  }
}
