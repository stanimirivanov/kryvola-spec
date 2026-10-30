import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./provenance.mjs";

// A frozen pending-review record, not an approval/authentication protocol.
export const pins = Object.freeze({
  "generated/manifest.json": "2df957464b4832b37624a61436786207042be1fde24dfc5c5e0d518d66882f35",
  "bindings/manifest.json": "8cc787ffa59de095ac2df92db453e8a84f57c2e0f2e57c4127bbc01c68486bc9",
  "generated/fixtures/fhe-q1-assurance.json":
    "267dee8330668952adf11fe00cd96d0c5a45217d17b714e4266485dfb6c48eb0",
  "docs/ownership.md": "b62be8e8f41fea699990e8dcae305197577f0702a3e0befaa73248d8eeb85128",
});
export function checkRatification(
  text,
  read = (path) => readFileSync(new URL(`../${path}`, import.meta.url)),
) {
  assert.ok(
    text.includes("M0 decision: **BLOCKED_PENDING_SIGNOFFS**."),
    "Ratification is not approved",
  );
  assert.ok(text.includes("1a5b57a590487ba116913050af8041f5e5f1fb52"), "Missing contract source");
  for (const [path, expected] of Object.entries(pins)) {
    assert.equal(sha256(read(path)), expected, `Candidate changed: ${path}`);
    assert.ok(text.includes(expected), `Record lost binding: ${path}`);
  }
  const profile = JSON.parse(read("generated/fixtures/fhe-q1-assurance.json"));
  assert.equal(profile.enabled, false);
  assert.equal(profile.review_status, "UNREVIEWED");
  assert.deepEqual(profile.review_evidence, []);
  const rows = text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  for (const role of [
    "Spec lead",
    "Fabric lead",
    "Engines lead",
    "ML lead",
    "Platform lead",
    "Security reviewer",
    "Legal reviewer",
    "Operational owner",
  ]) {
    const matches = rows.filter(([name]) => name === role);
    assert.equal(matches.length, 1, `Missing or duplicate reviewer role: ${role}`);
    assert.deepEqual(
      matches[0].slice(1),
      ["NOT_NOMINATED", "MISSING", "PENDING"],
      "No inferred approval",
    );
  }
  return "BLOCKED_PENDING_SIGNOFFS";
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = readFileSync(new URL("../docs/m0-ratification.md", import.meta.url), "utf8");
  console.log(
    `${checkRatification(text)}; record consistency only, not ratification or M1 admission.`,
  );
}
