import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("isolated mutation attempts cannot change byte guards, schemas or projection policy", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import assert from "node:assert/strict";
    import { readFileSync } from "node:fs";
    import { Schema } from "effect";
    import { ARTIFACT_REF_FIELD_NUMBERS, LIMITS, METADATA_LEAKAGE, artifactRefFixture, decodeArtifactRef } from "./dist/index.js";
    import { CANONICAL_LIMITS, CANONICAL_SCHEMAS, CANONICAL_V2_SCHEMAS, canonicalBytes, decodeCanonical, chunkDigest } from "./dist/canonical.js";
    import { CONTROL_FIELD_NUMBERS, CONTROL_SCHEMAS } from "./dist/control.js";
    import { ENGINE_FIELD_NUMBERS, ENGINE_METHODS, ENGINE_SCHEMAS } from "./dist/engine.js";
    import { assertControlBytes, assertTemporalCallBytes } from "./dist/transport.js";

    const over = {...artifactRefFixture, byte_length: "1073741825"};
    const rejectInvalid = () => {
      assert.throws(() => decodeArtifactRef(over), /1 GiB/);
      assert.throws(() => assertControlBytes(new Uint8Array(65537)), /64 KiB/);
      assert.throws(() => assertTemporalCallBytes([new Uint8Array(32769)]), /32 KiB/);
      assert.throws(() => canonicalBytes("plan", {schema_version: "1"}));
      assert.throws(() => canonicalBytes("plan", {schema_version: "2"}, "2"));
      assert.throws(() => decodeCanonical("plan", new Uint8Array(1048577)), /document size/);
      assert.throws(() => chunkDigest("0", new Uint8Array(4194305)), /chunk size/);
      assert.throws(() => decodeCanonical("plan", new TextEncoder().encode("[".repeat(17) + "]".repeat(17))), /document depth/);
    };
    rejectInvalid();
    const replacement = Schema.Struct({schema_version: Schema.Literal("1")});
    for (const [limits, key, value] of [
      [LIMITS, "artifact_max_bytes", "1073741825"],
      [LIMITS, "control_bytes", "999999"],
      [LIMITS, "temporal_payload_bytes", "999999"],
      [CANONICAL_LIMITS, "document_bytes", Infinity],
      [CANONICAL_LIMITS, "depth", Infinity],
      [CANONICAL_LIMITS, "chunk_bytes", Infinity],
    ]) assert.throws(() => { limits[key] = value; }, TypeError);
    for (const registry of [CANONICAL_SCHEMAS, CANONICAL_V2_SCHEMAS, CONTROL_SCHEMAS, ENGINE_SCHEMAS]) {
      assert.ok(Object.isFrozen(registry));
      for (const key of Object.keys(registry)) {
        assert.throws(() => { registry[key] = replacement; }, TypeError);
        assert.throws(() => { delete registry[key]; }, TypeError);
      }
      assert.throws(() => Object.defineProperty(registry, "injected", {value: replacement}), TypeError);
    }
    for (const table of [ARTIFACT_REF_FIELD_NUMBERS, ...Object.values(CONTROL_FIELD_NUMBERS), ...Object.values(ENGINE_FIELD_NUMBERS)]) {
      assert.ok(Object.isFrozen(table));
      for (const key of Object.keys(table)) assert.throws(() => { table[key] = 999; }, TypeError);
    }
    for (const map of [CONTROL_FIELD_NUMBERS, ENGINE_FIELD_NUMBERS]) {
      assert.ok(Object.isFrozen(map));
      for (const key of Object.keys(map)) assert.throws(() => { map[key] = {}; }, TypeError);
    }
    for (const vocabulary of [METADATA_LEAKAGE, ENGINE_METHODS]) {
      assert.ok(Object.isFrozen(vocabulary));
      assert.throws(() => vocabulary.reverse(), TypeError);
      assert.throws(() => vocabulary.push(vocabulary[0]), TypeError);
    }
    assert.ok(Object.isFrozen(LIMITS));
    assert.ok(Object.isFrozen(CANONICAL_LIMITS));
    rejectInvalid();
    assert.deepEqual(decodeArtifactRef(artifactRefFixture), artifactRefFixture);
    for (const [path, version] of [["corpus", "1"], ["modular-v2", "2"]]) {
      const corpus = JSON.parse(readFileSync("fixtures/canonical/" + path + ".json"));
      for (const vector of corpus.objects) assert.equal(Buffer.from(canonicalBytes(vector.kind, vector.value, version)).toString("hex"), vector.canonical_hex);
    }
    // Schema derivation remains supported; only our plain registry container is frozen.
    const derived = CANONICAL_SCHEMAS.plan.fields.display_name.check(Schema.isPattern(/^local$/u));
    const plan = JSON.parse(readFileSync("fixtures/canonical/corpus.json")).objects.find(v => v.kind === "plan").value;
    assert.throws(() => Schema.decodeUnknownSync(derived)(plan.display_name));
    assert.equal(Schema.decodeUnknownSync(derived)("local"), "local");
    assert.doesNotThrow(() => canonicalBytes("plan", plan));
    // Consumers can modify their own metadata/fixture copies without changing policy.
    const copy = {...LIMITS, control_bytes: "999999"};
    assert.equal(copy.control_bytes, "999999");
    const fixture = structuredClone(artifactRefFixture);
    fixture.tenant_scope = "local-only";
    assert.notEqual(fixture.tenant_scope, artifactRefFixture.tenant_scope);
  `,
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
