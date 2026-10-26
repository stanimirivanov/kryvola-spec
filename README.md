# Kryvola specification foundation

The contract and architecture repository for Kryvola. This is an M0 **preview foundation**, not a production specification or inference service. Existing Apache-2.0 licensing is preserved.

## Start here

- [Documentation index](docs/README.md): authoritative design, implementation sequence, amendments and progress.
- [Schema authoring ADR](docs/adr/0001-schema-authoring.md): Redocly for OpenAPI; Effect 4 + TypeScript 7 for other schemas; Protobuf remains the wire projection.
- [Harness and enforcement](docs/harness.md): commands, controls and limits.

## Setup and checks

Use Node 24.18.0 and pnpm 12.5.1 (the `packageManager` version). Then:

```sh
pnpm install --frozen-lockfile
pnpm check:fast
pnpm check
pnpm inspect
```

`pnpm check` type-checks and builds, checks deterministic generated outputs, runs positive/negative fixtures, lints/formats Protobuf with Buf, and lints/bundles/renders the draft OpenAPI with Redocly. `pnpm format` applies formatting. `pnpm generate` updates generated preview artifacts; commit them with their source. No service credentials are required. Buf's exact pinned postinstall is explicitly allowed; other unreviewed dependency scripts fail installation.

`src/index.ts` is the non-OpenAPI schema source. `generated/` contains JSON Schema, data fixtures, stable-tag Protobuf, and structural Rust/Python/C++ projections. The language projections are **not** native crypto decoders or Protobuf runtime bindings. `byte_length` is a decimal string; its 1 GiB foundation policy is enforced by `decodeArtifactRef`, separate from the structural schema.

`openapi/status.yaml` documents a candidate metadata status endpoint from the design. No server is implemented or deployed. Preview artifacts are not signed authorization, a frozen Engine API, or proof of computation.

Native wire bindings live separately in `bindings/`. With Docker Linux containers available, run `pnpm native:generate` after `pnpm generate`, then `pnpm native:check` for generation drift, compiled Rust/C++ and shared wire/RPC conformance. Cold bootstrap builds the pinned compiler/plugins; native checks run in a separate CI job. `pnpm check` verifies committed native provenance and golden logical values without Docker. See [native scope, pins and remaining integration gates](docs/native-wire.md).
