import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function run(args, timeout, capture = false) {
  const result = spawnSync("docker", args, {
    cwd: root,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout,
  });
  if (capture)
    process.stdout.write(
      (result.stdout ?? "")
        .split(/\r?\n/)
        .filter((line) => !line.includes("KRYVOLA_RESULT "))
        .join("\n"),
    );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Canonical conformance: docker ${args[0]} failed`);
  return result.stdout;
}
mkdirSync(resolve(root, ".cache"), { recursive: true });
const transcripts = [];
for (const language of ["rust", "python", "cpp"]) {
  const iidfile = `.cache/canonical-${language}-image-id`;
  run(
    ["build", "--file", `tools/conformance/${language}/Dockerfile`, "--iidfile", iidfile, "."],
    1200000,
  );
  const id = readFileSync(resolve(root, iidfile), "utf8").trim();
  const output = run(
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
    true,
  );
  const records = output.split(/\r?\n/).flatMap((line) => {
    const prefix = "KRYVOLA_RESULT ";
    const start = line.indexOf(prefix);
    return start < 0 ? [] : [JSON.parse(line.slice(start + prefix.length))];
  });
  assert.equal(records.length, 9, `${language}: missing golden transcript`);
  assert.equal(new Set(records.map(([version, kind]) => `${version}/${kind}`)).size, 9);
  transcripts.push(records.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
for (const transcript of transcripts.slice(1)) {
  assert.deepEqual(transcripts[0], transcript, "Cross-language canonical outputs differ");
}
console.log("Rust/Python/C++ canonical conformance and differential outputs passed.");
