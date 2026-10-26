import { Schema } from "effect";
import { checkProjection } from "./check-architecture.mjs";

export function toJsonSchema(value) {
  const document = Schema.toJsonSchemaDocument(value, { onExcessProperty: "error" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    ...(Object.keys(document.definitions).length ? { $defs: document.definitions } : {}),
  };
}

/** Preserve the existing narrow string-only projection and explicit-tag checks. */
export function describeArtifactRef(value, fieldNumbers) {
  const schema = toJsonSchema(value);
  const names = Object.keys(value.fields);
  const errors = checkProjection(schema.properties);
  if (errors.length) throw new Error(errors.join("\n"));
  if (names.some((name) => schema.properties[name].type !== "string")) {
    throw new Error(
      "Projection generator supports string-only ArtifactRef fields; extend it explicitly.",
    );
  }
  if (
    names.length !== Object.keys(fieldNumbers).length ||
    names.some((name) => !fieldNumbers[name]) ||
    new Set(Object.values(fieldNumbers)).size !== names.length
  ) {
    throw new Error("ArtifactRef fields require distinct explicit stable Protobuf tags.");
  }
  return { schema, names, fieldNumbers };
}

/** Render only a descriptor validated by describeArtifactRef; no tag allocation or I/O. */
export function renderArtifactRef({ names, fieldNumbers }) {
  return new Map([
    [
      "python/artifact_ref.py",
      `"""Generated structural projection; not a decoder, signature verifier or authorization check."""\nfrom typing import TypedDict\n\n\nclass ArtifactRef(TypedDict):\n${names.map((name) => `    ${name}: str`).join("\n")}\n`,
    ],
    [
      "rust/artifact_ref.rs",
      `// Generated structural projection; not a decoder or authorization check.\n#[derive(Debug, Clone, PartialEq, Eq)]\npub struct ArtifactRef {\n${names.map((name) => `    pub ${name}: String,`).join("\n")}\n}\n`,
    ],
    [
      "cpp/artifact_ref.hpp",
      `// Generated structural projection; not a decoder or authorization check.\n#pragma once\n#include <string>\n\nnamespace kryvola::spec {\nstruct ArtifactRef {\n${names.map((name) => `  std::string ${name};`).join("\n")}\n};\n}  // namespace kryvola::spec\n`,
    ],
    [
      "proto/kryvola/spec/v1/artifact_ref.proto",
      `// Generated wire projection preview. Do not edit.\nsyntax = "proto3";\n\npackage kryvola.spec.v1;\n\n// ArtifactRef contains metadata only; possession does not grant access.\nmessage ArtifactRef {\n${names.map((name) => `  string ${name} = ${fieldNumbers[name]};`).join("\n")}\n}\n`,
    ],
  ]);
}

export function renderLimits(limits) {
  return new Map([
    [
      "rust/limits.rs",
      `// Generated from Effect contract limits.\n${Object.entries(limits)
        .map(([name, value]) => `pub const ${name.toUpperCase()}: usize = ${value};`)
        .join("\n")}\n`,
    ],
    [
      "python/limits.py",
      `"""Generated from Effect contract limits."""\n${Object.entries(limits)
        .map(([name, value]) => `${name.toUpperCase()} = ${value}`)
        .join("\n")}\n`,
    ],
    [
      "cpp/limits.hpp",
      `// Generated from Effect contract limits.\n#pragma once\n#include <cstddef>\nnamespace kryvola::spec {\n${Object.entries(
        limits,
      )
        .map(([name, value]) => `inline constexpr std::size_t ${name} = ${value};`)
        .join("\n")}\n}  // namespace kryvola::spec\n`,
    ],
  ]);
}
