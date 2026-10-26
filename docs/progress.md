# Foundation progress

## M0-PR5: bounded Engine API and events

26 October 2026, [issue #11](https://github.com/stanimirivanov/kryvola-spec/issues/11): [Engine/event contracts and byte guards](engine.md) add capability/execute/status/cancel previews, bounded reference lists, advisory observation envelopes and admission-versus-result OpenAPI responses in bundle `0.1.0-preview.4`. Local `pnpm check` passed: 33 tests, 40 deterministic artifacts, lint/build/Buf/Redocly checks. Previous contract outputs are unchanged. Native codecs, servers, transport hooks, durable deduplication/fencing, signing and consumer updates remain pending. KRY-003/M0 are not marked complete.

## M0-PR4: reference and operation identities

26 October 2026, [issue #9](https://github.com/stanimirivanov/kryvola-spec/issues/9): added [reference and identity previews](control.md), strict Effect decoding, bounded decimal epochs/deadlines, separate public/physical state vocabularies, explicit-tag presence-bearing Protobuf previews and deterministic schema/fixture exports in bundle `0.1.0-preview.3`. Focused contract/regression tests passed (13 tests, 28 generated artifacts); all 17 legacy contract artifacts retain their original hashes. No runtime authorization, persistence, native codecs, canonical signing or consumer pin updates are implemented. This completes the M0-PR4 declaration scope only; KRY-003 and M0 remain partial.

Scope: repository bootstrap associated with GitHub issue #1, 25 October 2026.

| Item                                                     | Status                                    | Evidence / remaining work                                                                                          |
| -------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Schema authoring/toolchain amendment                     | Implemented                               | ADR 0001, exact package versions and lock                                                                          |
| Contract/reference preview and deterministic projections | Implemented, verified locally             | Effect source, generated artifacts and negative fixtures                                                           |
| Setup, local tasks, CI and root guidance                 | Local checks verified; CI configured      | README, harness map, workflow and AGENTS.md                                                                        |
| KRY-001 architecture map                                 | Partial; governance proposed              | M0-PR1 ownership inventory/ADR 0003; named owner/security approval and release-set tooling remain pending          |
| KRY-002 threat/assurance profiles                        | Preview declarations and reference checks | M0-PR2 strict schemas/policy tests; all published profiles disabled, security/parameter/legal ratification pending |
| KRY-003/004 APIs/canonical formats                       | Preview only                              | No full Engine API, RPC bindings, canonical signing or production freeze                                           |
| KRY-005 durable state protocol                           | Deferred                                  | No Temporal/SQL/Ray implementation or concurrency proof                                                            |
| KRY-006–010 feasibility/platform gates                   | Deferred                                  | No crypto benchmark, heavy engine packaging, model approval or full local stack                                    |

No complete M0 milestone is marked done. Next: review and extend KRY-002/003 with the full bounded Engine/control contracts and versioned assurance profiles before fabric runtime integration.

## Observed verification

On Windows, Node 24.18.0 / pnpm 12.5.1: `pnpm check` passed (strict Biome, TypeScript 7 build, architecture guard, 12 deterministic artifacts, five positive/negative tests, Buf and Redocly lint/bundle/docs). A disposable copy with no node_modules passed `pnpm install --frozen-lockfile`, the full `pnpm check`, and `pnpm inspect`. Missing or invalid controls were exercised by the isolated fixtures.

CI is configured, but no hosted run is claimed. Required-check/branch settings remain maintainer actions. Full M0 crypto/operational/security gates remain deferred. The final diff preserves the original LICENSE and the supplied design; the plan adds only an explicit progress amendment.

## M0-PR1: ownership and release governance

26 October 2026, [issue #3](https://github.com/stanimirivanov/kryvola-spec/issues/3): added the [component ownership inventory](ownership.md), [proposed release-governance ADR](adr/0003-release-governance.md), ADR template and documentation tests. Automated checks cover inventory completeness/uniqueness and local links; they do not approve the documented boundaries. The five repository leads and security reviewer are not yet nominated; KRY-001 remains partial. Contract publication, release-set validation and all other M0 tasks remain future work.

The reviewed planning identifiers are M0-PR1 through M0-PR37. M03-PRn was a planning typo and does not designate work in M3. This PR implements only M0-PR1; no schemas, runtime behavior, dependencies or other repositories change.

## M0-PR2: assurance and leakage declarations

26 October 2026, [issue #5](https://github.com/stanimirivanov/kryvola-spec/issues/5): added [FHE-Q1 assurance/consent schemas and a reference evaluator](assurance.md), with deterministic structural JSON Schema exports and disabled/unreviewed fixtures in bundle `0.1.0-preview.2`. Tests reject stronger unsupported claims, evidence substitution, inconsistent review/activation, hidden leakage and contradictory evidence/consent policies. JSON Schema alone is not the cross-field evaluator or authenticated approval. No profile is enabled, no cryptographic evidence is verified, and no deployed authorization is implemented. KRY-002/M0 remain unratified; existing consumer pins and ArtifactRef wire/native outputs are unchanged.

## M0-PR3: behavior-preserving generator stages

26 October 2026, [issue #7](https://github.com/stanimirivanov/kryvola-spec/issues/7): separated strict schema/descriptor validation and native rendering from provenance hashing and CLI filesystem operations. A parent-revision fixture pins all 17 contract outputs; positive/negative tests cover output equivalence, declaration-independent tags, rejected projections and provenance. Manifest source metadata includes both extracted helpers. No schema, bundle version, dependency, native/wire bytes or consumer pins change; the generator remains string-only for ArtifactRef. See [generator stages and limits](harness.md#generator-stages-m0-pr3). This completes only M0-PR3's refactor scope, not KRY-003 or full M0 qualification.
