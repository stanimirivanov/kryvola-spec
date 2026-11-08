import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

/** Narrow control projection: constrained strings or explicitly registered messages only. */
export function renderControl(
  schemas,
  tags,
  { externalSchemas = {}, imports = [], methods = [] } = {},
) {
  const registry = { ...externalSchemas, ...schemas };
  const messages = Object.entries(schemas).map(([name, schema]) => {
    const properties = toJsonSchema(schema).properties;
    const numbers = tags[name];
    const fields = Object.keys(schema.fields);
    if (
      !numbers ||
      fields.length !== Object.keys(numbers).length ||
      new Set(Object.values(numbers)).size !== fields.length ||
      fields.some(
        (field) =>
          !Number.isInteger(numbers[field]) ||
          numbers[field] < 1 ||
          numbers[field] > 536870911 ||
          (numbers[field] >= 19000 && numbers[field] <= 19999),
      )
    ) {
      throw new Error(`${name}: invalid explicit control tags`);
    }
    const lines = fields.map((field) => {
      const repeated = properties[field].type === "array";
      if (
        repeated &&
        (!Number.isInteger(properties[field].minItems) ||
          !Number.isInteger(properties[field].maxItems))
      ) {
        throw new Error(`${name}.${field}: arrays must be explicitly bounded`);
      }
      const value = repeated ? schema.fields[field].value : schema.fields[field];
      const nested = Object.entries(registry).find(([, registered]) => registered === value);
      if (nested)
        return `  ${repeated ? "repeated " : ""}${nested[0]} ${field} = ${numbers[field]};`;
      const errors = checkProjection({
        [field]: repeated ? properties[field].items : properties[field],
      });
      if (errors.length) throw new Error(errors.join("\n"));
      return `  ${repeated ? "repeated" : "optional"} string ${field} = ${numbers[field]};`;
    });
    return `message ${name} {\n${lines.join("\n")}\n}`;
  });
  const dependencies = imports.length
    ? `${imports.map((path) => `import "${path}";`).join("\n")}\n\n`
    : "";
  const service = methods.length
    ? `\n\nservice EngineService {\n${methods
        .map((method) => {
          if (!schemas[`${method}Request`] || !schemas[`${method}Response`])
            throw new Error("Missing RPC schema");
          return `  rpc ${method}(${method}Request) returns (${method}Response);`;
        })
        .join("\n")}\n}`
    : "";
  return `// Generated structural preview; validate presence, constraints and context in application decoders.\nsyntax = "proto3";\n\npackage kryvola.spec.v1;\n\n${dependencies}${messages.join("\n\n")}${service}\n`;
}

/** Generate the typed Effect facade from OpenAPI-owned HTTP components, not vice versa. */
export function renderRuntime(schemas) {
  const declarations = [],
    complete = new Set(),
    active = new Set();
  const fail = () => {
    throw new Error("Unsupported runtime OpenAPI schema");
  };
  function expression(s) {
    const allowed = s.$ref
      ? ["$ref"]
      : s.anyOf
        ? ["anyOf"]
        : {
            object: ["type", "properties", "required", "additionalProperties"],
            integer: ["type", "minimum", "maximum"],
            array: ["type", "items", "minItems", "maxItems"],
            string: ["type", "enum", "pattern"],
            null: ["type"],
          }[s.type];
    if (!allowed || Object.keys(s).some((k) => !allowed.includes(k))) return fail();
    if (s.$ref) {
      const local = s.$ref.match(/^#\/components\/schemas\/([A-Za-z][A-Za-z0-9]*)$/);
      if (local) {
        visit(local[1]);
        return local[1];
      }
      const external = s.$ref.match(
        /^\.\.\/generated\/control\/(Operation|Attempt|PublicResultStatus)\.schema\.json(?:#\/properties\/([a-z_]+))?$/,
      );
      if (!external || (external[1] === "PublicResultStatus" && external[2])) return fail();
      return external[1] + (external[2] ? `.fields.${external[2]}` : "");
    }
    if (s.anyOf) {
      if (!Array.isArray(s.anyOf) || s.anyOf.length < 2) return fail();
      return `Schema.Union([${s.anyOf.map(expression).join(", ")}])`;
    }
    if (s.type === "null") return "Schema.Null";
    if (s.type === "string") {
      if (typeof s.pattern === "string" && !Object.hasOwn(s, "enum")) {
        return `Schema.String.check(Schema.isPattern(new RegExp(${JSON.stringify(s.pattern)}, "u")))`;
      }
      if (!Array.isArray(s.enum) || !s.enum.length || s.enum.some((v) => typeof v !== "string"))
        return fail();
      return s.enum.length === 1
        ? `Schema.Literal(${JSON.stringify(s.enum[0])})`
        : `Schema.Literals(${JSON.stringify(s.enum)})`;
    }
    if (s.type === "object") {
      const keys = Object.keys(s.properties ?? {});
      if (
        s.additionalProperties !== false ||
        !Array.isArray(s.required) ||
        s.required.length !== keys.length ||
        keys.some((k) => !s.required.includes(k) || k === "__proto__")
      )
        return fail();
      return `Schema.Struct({${keys.map((k) => `${JSON.stringify(k)}: ${expression(s.properties[k])}`).join(", ")}})`;
    }
    const [minimum, maximum] =
      s.type === "integer" ? [s.minimum, s.maximum] : [s.minItems, s.maxItems];
    if (![minimum, maximum].every(Number.isSafeInteger) || minimum < 0 || maximum < minimum)
      return fail();
    if (s.type === "integer")
      return `Schema.Int.check(Schema.isBetween({ minimum: ${minimum}, maximum: ${maximum} }))`;
    return `Schema.Array(${expression(s.items)}).check(Schema.isMinLength(${minimum}), Schema.isMaxLength(${maximum}))`;
  }
  function visit(name) {
    if (active.has(name) || !Object.hasOwn(schemas, name) || !/^[A-Z][A-Za-z0-9]*$/.test(name))
      return fail();
    if (complete.has(name)) return;
    active.add(name);
    const value = expression(schemas[name]);
    declarations.push(`const ${name} = ${value};`);
    active.delete(name);
    complete.add(name);
  }
  for (const name of Object.keys(schemas)) visit(name);
  return `// Generated from openapi/runtime.schemas.json; run pnpm generate. Do not edit.\nimport { Schema } from "effect";\nimport { Attempt, Operation, PublicResultStatus } from "./control.js";\nimport { assertControlBytes } from "./transport.js";\n${declarations.join("\n")}\nexport const RUNTIME_SCHEMAS = Object.freeze({${Object.keys(schemas).join(", ")}});\nconst utf8 = new TextDecoder("utf-8", { fatal: true });

/** Decode a complete UTF-8 runtime JSON body. Authorization is a service responsibility. */
export function decodeRuntime<K extends keyof typeof RUNTIME_SCHEMAS>(
  name: K,
  bytes: Uint8Array,
): (typeof RUNTIME_SCHEMAS)[K]["Type"] {
  assertControlBytes(bytes);
  const input: unknown = JSON.parse(utf8.decode(bytes));
  return Schema.decodeUnknownSync(RUNTIME_SCHEMAS[name])(input, { onExcessProperty: "error" });
}
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = new URL("../openapi/runtime.schemas.json", import.meta.url);
  const target = new URL("../src/runtime.ts", import.meta.url);
  // OpenAPI accepts JSON components; no additional parser dependency is required.
  const output = renderRuntime(JSON.parse(readFileSync(source, "utf8")).components.schemas);
  if (process.argv.includes("--write-runtime")) writeFileSync(target, output);
  else if (!process.argv.includes("--check-runtime") || readFileSync(target, "utf8") !== output)
    throw new Error("Runtime facade drift; run pnpm generate");
}
