import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseCandidate } from "../dist/release.js";
import { sha256 } from "./provenance.mjs";

/** Check exact raw file bindings, not signatures, external artifacts or approval authenticity. */
export function checkReleaseFiles(paths) {
  assert.equal(paths.length, 3, "Expected model, measurement and release JSON paths");
  const bytes = paths.map((path) => {
    assert.ok(statSync(path).size <= 131072, "Profile file exceeds 128 KiB");
    const data = readFileSync(path);
    assert.ok(data.length <= 131072, "Profile file grew beyond 128 KiB");
    return data;
  });
  const [model, report, candidate] = bytes.map((data) =>
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
  );
  const checked = validateReleaseCandidate(model, report, candidate);
  assert.equal(checked.model_descriptor_sha256, sha256(bytes[0]), "Model file digest mismatch");
  assert.equal(
    checked.measurement_report_sha256,
    sha256(bytes[1]),
    "Measurement file digest mismatch",
  );
  return checked;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  const checked = checkReleaseFiles(
    paths.length
      ? paths
      : ["model", "measurement", "release"].map(
          (name) => new URL(`../generated/fixtures/profiles/${name}.json`, import.meta.url),
        ),
  );
  console.log(
    `Consistent ${checked.stage}; UNQUALIFIED, disabled; reviews and external artifact digests not authenticated.`,
  );
}
