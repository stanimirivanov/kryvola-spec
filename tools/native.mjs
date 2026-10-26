import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ENGINE_SCHEMAS, engineFixtures } from "../dist/engine.js";
import {
  ArtifactRef,
  artifactRefFixture,
  CONTRACT_VERSION,
  CONTROL_SCHEMAS,
  controlFixtures,
  LIMITS,
} from "../dist/index.js";
import { toJsonSchema } from "./projection.mjs";
import { sha256 } from "./provenance.mjs";

const root = resolve(import.meta.dirname, "..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const bytes = (path) => readFileSync(join(root, path));
const walk = (path) =>
  readdirSync(join(root, path), { withFileTypes: true })
    .flatMap((entry) =>
      (path === "native" || path.startsWith("native/")) &&
      ["target", ".venv", "__pycache__", ".ruff_cache"].includes(entry.name)
        ? []
        : entry.isDirectory()
          ? walk(`${path}/${entry.name}`)
          : [`${path}/${entry.name}`],
    )
    .sort();
function run(args) {
  const result = spawnSync("docker", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `docker ${args[0]} failed`);
}
function manifest(folder) {
  const sources = [
    ...walk("native"),
    ...walk("generated"),
    ...walk("src"),
    "tools/native.mjs",
    "tools/projection.mjs",
    "tools/provenance.mjs",
    "package.json",
    "pnpm-lock.yaml",
    ".node-version",
    ".dockerignore",
    ".gitattributes",
  ].sort();
  const files = walk(folder).filter((path) => !path.endsWith("/manifest.json"));
  return {
    contract_version: CONTRACT_VERSION,
    purpose: "Native codec build provenance, not canonical commitments or authorization",
    sources: Object.fromEntries(sources.map((path) => [path, sha256(bytes(path))])),
    files: Object.fromEntries(
      files.map((path) => [path.slice(folder.length + 1), sha256(bytes(path))]),
    ),
  };
}
function prepare() {
  const directory = join(root, ".cache/native-input");
  mkdirSync(join(directory, "rust"), { recursive: true });
  const schemas = Object.fromEntries(
    Object.entries({ ArtifactRef, ...CONTROL_SCHEMAS, ...ENGINE_SCHEMAS }).map(([name, schema]) => [
      name,
      toJsonSchema(schema),
    ]),
  );
  // Materialize the existing decodeArtifactRef 1 GiB policy as a portable lexical bound.
  const maximum = LIMITS.artifact_max_bytes;
  const prefixes = [...maximum].flatMap((digit, i) =>
    Number(digit) > (i ? 0 : 1)
      ? [
          `${maximum.slice(0, i)}[${i ? 0 : 1}-${Number(digit) - 1}][0-9]{${maximum.length - i - 1}}`,
        ]
      : [],
  );
  const pattern = `^(0|[1-9][0-9]{0,${maximum.length - 2}}|${prefixes.join("|")}|${maximum})(?![\\s\\S])`;
  function policy(value) {
    if (!value || typeof value !== "object") return;
    if (value.properties?.opaque_artifact_id) value.properties.byte_length.pattern = pattern;
    for (const child of Object.values(value)) policy(child);
  }
  policy(schemas);
  const target = {
    schema_version: "1",
    attempt: controlFixtures.Attempt,
    execution_id: controlFixtures.Execution.execution_id,
  };
  const fixtures = {
    ArtifactRef: artifactRefFixture,
    ...controlFixtures,
    Capabilities: engineFixtures.capabilities,
    GetCapabilitiesRequest: { schema_version: "1" },
    GetCapabilitiesResponse: { schema_version: "1", capabilities: engineFixtures.capabilities },
    ExecuteRequest: engineFixtures.execute,
    ExecuteResponse: { schema_version: "1", execution: controlFixtures.Execution },
    GetExecutionStatusRequest: target,
    GetExecutionStatusResponse: engineFixtures.observation,
    CancelExecutionRequest: { ...target, cancellation_id: "cancel-1" },
    CancelExecutionResponse: {
      ...target,
      cancellation_id: "cancel-1",
      cancellation_state: "REQUESTED",
    },
    ExecutionObservedEvent: engineFixtures.event,
  };
  writeFileSync(join(directory, "schemas.json"), json(schemas));
  writeFileSync(join(directory, "fixtures.json"), json(fixtures));
  writeFileSync(
    join(directory, "rust/dispatch.rs"),
    `// Generated typed codec dispatch; not authorization.\npub fn typed_roundtrip(name: &str, bytes: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {\nuse prost::Message;\nOk(match name {\n${Object.keys(
      schemas,
    )
      .map((name) => `"${name}" => ${name}::decode(bytes)?.encode_to_vec(),`)
      .join("\n")}\n_ => return Err("unknown message".into()),\n})\n}\n`,
  );
}
const mode = process.argv[2];
if (mode === "manifest-check") {
  assert.deepEqual(
    JSON.parse(bytes("bindings/manifest.json")),
    manifest("bindings"),
    "Native artifacts or inputs drifted; run pnpm native:generate",
  );
} else {
  assert.ok(["generate", "check"].includes(mode), "Expected generate, check or manifest-check");
  prepare();
  run([
    "build",
    "--file",
    "native/Dockerfile",
    "--target",
    "exported",
    "--output",
    "type=local,dest=.cache/native-generated",
    ".",
  ]);
  const fresh = ".cache/native-generated/bindings";
  if (mode === "generate") {
    mkdirSync(join(root, "bindings"), { recursive: true });
    cpSync(join(root, fresh), join(root, "bindings"), { recursive: true });
    writeFileSync(join(root, "bindings/manifest.json"), json(manifest("bindings")));
  } else {
    assert.deepEqual(
      JSON.parse(bytes("bindings/manifest.json")),
      manifest(fresh),
      "Native generation drift; run pnpm native:generate",
    );
    assert.deepEqual(manifest("bindings"), manifest(fresh), "Committed native files drifted");
    run([
      "build",
      "--file",
      "native/Dockerfile",
      "--target",
      "conformance",
      "--iidfile",
      ".cache/native-image-id",
      ".",
    ]);
    run(["run", "--rm", "--network", "none", bytes(".cache/native-image-id").toString().trim()]);
  }
  console.log(`Native ${mode} passed.`);
}
