import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Schema } from "effect";
import {
  ARTIFACT_REF_FIELD_NUMBERS,
  ArtifactRef,
  artifactRefFixture,
  CONTRACT_VERSION,
  FoundationInventory,
  LIMITS,
} from "../dist/index.js";
import { checkProjection } from "./check-architecture.mjs";

const root = resolve(import.meta.dirname, "..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const schema = (value) => {
  const document = Schema.toJsonSchemaDocument(value, { onExcessProperty: "error" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    ...(Object.keys(document.definitions).length ? { $defs: document.definitions } : {}),
  };
};
const artifactSchema = schema(ArtifactRef);
const names = Object.keys(ArtifactRef.fields);
const projectionErrors = checkProjection(artifactSchema.properties);
if (projectionErrors.length) throw new Error(projectionErrors.join("\n"));
if (names.some((name) => artifactSchema.properties[name].type !== "string")) {
  throw new Error(
    "Projection generator supports string-only ArtifactRef fields; extend it explicitly.",
  );
}
if (
  names.length !== Object.keys(ARTIFACT_REF_FIELD_NUMBERS).length ||
  names.some((name) => !ARTIFACT_REF_FIELD_NUMBERS[name]) ||
  new Set(Object.values(ARTIFACT_REF_FIELD_NUMBERS)).size !== names.length
) {
  throw new Error("ArtifactRef fields require distinct explicit stable Protobuf tags.");
}
const generated = new Map();
generated.set("artifact-ref.schema.json", json(artifactSchema));
generated.set("foundation-inventory.schema.json", json(schema(FoundationInventory)));
generated.set("fixtures/artifact-ref.json", json(artifactRefFixture));
generated.set("limits.json", json(LIMITS));
generated.set(
  "python/artifact_ref.py",
  `"""Generated structural projection; not a decoder, signature verifier or authorization check."""\nfrom typing import TypedDict\n\n\nclass ArtifactRef(TypedDict):\n${names.map((name) => `    ${name}: str`).join("\n")}\n`,
);
generated.set(
  "rust/artifact_ref.rs",
  `// Generated structural projection; not a decoder or authorization check.\n#[derive(Debug, Clone, PartialEq, Eq)]\npub struct ArtifactRef {\n${names.map((name) => `    pub ${name}: String,`).join("\n")}\n}\n`,
);
generated.set(
  "cpp/artifact_ref.hpp",
  `// Generated structural projection; not a decoder or authorization check.\n#pragma once\n#include <string>\n\nnamespace kryvola::spec {\nstruct ArtifactRef {\n${names.map((name) => `  std::string ${name};`).join("\n")}\n};\n}  // namespace kryvola::spec\n`,
);
generated.set(
  "proto/kryvola/spec/v1/artifact_ref.proto",
  `// Generated wire projection preview. Do not edit.\nsyntax = "proto3";\n\npackage kryvola.spec.v1;\n\n// ArtifactRef contains metadata only; possession does not grant access.\nmessage ArtifactRef {\n${names.map((name) => `  string ${name} = ${ARTIFACT_REF_FIELD_NUMBERS[name]};`).join("\n")}\n}\n`,
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
generated.set(
  "rust/limits.rs",
  `// Generated from Effect contract limits.\n${Object.entries(LIMITS)
    .map(([name, value]) => `pub const ${name.toUpperCase()}: usize = ${value};`)
    .join("\n")}\n`,
);
generated.set(
  "python/limits.py",
  `"""Generated from Effect contract limits."""\n${Object.entries(LIMITS)
    .map(([name, value]) => `${name.toUpperCase()} = ${value}`)
    .join("\n")}\n`,
);
generated.set(
  "cpp/limits.hpp",
  `// Generated from Effect contract limits.\n#pragma once\n#include <cstddef>\nnamespace kryvola::spec {\n${Object.entries(
    LIMITS,
  )
    .map(([name, value]) => `inline constexpr std::size_t ${name} = ${value};`)
    .join("\n")}\n}  // namespace kryvola::spec\n`,
);
generated.set(
  "manifest.json",
  json({
    contract_version: CONTRACT_VERSION,
    status: "preview",
    hash_purpose: "SHA-256 build provenance; protocol commitments remain BLAKE3",
    toolchain: {
      effect: packageJson.dependencies.effect,
      typescript: packageJson.devDependencies.typescript,
      package_manager: packageJson.packageManager,
    },
    sources: Object.fromEntries(
      ["src/index.ts", "tools/generate.mjs", "tools/check-architecture.mjs"].map((path) => [
        path,
        sha(readFileSync(join(root, path))),
      ]),
    ),
    files: Object.fromEntries([...generated].map(([path, bytes]) => [path, sha(bytes)])),
  }),
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
