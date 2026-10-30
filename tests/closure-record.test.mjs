import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkClosureRecord, readClosureRecord } from "../tools/check-closure-record.mjs";
import { sha256 } from "../tools/provenance.mjs";

const markdown = readFileSync(new URL("../docs/m0-closure.md", import.meta.url), "utf8");
const record = readClosureRecord(markdown);
const copy = () => structuredClone(record);

test("pending closure record is checked by the standalone command", () => {
  assert.equal(checkClosureRecord(record), "CONSISTENT_NOT_AUTHENTICATED");
  const result = spawnSync(process.execPath, ["tools/check-closure-record.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CONSISTENT_NOT_AUTHENTICATED/);
});
test("missing/duplicate roles, ambiguous scope and activation fail closed", () => {
  for (const mutate of [
    (r) => r.reviews.pop(),
    (r) => {
      r.reviews[0].role = r.reviews[1].role;
    },
    (r) => {
      r.scope = "PRODUCTION";
    },
    (r) => {
      r.status = "APPROVED";
    },
    (r) => {
      r.m1_admitted = true;
    },
    (r) => {
      r.profile_enabled = true;
    },
    (r) => {
      r.production_ready = true;
    },
    (r) => {
      r.extra = "ignored?";
    },
    (r) => {
      r.contract_revision = "0".repeat(40);
    },
    (r) => {
      r.candidate_digests[Object.keys(r.candidate_digests)[0]] = "0".repeat(64);
    },
    (r) => {
      r.reviews[0].identity = "nomination is not approval";
    },
  ]) {
    const changed = copy();
    mutate(changed);
    assert.throws(() => checkClosureRecord(changed));
  }
});
test("candidate files are independently hashed", () => {
  for (const path of Object.keys(record.candidate_digests)) {
    assert.throws(() =>
      checkClosureRecord(record, {
        read: (name) =>
          name === path
            ? Buffer.from("changed")
            : readFileSync(new URL(`../${name}`, import.meta.url)),
      }),
    );
  }
});
test("even complete approval-shaped evidence cannot authenticate or admit", () => {
  const changed = copy();
  Object.assign(changed.reviews[0], {
    identity: "fixture-reviewer",
    authority: "fixture spec lead",
    decision: "APPROVE",
    review_url: "https://example.invalid/review",
    evidence_sha256: "a".repeat(64),
    subject_sha256: "b".repeat(64),
    intended_use: "non-production research",
  });
  assert.equal(checkClosureRecord(changed), "CONSISTENT_NOT_AUTHENTICATED");
  for (const field of [
    "identity",
    "authority",
    "review_url",
    "evidence_sha256",
    "subject_sha256",
    "intended_use",
  ]) {
    const invalid = structuredClone(changed);
    invalid.reviews[0][field] = null;
    assert.throws(() => checkClosureRecord(invalid));
  }
  changed.reviews[0].decision = "CONDITIONAL";
  assert.throws(() => checkClosureRecord(changed));
  changed.reviews[0].conditions = ["Resolve fixture-only condition"];
  assert.equal(checkClosureRecord(changed), "CONSISTENT_NOT_AUTHENTICATED");
  changed.reviews[0].decision = "REJECT";
  assert.equal(checkClosureRecord(changed), "CONSISTENT_NOT_AUTHENTICATED");
});
test("supersession requires exact predecessor bytes and preserves scope/pins", () => {
  const previousBytes = Buffer.from(JSON.stringify(record));
  const successor = copy();
  successor.supersedes = { sha256: sha256(previousBytes), reason: "Record a review" };
  assert.equal(checkClosureRecord(successor, { previousBytes }), "CONSISTENT_NOT_AUTHENTICATED");
  assert.throws(() => checkClosureRecord(successor));
  assert.throws(() => checkClosureRecord(successor, { previousBytes: Buffer.from("{}") }));
  const other = copy();
  other.scope = "OTHER_SCOPE";
  const otherBytes = Buffer.from(JSON.stringify(other));
  successor.supersedes.sha256 = sha256(otherBytes);
  assert.throws(() => checkClosureRecord(successor, { previousBytes: otherBytes }));
  successor.supersedes = { sha256: sha256(previousBytes), reason: " " };
  assert.throws(() => checkClosureRecord(successor, { previousBytes }));
});
test("missing or ambiguous embedded records are rejected", () => {
  assert.throws(() => readClosureRecord("no record"));
  assert.throws(() => readClosureRecord(markdown + markdown));
});
