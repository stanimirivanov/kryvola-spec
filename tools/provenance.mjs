import { createHash } from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Hash supplied bytes only; filesystem access and serialization stay in the CLI. */
export function buildManifest({ contractVersion, packageJson, sources, files }) {
  return {
    contract_version: contractVersion,
    status: "preview",
    hash_purpose: "SHA-256 build provenance; protocol commitments remain BLAKE3",
    toolchain: {
      effect: packageJson.dependencies.effect,
      typescript: packageJson.devDependencies.typescript,
      package_manager: packageJson.packageManager,
    },
    sources: Object.fromEntries([...sources].map(([path, bytes]) => [path, sha256(bytes)])),
    files: Object.fromEntries([...files].map(([path, bytes]) => [path, sha256(bytes)])),
  };
}
