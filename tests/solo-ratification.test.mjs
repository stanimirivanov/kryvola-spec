import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkSoloRatification } from "../tools/check-solo-ratification.mjs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
const original = JSON.parse(read("docs/m0-ratification-approved.json"));
test("actual ratification preserves historical evidence and never grants deployment", () => {
  assert.deepEqual(checkSoloRatification(original), {
    status: "CONSISTENT_HISTORICAL_SOLO_RATIFICATION",
    authenticated: false,
    m0_ratified: true,
    m0_accepted: false,
    m1_admitted: false,
    production_ready: false,
  });
  const cli = spawnSync(process.execPath, ["tools/check-solo-ratification.mjs"], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).authenticated, false);
});
test("altered identities, subjects, statuses and activation claims reject", () => {
  for (const [key, value] of [
    ["version", 1],
    ["status", "PENDING"],
    ["m0_ratified", false],
    ["m0_accepted", true],
    ["m1_admitted", true],
    ["deployment_authorized", true],
    ["subject_sha256", "0".repeat(64)],
    ["reviewed_revision", "b".repeat(40)],
    ["candidate_sha256", "0".repeat(64)],
    ["exclusions", []],
  ])
    assert.throws(() => checkSoloRatification({ ...original, [key]: value }));
});
test("missing or changed frozen evidence rejects independently of record prose", () => {
  for (const path of [
    "docs/m0-ratification-decision.md",
    "docs/m0-ratification-proposal.json",
    "docs/adr/0004-solo-owner-agentic-review.md",
    "docs/m0-solo-review/solo-subject.json",
    "docs/m0-solo-review/agentic-review.json",
    "docs/m0-ratification-approved.approval.json",
    "docs/m0-ratification-approved.verification.json",
  ])
    assert.throws(() =>
      checkSoloRatification(original, (name) =>
        name === path ? Buffer.from("changed") : read(name),
      ),
    );
});
test("recorded verification must have occurred before policy expiry", () => {
  const record = structuredClone(original);
  record.verification.policy_valid_until = "2000-01-01T00:00:00Z";
  assert.throws(() => checkSoloRatification(record));
  record.verification.verified_at = "1999-01-01T00:00:00Z";
  assert.throws(() => checkSoloRatification(record));
});
