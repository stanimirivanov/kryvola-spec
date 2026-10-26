import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function run(args, timeout) {
  const result = spawnSync("docker", args, { cwd: root, stdio: "inherit", timeout });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Canonical conformance: docker ${args[0]} failed`);
}
mkdirSync(resolve(root, ".cache"), { recursive: true });
run(
  [
    "build",
    "--file",
    "tools/conformance/rust/Dockerfile",
    "--iidfile",
    ".cache/canonical-rust-image-id",
    ".",
  ],
  1200000,
);
const id = readFileSync(resolve(root, ".cache/canonical-rust-image-id"), "utf8").trim();
run(
  [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "1g",
    "--cpus",
    "2",
    "--pids-limit",
    "128",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    id,
  ],
  180000,
);
console.log("Rust canonical conformance passed; Python/C++ adapters remain pending M0-PR9/10.");
