# ADR 0001: Effect schema authoring and Redocly OpenAPI

Status: accepted by explicit user instruction, 25 October 2026.

## Context and decision

The user requires Redocly for OpenAPI schemas and Effect v4 with TypeScript 7 for other schemas. This amends design v2 sections 4.3/6 and plan KRY-003/004; it does not replace their cross-language wire protocols.

Non-OpenAPI contracts are authored once in Effect 4.0.6 / TypeScript 7.0.2. JSON Schema and structural language/proto previews are generated. Protobuf/gRPC remains the intended Rust/Python/C++ control wire format. OpenAPI is authored separately and checked/bundled/rendered with Redocly 2.71.0. Stable explicit Protobuf field numbers are maintained alongside the Effect schema; insertion order must never allocate wire tags. The initial generator fails on unsupported field kinds rather than inventing a representation.

No service implementation gains a TypeScript runtime dependency. Python may validate an exported JSON Schema; that file is a generated projection, not a separately authored schema. Native crypto serialization remains engine-owned. Build-provenance SHA-256 hashes identify generated files; protocol commitments continue to require BLAKE3 and canonical signed payloads under design v2.

## Consequences and limits

The preview has no production Engine API, canonical signing implementation, RPC bindings or compatibility freeze. Those remain KRY-003/004 acceptance work. Changing schemas requires reviewing projection semantics and consumer validation, not merely passing the compiler. Generated structural types do not authorize reads, prove key ownership, or validate native ciphertexts.

## Verified references

- [Effect v4 schema and strict decoding](https://effect.website/docs/v4/schema/getting-started)
- [Effect JSON Schema export](https://effect.website/docs/v4/schema/json-schema)
- [TypeScript project-local installation](https://www.typescriptlang.org/download/)
- [Redocly CLI](https://redocly.com/docs/cli/installation)
- [pnpm build approvals](https://pnpm.io/settings/build)

Versions were checked against the package registries during this change and pinned in the lockfile. Updates are reviewed changes.
