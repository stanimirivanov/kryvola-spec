import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const repositories = ["spec", "fabric", "engines", "ml", "platform"].map((x) => `kryvola-${x}`);
// Required architectural components; expand deliberately when a reviewed component is introduced.
const components = `contract-definitions assurance-and-leakage-profiles
wire-canonical-and-state-conformance gateway-and-admission artifact-service
operation-registry-and-coordinator event-outbox-and-ingress temporal-workflows-and-activities
ray-dispatch-bridge receipt-and-release-service owner-agent interactive-session-coordinator
attestation-and-envelope-adapters fabric-workflow-conformance-fixtures engine-api-and-fake-engine
tfhe-owner-crypto tfhe-evaluation zkvm-guests-and-provers optional-native-engines threshold-crypto-adapter
engine-and-owner-package-builds owner-sdk model-import-and-quantization reference-fixture-semantics
plan-compiler-and-cost-model dp-accounting service-deployment-and-identities benchmark-and-fault-harness
release-set-and-qualification observability-and-recovery`.split(/\s+/);
const cellsOf = (line) =>
  line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());

function checkOwnership(document) {
  const section = document.split(/## Implementation ownership\r?\n/)[1]?.split(/\r?\n## /)[0];
  assert.ok(section, "missing implementation ownership section");
  const lines = section.split(/\r?\n/).filter((line) => line.startsWith("|"));
  assert.deepEqual(cellsOf(lines[0]), [
    "Component",
    "Implementation owner",
    "Responsibility and boundary",
  ]);
  const seen = new Set();
  const owners = new Set();
  for (const line of lines.slice(2)) {
    const cells = cellsOf(line);
    assert.equal(cells.length, 3, "ownership row must have three cells");
    const [component, owner, boundary] = cells;
    assert.ok(!seen.has(component), `duplicate component: ${component}`);
    assert.ok(repositories.includes(owner), `unknown or multiple implementation owners: ${owner}`);
    assert.ok(boundary, `missing boundary: ${component}`);
    seen.add(component);
    owners.add(owner);
  }
  assert.deepEqual([...seen].sort(), [...components].sort(), "missing or unexpected components");
  assert.deepEqual(
    [...owners].sort(),
    [...repositories].sort(),
    "all five owners must be represented",
  );
}

test("ownership inventory covers each architectural component exactly once", () => {
  const document = read("docs/ownership.md");
  checkOwnership(document);
  checkOwnership(document.replace(/\r?\n/g, "\r\n"));
});

test("ownership checks reject missing, duplicate, unknown and multiple owners", () => {
  const document = read("docs/ownership.md");
  const row = document.split(/\r?\n/).find((line) => /^\|\s*owner-agent\s*\|/.test(line));
  assert.ok(row);
  for (const [invalid, reason] of [
    [document.replace(row, ""), /missing or unexpected components/],
    [document.replace(row, `${row}\n${row}`), /duplicate component/],
    [
      document.replace(row, row.replace("kryvola-fabric", "kryvola-unknown")),
      /unknown or multiple/,
    ],
    [
      document.replace(row, row.replace("kryvola-fabric", "kryvola-fabric, kryvola-engines")),
      /unknown or multiple/,
    ],
  ])
    assert.throws(() => checkOwnership(invalid), reason);
});

function checkLinks(path, document) {
  for (const match of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^https?:\/\//.test(href) || href.startsWith("#")) continue;
    const target = href.split("#")[0];
    assert.ok(
      existsSync(resolve(root, dirname(path), target)),
      `${path}: missing local link ${href}`,
    );
  }
}

test("governance index, documents and template have resolving local links", () => {
  for (const path of [
    "docs/README.md",
    "docs/ownership.md",
    "docs/adr/0003-release-governance.md",
    "docs/adr/template.md",
    "docs/progress.md",
  ])
    checkLinks(path, read(path));
  assert.throws(() => checkLinks("docs/ownership.md", "[missing](missing-governance-document.md)"));
});
