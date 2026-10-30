/** Pending successor consistency only; approval authentication remains external. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkClosureRecord, readClosureRecord, roles, scope } from "./check-closure-record.mjs";
import { checkRatification, pins } from "./check-ratification.mjs";
import { sha256 } from "./provenance.mjs";

export const predecessors = Object.freeze({
  "docs/m0-ratification.md": "efdbed586b91ff08c2c08fdc6a0acdfa01bd08248e1c520a01a039b826a7c03d",
  "docs/m0-closure.md": "25f36224ee59ae9eb3f36f53de15eb3d315f5cfbd01e67adb922c7264c575ace",
});
export const exclusions = Object.freeze([
  "PROPOSED_NOT_ACCEPTED: real owner-to-owner transport/cache latency and durable inference require M1 work",
  "PROPOSED_NOT_ACCEPTED: GPU/PBS, alternate proof exports and private-witness claims remain disabled/unavailable",
  "PROPOSED_NOT_ACCEPTED: integer fixture arithmetic is not general model accuracy",
  "PROPOSED_NOT_ACCEPTED: production isolation and security qualification remain later gates",
  "MANDATORY_PENDING: scoped legal and parameter/security decisions; TFHE/SP1 distribution/service remain DENY",
  "MANDATORY_PENDING: signed tested five-component composition and operational disposition",
]);
const localRead = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
export function blockBytes(markdown, name) {
  const blocks = [...markdown.matchAll(new RegExp("```" + name + "\\n([\\s\\S]*?)\\n```", "g"))];
  assert.equal(blocks.length, 1, `Expected exactly one ${name} block`);
  return Buffer.from(blocks[0][1]);
}

export function checkDecision(markdown, read = localRead) {
  for (const [name, expected] of Object.entries(predecessors))
    assert.equal(sha256(read(name)), expected, `Historical record changed: ${name}`);
  checkRatification(read("docs/m0-ratification.md").toString(), read);
  const previous = read("docs/m0-closure.md").toString();
  checkClosureRecord(readClosureRecord(previous), { read });
  const record = readClosureRecord(markdown);
  assert.equal(
    blockBytes(markdown, "closure-record").toString(),
    JSON.stringify(record, null, 2),
    "Ambiguous successor JSON rendering",
  );
  checkClosureRecord(record, { read, previousBytes: blockBytes(previous, "closure-record") });
  assert.ok(record.supersedes !== null, "Missing predecessor binding");
  assert.equal(record.composition_sha256, null, "No composition has been supplied");
  for (const role of roles) {
    const review = record.reviews.find((row) => row.role === role);
    assert.equal(review.decision, "PENDING", "Approvals require authenticated successor evidence");
  }
  const packetBytes = blockBytes(markdown, "review-packet");
  const packet = JSON.parse(packetBytes);
  assert.equal(
    packetBytes.toString(),
    JSON.stringify(packet, null, 2),
    "Ambiguous packet JSON rendering",
  );
  assert.deepEqual(
    packet,
    {
      version: 1,
      scope,
      contract_revision: record.contract_revision,
      candidate_digests: { ...pins, ...predecessors },
      composition_sha256: null,
      exclusions: [...exclusions],
    },
    "Review packet scope or exact subjects changed",
  );
  assert.ok(
    markdown.includes(`Review packet SHA-256: ${sha256(packetBytes)}`),
    "Missing exact packet digest",
  );
  assert.ok(markdown.includes("M0 decision: **BLOCKED_PENDING_SIGNOFFS**."));
  return {
    status: "BLOCKED_PENDING_SIGNOFFS",
    packet_sha256: sha256(packetBytes),
    authenticated: false,
    m0_accepted: false,
    m1_admitted: false,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(checkDecision(localRead("docs/m0-ratification-decision.md").toString())),
  );
}
