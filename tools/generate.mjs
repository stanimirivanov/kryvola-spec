import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  CANONICAL_SCHEMAS,
  CANONICAL_V2_SCHEMAS,
  SignatureEnvelope,
  SignatureEnvelopeV2,
} from "../dist/canonical.js";
import {
  ENGINE_FIELD_NUMBERS,
  ENGINE_METHODS,
  ENGINE_SCHEMAS,
  engineFixtures,
} from "../dist/engine.js";
import {
  ARTIFACT_REF_FIELD_NUMBERS,
  ArtifactRef,
  AssuranceProfile,
  AssuranceRequest,
  artifactRefFixture,
  baselineAssuranceFixture,
  baselineConsentFixture,
  baselineRequestFixture,
  CONTRACT_VERSION,
  CONTROL_FIELD_NUMBERS,
  CONTROL_SCHEMAS,
  ConsentDeclaration,
  controlFixtures,
  FoundationInventory,
  LIMITS,
  PhysicalExecutionState,
  PublicResultStatus,
} from "../dist/index.js";
import {
  describeArtifactRef,
  renderArtifactRef,
  renderControl,
  renderLimits,
  toJsonSchema,
} from "./projection.mjs";
import { buildManifest } from "./provenance.mjs";

const root = resolve(import.meta.dirname, "..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const descriptor = describeArtifactRef(ArtifactRef, ARTIFACT_REF_FIELD_NUMBERS);
const generated = new Map();
for (const [name, schema] of Object.entries({
  ...CANONICAL_SCHEMAS,
  signature: SignatureEnvelope,
})) {
  generated.set(`canonical/${name}.schema.json`, json(toJsonSchema(schema)));
}
generated.set("artifact-ref.schema.json", json(descriptor.schema));
for (const [name, schema] of Object.entries({
  ...CANONICAL_V2_SCHEMAS,
  signature: SignatureEnvelopeV2,
})) {
  generated.set(`canonical/v2/${name}.schema.json`, json(toJsonSchema(schema)));
}
for (const name of ["corpus", "negative", "modular-v2"]) {
  generated.set(
    `fixtures/canonical-${name}.json`,
    readFileSync(join(root, `fixtures/canonical/${name}.json`), "utf8"),
  );
}
generated.set("foundation-inventory.schema.json", json(toJsonSchema(FoundationInventory)));
generated.set("assurance-profile.schema.json", json(toJsonSchema(AssuranceProfile)));
generated.set("assurance-request.schema.json", json(toJsonSchema(AssuranceRequest)));
generated.set("consent-declaration.schema.json", json(toJsonSchema(ConsentDeclaration)));
generated.set("fixtures/fhe-q1-assurance.json", json(baselineAssuranceFixture));
generated.set("fixtures/fhe-q1-consent.json", json(baselineConsentFixture));
generated.set("fixtures/fhe-q1-request.json", json(baselineRequestFixture));
generated.set("fixtures/artifact-ref.json", json(artifactRefFixture));
generated.set("limits.json", json(LIMITS));
for (const [path, bytes] of [...renderArtifactRef(descriptor), ...renderLimits(LIMITS)]) {
  generated.set(path, bytes);
}
for (const [name, schema] of Object.entries({
  ...CONTROL_SCHEMAS,
  PublicResultStatus,
  PhysicalExecutionState,
})) {
  generated.set(`control/${name}.schema.json`, json(toJsonSchema(schema)));
}
generated.set("fixtures/control.json", json(controlFixtures));
generated.set(
  "proto/kryvola/spec/v1/control.proto",
  renderControl(CONTROL_SCHEMAS, CONTROL_FIELD_NUMBERS),
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const [name, schema] of Object.entries(ENGINE_SCHEMAS)) {
  generated.set(`engine/${name}.schema.json`, json(toJsonSchema(schema)));
}
generated.set("fixtures/engine.json", json(engineFixtures));
generated.set(
  "proto/kryvola/spec/v1/engine.proto",
  renderControl(ENGINE_SCHEMAS, ENGINE_FIELD_NUMBERS, {
    externalSchemas: { ...CONTROL_SCHEMAS, ArtifactRef },
    imports: ["kryvola/spec/v1/artifact_ref.proto", "kryvola/spec/v1/control.proto"],
    methods: ENGINE_METHODS,
  }),
);
const sources = new Map(
  [
    "src/index.ts",
    "src/assurance.ts",
    "src/control.ts",
    "src/engine.ts",
    "src/transport.ts",
    "src/canonical.ts",
    "src/fhe-q1.ts",
    "src/validation.ts",
    "fixtures/canonical/corpus.json",
    "fixtures/canonical/negative.json",
    "fixtures/canonical/modular-v2.json",
    "package.json",
    "pnpm-lock.yaml",
    "tools/generate.mjs",
    "tools/check-architecture.mjs",
    "tools/projection.mjs",
    "tools/provenance.mjs",
  ].map((path) => [path, readFileSync(join(root, path))]),
);
generated.set(
  "manifest.json",
  json(
    buildManifest({
      contractVersion: CONTRACT_VERSION,
      packageJson,
      sources,
      files: generated,
    }),
  ),
);
const target = join(root, "generated");
if (process.argv.includes("--check")) {
  const actual = readdirSync(target, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(target, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  if (actual.length !== generated.size || actual.some((path) => !generated.has(path))) {
    throw new Error("generated/: missing or unexpected generated artifact; run pnpm generate");
  }
  for (const [path, bytes] of generated) {
    if (readFileSync(join(target, path), "utf8") !== bytes) {
      throw new Error(`generated/${path}: stale generated artifact; run pnpm generate`);
    }
  }
  console.log(`Verified ${generated.size} deterministic generated artifacts.`);
} else {
  for (const [path, bytes] of generated) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), bytes);
  }
  console.log(`Generated ${generated.size} preview artifacts.`);
}
