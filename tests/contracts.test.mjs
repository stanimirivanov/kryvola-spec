import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Schema } from "effect";
import { artifactRefFixture, decodeArtifactRef, FoundationInventory } from "../dist/index.js";
import { checkManifest, checkProjection } from "../tools/check-architecture.mjs";

test("reference fixture round-trips without payload or credentials", () => {
  assert.deepEqual(decodeArtifactRef(artifactRefFixture), artifactRefFixture);
});

test("reference-only contract rejects payload, credentials, wrong digest and noncanonical lengths", () => {
  for (const change of [
    { ciphertext: "arbitrary-bytes" },
    { private_key: "forbidden" },
    { download_url: "https://example.invalid/?token=secret" },
    { manifest_digest: "A".repeat(64) },
    { byte_length: "01" },
    { byte_length: "1073741825" },
    { byte_length: 1 },
    { tenant_scope: "" },
    { tenant_scope: "tenant\n" },
    { manifest_digest: `${"a".repeat(64)}\n` },
    { byte_length: "1\n" },
  ])
    assert.throws(() => decodeArtifactRef({ ...artifactRefFixture, ...change }));
});

test("foundation inventory cannot enable an unqualified profile or claim production readiness", () => {
  const decode = Schema.decodeUnknownSync(FoundationInventory, { onExcessProperty: "error" });
  const input = {
    schema_version: "1",
    stage: "foundation",
    production_ready: false,
    profiles: [{ profile_id: "FHE-Q1", enabled: false, qualification: "unqualified" }],
  };
  assert.deepEqual(decode(input), input);
  assert.throws(() => decode({ ...input, production_ready: true }));
  assert.throws(() => decode({ ...input, profiles: [{ ...input.profiles[0], enabled: true }] }));
});

test("architecture guard accepts valid isolated input and rejects runtime and sibling dependencies", () => {
  const actual = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(checkManifest(actual), []);
  assert.match(
    checkManifest({
      ...actual,
      dependencies: { ...actual.dependencies, "@kryvola/fabric": "1.0.0" },
    }).join("\n"),
    /runtime repositories/,
  );
  assert.match(
    checkManifest({
      ...actual,
      dependencies: { ...actual.dependencies, helper: "file:..\/kryvola-fabric" },
    }).join("\n"),
    /local source/,
  );
});

test("projection guard fails closed when a filter or supported type is lost", () => {
  assert.deepEqual(checkProjection({ id: { type: "string", pattern: "^[a-z]+$" } }), []);
  assert.match(checkProjection({ id: { type: "string" } }).join("\n"), /constraint was lost/);
  assert.match(checkProjection({ id: { type: "number" } }).join("\n"), /unsupported/);
});
