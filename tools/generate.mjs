import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
  ConsentDeclaration,
  FoundationInventory,
  LIMITS,
} from "../dist/index.js";
import {
  describeArtifactRef,
  renderArtifactRef,
  renderLimits,
  toJsonSchema,
} from "./projection.mjs";
import { buildManifest } from "./provenance.mjs";

const root = resolve(import.meta.dirname, "..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const descriptor = describeArtifactRef(ArtifactRef, ARTIFACT_REF_FIELD_NUMBERS);
const generated = new Map();
generated.set("artifact-ref.schema.json", json(descriptor.schema));
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
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const sources = new Map(
  [
    "src/index.ts",
    "src/assurance.ts",
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
