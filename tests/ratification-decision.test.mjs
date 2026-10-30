import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readClosureRecord } from "../tools/check-closure-record.mjs";
import { blockBytes, checkDecision, predecessors } from "../tools/check-ratification-decision.mjs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
const markdown = read("docs/m0-ratification-decision.md").toString();
function changeRecord(mutate) {
  const record = readClosureRecord(markdown);
  mutate(record);
  return markdown.replace(
    blockBytes(markdown, "closure-record").toString(),
    JSON.stringify(record, null, 2),
  );
}

test("pending successor and standalone command never authenticate or admit", () => {
  assert.deepEqual(checkDecision(markdown), {
    status: "BLOCKED_PENDING_SIGNOFFS",
    packet_sha256: "aaa4a40a55d444da13262b5a6dd0aab9dd4fc540661200049f19fb8b2af08869",
    authenticated: false,
    m0_accepted: false,
    m1_admitted: false,
  });
  const result = spawnSync(process.execPath, ["tools/check-ratification-decision.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).authenticated, false);
});
test("all required roles, exact candidate and predecessor remain mandatory", () => {
  for (const mutate of [
    (r) => r.reviews.pop(),
    (r) => {
      r.reviews[0].role = r.reviews[1].role;
    },
    (r) => {
      r.contract_revision = "0".repeat(40);
    },
    (r) => {
      r.supersedes.sha256 = "0".repeat(64);
    },
    (r) => {
      r.supersedes = null;
    },
    (r) => {
      r.candidate_digests["generated/manifest.json"] = "0".repeat(64);
    },
    (r) => {
      r.composition_sha256 = "0".repeat(64);
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
  ])
    assert.throws(() => checkDecision(changeRecord(mutate)));
});
test("even complete approval-shaped rows cannot populate the pending successor", () => {
  const changed = changeRecord((record) =>
    Object.assign(record.reviews[0], {
      identity: "fixture-reviewer",
      authority: "fixture authority",
      decision: "APPROVE",
      review_url: "https://example.invalid/fixture",
      evidence_sha256: "a".repeat(64),
      subject_sha256: "b".repeat(64),
      intended_use: "fixture-only",
      conditions: [],
    }),
  );
  assert.throws(() => checkDecision(changed), /Approvals require authenticated/);
});
test("historical file drift fails independently of successor prose", () => {
  for (const name of Object.keys(predecessors))
    assert.throws(() =>
      checkDecision(markdown, (path) => (path === name ? Buffer.from("changed") : read(path))),
    );
  assert.throws(() =>
    checkDecision(markdown, (path) =>
      path === "generated/manifest.json" ? Buffer.from("changed") : read(path),
    ),
  );
});
test("scope, exclusions, packet digest and ambiguous JSON cannot drift", () => {
  const packet = blockBytes(markdown, "review-packet").toString();
  for (const mutate of [
    (p) => {
      p.scope = "PRODUCTION";
    },
    (p) => {
      p.composition_sha256 = "a".repeat(64);
    },
    (p) => p.exclusions.pop(),
    (p) => {
      p.candidate_digests["docs/m0-ratification.md"] = "0".repeat(64);
    },
  ]) {
    const changed = JSON.parse(packet);
    mutate(changed);
    assert.throws(() => checkDecision(markdown.replace(packet, JSON.stringify(changed, null, 2))));
  }
  assert.throws(() => checkDecision(markdown.replace("Review packet SHA-256:", "Missing digest:")));
  assert.throws(() =>
    checkDecision(markdown.replace(packet, packet.replace("{\n", '{\n  "version": 1,\n'))),
  );
  assert.throws(() => checkDecision(markdown + "\n```review-packet\n{}\n```"));
});
