# Foundation progress

Scope: repository bootstrap associated with GitHub issue #1, 25 October 2026.

| Item                                                     | Status                               | Evidence / remaining work                                                                                 |
| -------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Schema authoring/toolchain amendment                     | Implemented                          | ADR 0001, exact package versions and lock                                                                 |
| Contract/reference preview and deterministic projections | Implemented, verified locally        | Effect source, generated artifacts and negative fixtures                                                  |
| Setup, local tasks, CI and root guidance                 | Local checks verified; CI configured | README, harness map, workflow and AGENTS.md                                                               |
| KRY-001 architecture map                                 | Partial; governance proposed         | M0-PR1 ownership inventory/ADR 0003; named owner/security approval and release-set tooling remain pending |
| KRY-002 threat/assurance profiles                        | Documentation baseline only          | Design v2; complete machine-enforceable profiles remain future work                                       |
| KRY-003/004 APIs/canonical formats                       | Preview only                         | No full Engine API, RPC bindings, canonical signing or production freeze                                  |
| KRY-005 durable state protocol                           | Deferred                             | No Temporal/SQL/Ray implementation or concurrency proof                                                   |
| KRY-006–010 feasibility/platform gates                   | Deferred                             | No crypto benchmark, heavy engine packaging, model approval or full local stack                           |

No complete M0 milestone is marked done. Next: review and extend KRY-002/003 with the full bounded Engine/control contracts and versioned assurance profiles before fabric runtime integration.

## Observed verification

On Windows, Node 24.18.0 / pnpm 12.5.1: `pnpm check` passed (strict Biome, TypeScript 7 build, architecture guard, 12 deterministic artifacts, five positive/negative tests, Buf and Redocly lint/bundle/docs). A disposable copy with no node_modules passed `pnpm install --frozen-lockfile`, the full `pnpm check`, and `pnpm inspect`. Missing or invalid controls were exercised by the isolated fixtures.

CI is configured, but no hosted run is claimed. Required-check/branch settings remain maintainer actions. Full M0 crypto/operational/security gates remain deferred. The final diff preserves the original LICENSE and the supplied design; the plan adds only an explicit progress amendment.

## M0-PR1: ownership and release governance

26 October 2026, [issue #3](https://github.com/stanimirivanov/kryvola-spec/issues/3): added the [component ownership inventory](ownership.md), [proposed release-governance ADR](adr/0003-release-governance.md), ADR template and documentation tests. Automated checks cover inventory completeness/uniqueness and local links; they do not approve the documented boundaries. The five repository leads and security reviewer are not yet nominated; KRY-001 remains partial. Contract publication, release-set validation and all other M0 tasks remain future work.

The reviewed planning identifiers are M0-PR1 through M0-PR37. M03-PRn was a planning typo and does not designate work in M3. This PR implements only M0-PR1; no schemas, runtime behavior, dependencies or other repositories change.
