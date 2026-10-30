import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sha256 } from "../tools/provenance.mjs";
import { bundle, verifyAssets } from "../tools/release.mjs";

const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
test("two committed bundle builds match and carry complete projection manifests", () => {
  const first = bundle(source);
  assert.deepEqual(first, bundle(source));
  const names = execFileSync("tar", ["-tf", "-"], { input: first, encoding: "utf8" }).split("\n");
  for (const name of [
    "generated/manifest.json",
    "bindings/manifest.json",
    "LICENSE",
    "pnpm-lock.yaml",
  ])
    assert.ok(names.includes(name));
  assert.ok(!names.some((name) => name.startsWith("node_modules/") || name.startsWith(".git/")));
  assert.throws(() => bundle("main"));
});
test("downloaded asset verification rejects drift, missing files, identity and provenance mismatch", () => {
  const folder = mkdtempSync(join(tmpdir(), "spec-assets-"));
  try {
    const archive = bundle(source);
    const provenance = {
      _type: "https://in-toto.io/Statement/v1",
      predicateType: "https://slsa.dev/provenance/v1",
      subject: [{ name: "contracts.tar", digest: { sha256: sha256(archive) } }],
      predicate: {
        buildDefinition: { externalParameters: { source } },
        runDetails: {
          builder: {
            id: "https://github.com/stanimirivanov/kryvola-spec/.github/workflows/release.yml@refs/heads/main",
          },
        },
      },
    };
    const reset = () => {
      const raw = JSON.stringify(provenance);
      writeFileSync(join(folder, "contracts.tar"), archive);
      writeFileSync(join(folder, "provenance.json"), raw);
      writeFileSync(join(folder, "manifest.sigstore.json"), "unsigned fixture");
      writeFileSync(
        join(folder, "manifest.json"),
        JSON.stringify({
          format: "spec-publication-v1",
          source,
          distribution: "EXPERIMENTAL_CONTRACTS_ONLY",
          production_ready: false,
          subjects: { "contracts.tar": sha256(archive), "provenance.json": sha256(raw) },
        }),
      );
    };
    reset();
    assert.equal(verifyAssets(folder, source).source, source); // integrity only, not signatures
    assert.throws(() => verifyAssets(folder, "0".repeat(40)));
    for (const name of ["contracts.tar", "provenance.json"]) {
      writeFileSync(join(folder, name), "changed");
      assert.throws(() => verifyAssets(folder, source));
      reset();
    }
    provenance.predicate.runDetails.builder.id = "wrong publisher";
    reset();
    assert.throws(() => verifyAssets(folder, source));
    rmSync(join(folder, "contracts.tar"));
    assert.throws(() => verifyAssets(folder, source));
    symlinkSync(join(folder, "provenance.json"), join(folder, "contracts.tar"));
    assert.throws(() => verifyAssets(folder, source));
    writeFileSync(join(folder, "unexpected.key"), "fixture");
    assert.throws(() => verifyAssets(folder, source));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test("release workflow restricts publication and qualifies all existing gates", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  for (const command of [
    "pnpm check",
    "pnpm check:canonical",
    "pnpm native:check",
    "node tools/release.mjs qualify",
  ])
    assert.ok(workflow.includes(command));
  assert.ok(workflow.includes("needs: qualify"));
  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(!workflow.includes("--clobber"));
});
