# FHE-Q1 assurance and consent preview

M0-PR2 / [issue #5](https://github.com/stanimirivanov/kryvola-spec/issues/5) implements reference declarations for [KRY-002](kryvola-implementation-plan-v2.md). No profile is enabled or qualified by this change. The published FHE-Q1 v1 fixture is single-owner, disabled, unreviewed, and has unresolved legal/parameter references.

## Independent claims

| Dimension             | Baseline declaration | Limit                                                                                                       |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Input confidentiality | OWNER_KEY_ENCRYPTION | Depends on reviewed parameters and the owner's implementation; private keys stay owner-side.                |
| Computation integrity | UNPROVEN             | Encryption, signatures, redundancy and input/metadata proofs do not prove honest FHE evaluation.            |
| Input validity        | NOT_ESTABLISHED      | Even a supported compact-encryption proof would not establish truth of measurements or business predicates. |
| Model visibility      | PUBLIC               | Weights/program are non-confidential; private-model requests fail.                                          |
| Output privacy        | ENCRYPTED_TO_OWNER   | No arbitrary remote decrypt endpoint or useful worker-visible decryption feedback is permitted.             |
| Witness privacy       | PUBLIC_DATA_ONLY     | No private-witness or zero-knowledge proof-mode claim; a prover sees what it receives.                      |
| Availability          | BEST_EFFORT          | No cryptographic availability, fairness, recovery or latency guarantee.                                     |

Consent declarations explicitly disclose public models, unproven evaluation, owner endpoint trust/compromise and residual side channels. They must accept each declared shape, model/program, crypto payload size (ciphertexts, evaluation keys and proofs), timing, access pattern, key-reuse and cache-state leakage. They are not signed approvals and bind no tenant, job, model or key epoch; actual owner approval must bind those identities under the later canonical plan/release contracts.

## Validation and evidence policy

`src/assurance.ts` authors the Effect schemas. `decodeAssuranceProfile` checks review/activation consistency and duplicate sets; `decodeAssuranceRequest` validates the request/consent. Generated JSON Schemas are structural projections: the exported schemas do not replace these cross-field checks. Review/legal/parameter IDs are lookup references, not evidence of authentic approval.

`assessAssurance` returns denial codes for disabled profiles, unsupported independent requirements, unaccepted leakage, unsupported relations and contradictory evidence policy. Decode errors also mean rejection, never a retry under weaker requirements. Its profile input must come from an independently authenticated, allowlisted record, never worker self-advertisement. An empty result means declaration compatibility only; it does not grant access, verify proofs, authenticate consent or establish production readiness. Tests use synthetic reviewed records to exercise this boundary; no reviewed/enabled fixture is published.

- `NONE` permits no evidence relations and requires explicit consent to unverified release.
- `OPTIONAL_LATER` requires named supported relations and consent to release without verified evidence; late evidence cannot retroactively withhold an earlier release.
- `REQUIRED_BEFORE_RELEASE` requires nonempty supported relations. A future runtime must verify the exact required statements before release; required input validity precedes compute. Declaration compatibility does not perform verification.

Only Temporal owns logical release authority; the registry must enforce committed release effects and current authorization/cancellation/recovery predicates. Ray, a bridge or a proof verifier cannot grant disclosure. This PR implements none of those runtime services.

## Threats and residual boundaries

| Threat                                      | Required boundary / residual limit                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious worker fabricates output          | Baseline evaluation is unproven; reject malicious-compute correctness demands rather than accepting a signed receipt or unrelated proof.                                                |
| Compromised bridge/replayed event           | Reference-only dispatch, workflow authority and future fencing/authorization; this schema is not a state machine.                                                                       |
| Tenant crossover/parameter substitution     | Independently authorize tenant/key/model/parameter bindings before native decoding; references and conformance alone do not prove owner identity.                                       |
| Timing/size/access/cache side channels      | Disclose leakage and require external isolation; constant-time execution and complete microarchitectural protection are not promised.                                                   |
| Owner compromise/decryption oracle          | Owner endpoint trust is explicit; cloud workers hold no private keys and may not query arbitrary owner decrypt results.                                                                 |
| Malformed data/DoS/control-plane compromise | Bounded declarations and strict fields; later native/resource guards and trusted release enforcement remain necessary. A malicious control plane can deny service or misroute metadata. |

Run `pnpm check` for strict decoding, positive/negative requirement and consent matrices, deterministic export/provenance checks and existing checks. Regenerate with `pnpm generate`; never edit generated files. Bundle `0.1.0-preview.2` adds these schemas/fixtures without changing ArtifactRef v1, wire tags or native projections. Existing consumer pins remain unchanged until explicit adoption. Security/parameter/legal review and KRY-002 ratification are still pending; see [progress](progress.md).
