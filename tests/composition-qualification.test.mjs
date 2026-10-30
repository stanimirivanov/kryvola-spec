import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkLedger,
  components,
  evidenceReader,
} from "../tools/check-composition-qualification.mjs";
import { sha256 } from "../tools/provenance.mjs";

const pending = JSON.parse(
  readFileSync(new URL("../docs/m0-composition-qualification.json", import.meta.url)),
);
const bytes = (value) => Buffer.from(JSON.stringify(value));
// Deliberately fabricated observations; not a live qualification or signed fixture.
function fixture(change = () => {}) {
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

test("pending checked-in ledger and CLI preserve all blockers", () => {
  assert.deepEqual(checkLedger(pending), {
    status: "PENDING_QUALIFICATION",
    evidence_checked: false,
    authenticated: false,
    production_ready: false,
    m0_accepted: false,
    m1_admitted: false,
  });
  const result = spawnSync(process.execPath, ["tools/check-composition-qualification.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).evidence_checked, false);
  for (const key of [
    "components",
    "candidate_sha256",
    "input_lock_sha256",
    "report_sha256",
    "evidence",
    "cleanup_verified",
  ])
    assert.throws(() => checkLedger({ ...pending, [key]: "invented" }));
});
test("synthetic retained bytes can establish consistency only", () => {
  const f = fixture();
  assert.deepEqual(checkLedger(f.ledger, f.read), {
    status: "RECORDED_NONPRODUCTION_QUALIFICATION",
    evidence_checked: true,
    authenticated: false,
    production_ready: false,
    m0_accepted: false,
    m1_admitted: false,
  });
  assert.throws(() => checkLedger(f.ledger));
});
test("missing or changed retained files, archive and report fail", () => {
  for (const name of fixture().files.keys()) {
    for (const replacement of [undefined, Buffer.from("changed")]) {
      const f = fixture();
      if (replacement) f.files.set(name, replacement);
      else f.files.delete(name);
      assert.throws(() => checkLedger(f.ledger, f.read), `Reject modified file: ${name}`);
    }
  }
});
test("identities, versions, hashes, references and forbidden claims fail closed", () => {
  for (const mutate of [
    (l) => {
      l.components.ml = undefined;
    },
    (l) => {
      delete l.components.fabric;
    },
    (l) => {
      l.components.platform.source_revision = "main";
    },
    (l) => {
      l.components.ml.version = "latest";
    },
    (l) => {
      l.components.engines.name = "kryvola-ml";
    },
    (l) => {
      l.components.ml.artifact_sha256 = "bad";
    },
    (l) => {
      l.report_sha256 = "0".repeat(64);
    },
    (l) => {
      l.candidate_sha256 = "0".repeat(64);
    },
    (l) => {
      l.cleanup_verified = false;
    },
    (l) => {
      l.status = "ACCEPTED";
    },
    (l) => {
      l.production_ready = true;
    },
    (l) => {
      l.m0_accepted = true;
    },
    (l) => {
      l.m1_admitted = true;
    },
    (l) => {
      l.evidence.reference =
        "https://example.invalid/latest/evidence.tar#sha256=" + l.evidence.archive_sha256;
    },
    (l) => {
      l.evidence.reference = l.evidence.reference.replace("https:", "http:");
    },
    (l) => {
      l.evidence.reference = l.evidence.reference.replace(
        "example.invalid",
        "user:password@example.invalid",
      );
    },
    (l) => {
      l.evidence.reference = l.evidence.reference.replace("#", "?token=private#");
    },
    (l) => {
      l.evidence.reference = l.evidence.reference.replace(/.$/, "f");
    },
  ]) {
    const f = fixture();
    mutate(f.ledger);
    assert.throws(() => checkLedger(f.ledger, f.read));
  }
});
test("even rehashed candidate/lock/report cannot claim acceptance or hide contradictions", () => {
  for (const mutate of [
    ({ candidate }) => {
      candidate.profile_enabled = true;
    },
    ({ candidate }) => {
      candidate.legal.disposition = "REVIEWED_ALLOWED";
    },
    ({ candidate }) => {
      candidate.ratification_revision = "1".repeat(40);
    },
    ({ lock }) => {
      lock.composition_tests = "PASSED";
    },
    ({ lock }) => {
      lock.m1_admitted = true;
    },
  ]) {
    const f = fixture(mutate);
    assert.throws(() => checkLedger(f.ledger, f.read));
  }
  for (const mutate of [
    (r) => {
      r.cleanup_verified = false;
    },
    (r) => {
      r.production_ready = true;
    },
    (r) => {
      r.platform_source = "0".repeat(40);
    },
    (r) => {
      delete r.subjects["live/isolation-report.json"];
    },
  ]) {
    const f = fixture();
    mutate(f.report);
    f.files.set("report.json", bytes(f.report));
    f.ledger.report_sha256 = sha256(f.files.get("report.json"));
    assert.throws(() => checkLedger(f.ledger, f.read));
  }
});
test("filesystem reader rejects links and traversal; CLI errors stay bounded", () => {
  const root = mkdtempSync(join(tmpdir(), "qualification-ledger-"));
  try {
    writeFileSync(join(root, "file"), "fixture");
    symlinkSync(join(root, "file"), join(root, "link"));
    mkdirSync(join(root, "directory"));
    symlinkSync(join(root, "directory"), join(root, "linked-directory"));
    const read = evidenceReader(root);
    assert.equal(read("file").toString(), "fixture");
    for (const path of ["link", "linked-directory/file", "../file", "/file", "./file", "missing"])
      assert.throws(() => read(path));
    const result = spawnSync(
      process.execPath,
      ["tools/check-composition-qualification.mjs", join(root, "missing")],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), "COMPOSITION_LEDGER_REJECTED");
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
