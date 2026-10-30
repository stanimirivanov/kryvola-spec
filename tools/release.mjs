/** Experimental committed bundle publication; never ratification or deployment. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./provenance.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const COSIGN_SHA256 = "4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71";
export const IDENTITY =
  "https://github.com/stanimirivanov/kryvola-spec/.github/workflows/release.yml@refs/heads/main";
export const ASSETS = [
  "contracts.tar",
  "provenance.json",
  "manifest.json",
  "manifest.sigstore.json",
];
const INPUTS = [
  "generated",
  "bindings",
  "LICENSE",
  "package.json",
  "pnpm-lock.yaml",
  ".node-version",
];
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: ROOT, maxBuffer: 64 << 20, ...options });
const git = (...args) => run("git", args);
const write = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const hash = (folder, name, limit = 64 << 20) => {
  const path = join(folder, name);
  assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), "Unsafe asset");
  assert.ok(lstatSync(path).size <= limit, "Asset limit");
  return sha256(readFileSync(path));
};
function tool() {
  const path = join(ROOT, "build/release-tools/cosign");
  assert.equal(hash(join(ROOT, "build/release-tools"), "cosign", 160 << 20), COSIGN_SHA256);
  return path;
}
export async function install() {
  assert.ok(process.platform === "linux" && process.arch === "x64", "Linux x64 required");
  const response = await fetch(
    "https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64",
    { signal: AbortSignal.timeout(60000) },
  );
  assert.ok(response.ok, "Tool download failed");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= 160 << 20, "Tool size limit");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(sha256(bytes), COSIGN_SHA256);
  mkdirSync(join(ROOT, "build/release-tools"), { recursive: true });
  writeFileSync(join(ROOT, "build/release-tools/cosign"), bytes);
  chmodSync(join(ROOT, "build/release-tools/cosign"), 0o700);
  tool();
}
export function bundle(source) {
  assert.match(source, /^[a-f0-9]{40}$/);
  const archive = git("archive", "--format=tar", source, "--", ...INPUTS);
  // Verify all manifest-owned files are committed and bound before packaging.
  for (const directory of ["generated", "bindings"]) {
    const manifest = JSON.parse(git("show", `${source}:${directory}/manifest.json`));
    for (const [path, expected] of Object.entries(manifest.files)) {
      assert.ok(!path.includes("..") && !path.startsWith("/"), "Unsafe manifest path");
      assert.equal(sha256(git("show", `${source}:${directory}/${path}`)), expected);
    }
    for (const [path, expected] of Object.entries(manifest.sources))
      assert.equal(sha256(git("show", `${source}:${path}`)), expected);
  }
  return archive;
}
export function verifyAssets(folder, source) {
  assert.match(source, /^[a-f0-9]{40}$/);
  assert.deepEqual(readdirSync(folder).sort(), [...ASSETS].sort(), "Unexpected/missing assets");
  for (const name of ASSETS) hash(folder, name);
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json")));
  assert.deepEqual(
    Object.keys(manifest).sort(),
    ["format", "source", "distribution", "production_ready", "subjects"].sort(),
  );
  assert.equal(manifest.format, "spec-publication-v1");
  assert.equal(manifest.source, source);
  assert.equal(manifest.distribution, "EXPERIMENTAL_CONTRACTS_ONLY");
  assert.equal(manifest.production_ready, false);
  assert.deepEqual(Object.keys(manifest.subjects).sort(), ["contracts.tar", "provenance.json"]);
  for (const [name, digest] of Object.entries(manifest.subjects))
    assert.equal(hash(folder, name), digest);
  const provenance = JSON.parse(readFileSync(join(folder, "provenance.json")));
  assert.equal(provenance._type, "https://in-toto.io/Statement/v1");
  assert.equal(provenance.predicateType, "https://slsa.dev/provenance/v1");
  assert.deepEqual(provenance.subject, [
    { name: "contracts.tar", digest: { sha256: manifest.subjects["contracts.tar"] } },
  ]);
  assert.equal(provenance.predicate.buildDefinition.externalParameters.source, source);
  assert.equal(provenance.predicate.runDetails.builder.id, IDENTITY);
  return manifest;
}
export function verify(folder, source, key = null) {
  const manifest = verifyAssets(folder, source);
  const args = ["verify-blob", "--bundle", join(folder, "manifest.sigstore.json")];
  if (key) args.push("--key", key, "--offline", "--insecure-ignore-tlog");
  else
    args.push(
      "--certificate-identity",
      IDENTITY,
      "--certificate-oidc-issuer",
      "https://token.actions.githubusercontent.com",
      "--certificate-github-workflow-sha",
      source,
      "--certificate-github-workflow-trigger",
      "workflow_dispatch",
    );
  run(tool(), [...args, join(folder, "manifest.json")], { stdio: "pipe" });
  return manifest;
}
export function qualify(folder = join(ROOT, "build/publication")) {
  assert.equal(
    git("status", "--porcelain").toString().trim(),
    "",
    "Clean committed checkout required",
  );
  const source = git("rev-parse", "HEAD").toString().trim();
  mkdirSync(folder, { recursive: false });
  const first = bundle(source);
  assert.deepEqual(first, bundle(source), "Committed package builds differ");
  writeFileSync(join(folder, "contracts.tar"), first, { flag: "wx" });
  write(join(folder, "provenance.json"), {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ name: "contracts.tar", digest: { sha256: sha256(first) } }],
    predicate: {
      buildDefinition: {
        buildType: "https://github.com/stanimirivanov/kryvola-spec/committed-contract-archive/v1",
        externalParameters: { source },
        internalParameters: {},
        resolvedDependencies: INPUTS.map((name) => ({
          uri: `git+https://github.com/stanimirivanov/kryvola-spec@${source}#${name}`,
        })),
      },
      runDetails: {
        builder: { id: IDENTITY },
        metadata: {
          comparison:
            "Two independent git archive invocations; no regeneration or compiler reproducibility claim",
          node: process.version,
        },
      },
    },
  });
  write(join(folder, "manifest.json"), {
    format: "spec-publication-v1",
    source,
    distribution: "EXPERIMENTAL_CONTRACTS_ONLY",
    production_ready: false,
    subjects: Object.fromEntries(
      ["contracts.tar", "provenance.json"].map((name) => [name, hash(folder, name)]),
    ),
  });
  const temporary = mkdtempSync(join(tmpdir(), "spec-signing-"));
  const env = { ...process.env, COSIGN_PASSWORD: "" };
  try {
    const key = join(temporary, "key");
    const wrong = join(temporary, "wrong");
    for (const prefix of [key, wrong])
      run(tool(), ["generate-key-pair", "--output-key-prefix", prefix], { env });
    run(
      tool(),
      [
        "sign-blob",
        "--yes",
        "--tlog-upload=false",
        "--key",
        `${key}.key`,
        "--bundle",
        join(folder, "manifest.sigstore.json"),
        join(folder, "manifest.json"),
      ],
      { env },
    );
    verify(folder, source, `${key}.pub`);
    assert.throws(() => verify(folder, source, `${wrong}.pub`));
    const original = readFileSync(join(folder, "manifest.json"));
    writeFileSync(join(folder, "manifest.json"), `${original.toString().trim()}\n\n`);
    assert.throws(() => verify(folder, source, `${key}.pub`));
    writeFileSync(join(folder, "manifest.json"), original);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  rmSync(join(folder, "manifest.sigstore.json")); // local test signature is never published
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, folder, source, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0);
  if (command === "install" && !folder) await install();
  else if (command === "qualify" && !folder) console.log(qualify());
  else if (command === "verify" && folder && source) console.log(verify(resolve(folder), source));
  else throw new Error("Usage: release.mjs install | qualify | verify FOLDER EXPECTED_SOURCE");
}
