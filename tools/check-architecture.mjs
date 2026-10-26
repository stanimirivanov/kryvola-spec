import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function checkProjection(properties) {
  const errors = [];
  for (const [name, value] of Object.entries(properties)) {
    if (value.type !== "string") errors.push(`${name}: unsupported structural projection type`);
    if (!value.enum && !value.const && typeof value.pattern !== "string") {
      errors.push(`${name}: string constraint was lost during schema export`);
    }
  }
  return errors;
}

export function checkManifest(manifest) {
  const errors = [];
  for (const group of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, version] of Object.entries(manifest[group] ?? {})) {
      if (/^(@kryvola\/|kryvola-)/.test(name) || /^(file:|link:|workspace:)/.test(version)) {
        errors.push(
          `package.json ${group}.${name}: spec cannot depend on runtime repositories or local source`,
        );
      }
    }
  }
  if (!/^4\.\d+\.\d+$/.test(manifest.dependencies?.effect ?? ""))
    errors.push("effect must be exactly pinned to v4");
  if (!/^7\.\d+\.\d+$/.test(manifest.devDependencies?.typescript ?? ""))
    errors.push("typescript must be exactly pinned to v7");
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const errors = checkManifest(manifest);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Spec dependency direction and requested schema majors verified.");
}
