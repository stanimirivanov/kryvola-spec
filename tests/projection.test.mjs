import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Schema } from "effect";
import { ARTIFACT_REF_FIELD_NUMBERS, ArtifactRef, LIMITS } from "../dist/index.js";
import {
  describeArtifactRef,
  renderArtifactRef,
  renderLimits,
  toJsonSchema,
} from "../tools/projection.mjs";
import { buildManifest, sha256 } from "../tools/provenance.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const json = (path) => JSON.parse(read(path));
const baseline = json("tests/fixtures/projection-baseline.json");

test("all contract bytes and artifact order match the pre-refactor revision", () => {
  assert.match(baseline.source_revision, /^[0-9a-f]{40}$/);
  const manifest = json("generated/manifest.json");
  assert.equal(manifest.contract_version, baseline.contract_version);
  assert.deepEqual(manifest.toolchain, baseline.toolchain);
  assert.deepEqual(Object.keys(manifest.files), Object.keys(baseline.files));
  assert.deepEqual(manifest.files, baseline.files);
  for (const [path, digest] of Object.entries(baseline.files)) {
    assert.equal(sha256(read(`generated/${path}`)), digest, path);
  }
});

test("pure renderers reproduce native byte vectors and strict JSON Schema", () => {
  const descriptor = describeArtifactRef(ArtifactRef, ARTIFACT_REF_FIELD_NUMBERS);
  assert.deepEqual(descriptor.schema, json("generated/artifact-ref.schema.json"));
  for (const [path, bytes] of [...renderArtifactRef(descriptor), ...renderLimits(LIMITS)]) {
    assert.equal(bytes, read(`generated/${path}`).toString("utf8"), path);
  }
  assert.equal(
    toJsonSchema(Schema.Struct({ id: Schema.Literal("id") })).additionalProperties,
    false,
  );
});

const reversedFields = Schema.Struct({ second: Schema.Literal("b"), first: Schema.Literal("a") });
test("field and tag-map declaration order cannot allocate wire tags", () => {
  const first = describeArtifactRef(reversedFields, { first: 19, second: 7 });
  const second = describeArtifactRef(reversedFields, { second: 7, first: 19 });
  assert.deepEqual(renderArtifactRef(first), renderArtifactRef(second));
  const proto = renderArtifactRef(first).get("proto/kryvola/spec/v1/artifact_ref.proto");
  assert.match(proto, /string second = 7;/);
  assert.match(proto, /string first = 19;/);
});

test("missing zero duplicate and mismatched explicit tags still fail closed", () => {
  for (const tags of [
    { first: 1 },
    { first: 1, second: 0 },
    { first: 1, second: 1 },
    { first: 1, wrong: 2 },
    { first: 1, second: 2, extra: 3 },
  ])
    assert.throws(() => describeArtifactRef(reversedFields, tags), /distinct explicit stable/);
});

test("unsupported fields and lost Unicode-pattern projections still fail closed", () => {
  for (const [field, reason] of [
    [Schema.String, /constraint was lost/],
    [Schema.Number, /unsupported/],
    [Schema.String.check(Schema.isPattern(/^[a-z]+$/)), /constraint was lost/],
  ])
    assert.throws(() => describeArtifactRef(Schema.Struct({ id: field }), { id: 1 }), reason);
  const field = Schema.String.check(Schema.isPattern(/^[a-z]+(?![\s\S])/u));
  assert.equal(
    describeArtifactRef(Schema.Struct({ id: field }), { id: 1 }).schema.properties.id.pattern,
    "^[a-z]+(?![\\s\\S])",
  );
});

test("provenance hashes supplied bytes deterministically without mutating inputs", () => {
  const inputs = {
    contractVersion: baseline.contract_version,
    packageJson: json("package.json"),
    sources: new Map([["not-a-real-source-file", Buffer.from("abc")]]),
    files: new Map([["fixture.json", "{}\n"]]),
  };
  const manifest = buildManifest(inputs);
  assert.equal(
    manifest.sources["not-a-real-source-file"],
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.deepEqual(buildManifest(inputs), manifest);
  assert.deepEqual([...inputs.files], [["fixture.json", "{}\n"]]);
  assert.deepEqual([...inputs.sources], [["not-a-real-source-file", Buffer.from("abc")]]);
  const changedSource = buildManifest({
    ...inputs,
    sources: new Map([["not-a-real-source-file", "changed"]]),
  });
  assert.notDeepEqual(changedSource.sources, manifest.sources);
  assert.deepEqual(changedSource.files, manifest.files);
  const changedFile = buildManifest({ ...inputs, files: new Map([["fixture.json", "changed"]]) });
  assert.notDeepEqual(changedFile.files, manifest.files);
  assert.deepEqual(changedFile.sources, manifest.sources);
});

test("manifest provenance includes and hashes the extracted generator helpers", () => {
  const { sources } = json("generated/manifest.json");
  for (const path of ["tools/generate.mjs", "tools/projection.mjs", "tools/provenance.mjs"]) {
    assert.equal(sources[path], sha256(read(path)), path);
  }
});
