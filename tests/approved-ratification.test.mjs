import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkSuccessor } from "../tools/check-approved-ratification.mjs";
import { roles, scope } from "../tools/check-closure-record.mjs";
import { components } from "../tools/check-composition-qualification.mjs";
import { sha256 } from "../tools/provenance.mjs";

const pending = JSON.parse(
  readFileSync(new URL("../docs/m0-composition-qualification.json", import.meta.url)),
);
const bytes = (value) => Buffer.from(JSON.stringify(value));
// Deliberately fabricated observations; not a live qualification or signed fixture.
function baseFixture(change = () => {}) {
  const selected = Object.fromEntries(
    components.map((name, index) => [
      name,
      {
        name: `kryvola-${name}`,
        version: "0.1.0-dev0.gfixture",
        source_revision: String(index + 1).repeat(40),
        artifact_sha256: String(index + 1).repeat(64),
      },
    ]),
  );
  const candidate = {
    components: selected,
    production_ready: false,
    profile_enabled: false,
    qualification: "UNQUALIFIED",
    ratification_revision: null,
    legal: { disposition: "UNRESOLVED" },
  };
  const lock = {
    kind: "VERIFIED_PUBLISHERS_UNSIGNED_UNTESTED_M0_CANDIDATE",
    composition_tests: "NOT_RUN",
    legal: "PENDING",
    ratification: "PENDING",
    m0_accepted: false,
    m1_admitted: false,
  };
  change({ candidate, lock, selected });
  const files = new Map([
    ["candidate/candidate.json", bytes(candidate)],
    ["candidate/selection.json", bytes({ fixture: "selection" })],
    ["candidate/model.json", bytes({ fixture: "model" })],
    ["candidate/measurement.json", bytes({ fixture: "measurement" })],
    ...[
      "network-report.json",
      "fake-workflow-report.json",
      "release-conformance-report.json",
      "isolation-report.json",
      "network-observations.jsonl",
    ].map((name) => [`live/${name}`, bytes({ fixture: name })]),
    ["evidence.tar", Buffer.from("opaque synthetic archive hash input; never extracted")],
  ]);
  lock.candidate_sha256 = sha256(files.get("candidate/candidate.json"));
  for (const name of ["selection", "model", "measurement"])
    lock[`${name}_sha256`] = sha256(files.get(`candidate/${name}.json`));
  files.set("candidate/lock.json", bytes(lock));
  const report = {
    kind: "EXACT_NONPRODUCTION_FIXTURE_COMPOSITION_TESTED",
    components: selected,
    platform_source: selected.platform.source_revision,
    candidate_sha256: lock.candidate_sha256,
    input_lock_sha256: sha256(files.get("candidate/lock.json")),
    cleanup_verified: true,
    production_ready: false,
    m0_accepted: false,
    m1_admitted: false,
    subjects: Object.fromEntries(
      [...files]
        .filter(([name]) => name !== "evidence.tar")
        .map(([name, raw]) => [name, sha256(raw)]),
    ),
  };
  files.set("report.json", bytes(report));
  const archive = sha256(files.get("evidence.tar"));
  const ledger = {
    ...pending,
    status: "RECORDED_NONPRODUCTION_QUALIFICATION",
    components: structuredClone(selected),
    candidate_sha256: report.candidate_sha256,
    input_lock_sha256: report.input_lock_sha256,
    report_sha256: sha256(files.get("report.json")),
    cleanup_verified: true,
    evidence: {
      reference: `https://example.invalid/immutable/fixture/evidence.tar#sha256=${archive}`,
      archive_sha256: archive,
    },
  };
  return {
    ledger,
    files,
    report,
    read: (name) => {
      assert.ok(files.has(name), name);
      return files.get(name);
    },
  };
}

const history = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
function fixture(recorded = false, mutate = () => {}) {
  const f = baseFixture(({ selected }) => {
    selected.spec.source_revision = "1a5b57a590487ba116913050af8041f5e5f1fb52";
  });
  const files = new Map([...f.files].map(([name, raw]) => [`composition/${name}`, raw]));
  files.set("ledger.json", bytes(f.ledger));
  const ratification = {
    version: 1,
    status: "RATIFIED_FOR_M0_NONPRODUCTION",
    scope,
    contract_revision: f.ledger.components.spec.source_revision,
    candidate_sha256: f.ledger.candidate_sha256,
    composition_sha256: f.ledger.report_sha256,
    exclusions: ["synthetic test only"],
    conditions: [],
  };
  const legal = {
    disposition: "REVIEWED_ALLOWED_NONPRODUCTION_FAKE_ONLY",
    intended_use: "synthetic only",
    parameter_security: "APPROVED_RESEARCH_BASELINE_ONLY",
    crypto_permissions: "DISTRIBUTION_SERVICE_DENIED",
    conditions: [],
  };
  files.set("legal.json", bytes(legal));
  files.set("ratification.json", bytes(ratification));
  const admitted = JSON.parse(files.get("composition/candidate/candidate.json"));
  admitted.ratification_revision = "a".repeat(40);
  admitted.legal = {
    disposition: "REVIEWED_ALLOWED",
    intended_use: legal.intended_use,
    evidence_sha256: [sha256(files.get("legal.json"))],
  };
  files.set("admitted-candidate.json", bytes(admitted));
  files.set("generated/manifest.json", history("generated/manifest.json"));
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
  const packet = {
    version: 1,
    scope,
    contract_revision: ratification.contract_revision,
    composition_sha256: ratification.composition_sha256,
    exclusions: ratification.exclusions,
    candidate_digests: Object.fromEntries(
      Object.entries(subjects).map(([name, path]) => [name, sha256(files.get(path))]),
    ),
  };
  files.set("review-packet.json", bytes(packet));
  const record = {
    version: 1,
    status: recorded ? "RECORDED_SUCCESSOR" : "PROPOSED_SUCCESSOR",
    scope,
    predecessor_sha256: sha256(history("docs/m0-ratification-decision.md")),
    proposal_revision: admitted.ratification_revision,
    ledger_sha256: sha256(files.get("ledger.json")),
    ratification_sha256: sha256(files.get("ratification.json")),
    packet_sha256: sha256(files.get("review-packet.json")),
    reviews: [],
    production_ready: false,
    profile_enabled: false,
    m0_accepted: false,
    m1_admitted: false,
  };
  if (recorded)
    for (const role of roles) {
      const slug = role.toLowerCase().replaceAll(" ", "-");
      const decision = bytes({
        role,
        subject_sha256: record.packet_sha256,
        intended_use: legal.intended_use,
        decision: "APPROVE",
        conditions: [],
        identity: "test person",
        authority: "test role",
      });
      const bundle = bytes({ fixture: "not a signature" });
      files.set(`reviews/${slug}.json`, decision);
      files.set(`reviews/${slug}.sigstore.json`, bundle);
      record.reviews.push({
        role,
        decision_sha256: sha256(decision),
        bundle_sha256: sha256(bundle),
      });
    }
  mutate({ record, files, packet, ratification });
  return {
    record,
    read: (name) => {
      assert.ok(files.has(name), `Missing ${name}`);
      return files.get(name);
    },
  };
}
test("proposed and recorded synthetic records never authenticate or admit", () => {
  for (const recorded of [false, true]) {
    const f = fixture(recorded),
      result = checkSuccessor(f.record, f.read);
    assert.equal(result.status, "CONSISTENT_NOT_AUTHENTICATED");
    for (const key of ["authenticated", "m0_accepted", "m1_admitted", "production_ready"])
      assert.equal(result[key], false);
  }
});
test("record bindings, scope, flags and role inventory fail closed", () => {
  for (const change of [
    (r) => {
      r.predecessor_sha256 = "0".repeat(64);
    },
    (r) => {
      r.ledger_sha256 = "0".repeat(64);
    },
    (r) => {
      r.proposal_revision = "main";
    },
    (r) => {
      r.proposal_revision = "b".repeat(40);
    },
    (r) => {
      r.scope = "production";
    },
    (r) => {
      r.profile_enabled = true;
    },
    (r) => {
      r.m0_accepted = true;
    },
    (r) => {
      r.reviews.pop();
    },
    (r) => {
      r.reviews[0].role = r.reviews[1].role;
    },
  ]) {
    const f = fixture(true, ({ record }) => change(record));
    assert.throws(() => checkSuccessor(f.record, f.read));
  }
});
test("missing or changed retained subjects, decisions and bundles reject", () => {
  const paths = [
    "ledger.json",
    "ratification.json",
    "review-packet.json",
    "composition/report.json",
    "composition/evidence.tar",
    "composition/live/isolation-report.json",
    "admitted-candidate.json",
    "legal.json",
    "generated/manifest.json",
    "reviews/security-reviewer.json",
    "reviews/legal-reviewer.sigstore.json",
  ];
  for (const path of paths) {
    const f = fixture(true, ({ files }) => files.set(path, bytes({ changed: true })));
    assert.throws(() => checkSuccessor(f.record, f.read));
  }
});
test("rehashed incompatible scope, composition and missing packet subjects reject", () => {
  for (const change of [
    (p) => {
      p.composition_sha256 = "0".repeat(64);
    },
    (p) => {
      delete p.candidate_digests["legal.json"];
    },
    (p) => {
      p.exclusions = [];
    },
  ]) {
    const f = fixture(false, ({ record, files, packet }) => {
      change(packet);
      files.set("review-packet.json", bytes(packet));
      record.packet_sha256 = sha256(files.get("review-packet.json"));
    });
    assert.throws(() => checkSuccessor(f.record, f.read));
  }
  const f = fixture(false, ({ record, files }) => {
    files.set("ledger.json", bytes(pending));
    record.ledger_sha256 = sha256(files.get("ledger.json"));
  });
  assert.throws(() => checkSuccessor(f.record, f.read));
});
test("CLI without explicit inputs fails safely and writes no record", () => {
  const result = spawnSync(process.execPath, ["tools/check-approved-ratification.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "SUCCESSOR_RECORD_REJECTED");
});
