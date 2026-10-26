# Implementation ownership and review responsibilities

Status: proposed M0-PR1 inventory for [issue #3](https://github.com/stanimirivanov/kryvola-spec/issues/3), 26 October 2026. Repository ownership below follows [design v2](kryvola-design-v2.md); it does not assert implementation, nomination of human reviewers, or completed approval.

## Implementation ownership

Each component has exactly one implementation owner. Other repositories consume versioned contracts, packages, or images; they do not copy implementation source. Optional components remain disabled until their own gates pass.

| Component                            | Implementation owner | Responsibility and boundary                                                                                                         |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| contract-definitions                 | kryvola-spec         | Effect/TypeScript schemas, generated Protobuf and native projections; Redocly OpenAPI. No service runtime dependency on TypeScript. |
| assurance-and-leakage-profiles       | kryvola-spec         | Trust assumptions, evidence requirements, supported-profile definitions and negative policy fixtures.                               |
| wire-canonical-and-state-conformance | kryvola-spec         | Golden/negative vectors, canonical format conformance tools and normative state models; no native FHE implementation.               |
| gateway-and-admission                | kryvola-fabric       | Rust gateway and authenticated tenant/operation admission.                                                                          |
| artifact-service                     | kryvola-fabric       | Immutable finalization, purpose-scoped grants, pins and collection; object existence is not release authorization.                  |
| operation-registry-and-coordinator   | kryvola-fabric       | Rust APIs over SQL attempts, fences, selection, inbox/outbox and release ledger; cannot invent workflow intent.                     |
| event-outbox-and-ingress             | kryvola-fabric       | Bounded event publication, deduplication and broker ingress; events are not authoritative completion state.                         |
| temporal-workflows-and-activities    | kryvola-fabric       | Python durable logical workflows and activities; deterministic workflow code performs no external I/O.                              |
| ray-dispatch-bridge                  | kryvola-fabric       | Python reference-only dispatch and observations; no durable DAG, key custody or release authority.                                  |
| receipt-and-release-service          | kryvola-fabric       | Signed claims and enforcement of committed release decisions; a receipt is not an execution proof.                                  |
| owner-agent                          | kryvola-fabric       | Owner-domain custody, approvals and result opening using packaged owner crypto; no cloud decrypt RPC.                               |
| interactive-session-coordinator      | kryvola-fabric       | Authorized session epochs and single-use preprocessing reservations; no protocol engine implementation.                             |
| attestation-and-envelope-adapters    | kryvola-fabric       | Optional attestation/release and ABE wrapping integration; separate reviewed profiles.                                              |
| fabric-workflow-conformance-fixtures | kryvola-fabric       | Test-only Temporal/Ray workers and recorded replay fixtures, clearly separate from production services.                             |
| engine-api-and-fake-engine           | kryvola-engines      | Native operational adapters and deterministic fake-engine conformance implementation; fake is never a crypto capability.            |
| tfhe-owner-crypto                    | kryvola-engines      | Owner-only key generation, encryption and decryption bindings; private keys never enter compute packages or messages.               |
| tfhe-evaluation                      | kryvola-engines      | Rust CPU and optional GPU evaluation using public/evaluation material only.                                                         |
| zkvm-guests-and-provers              | kryvola-engines      | SP1 and optional RISC Zero guests, hosts and bounded verifiers; statements do not imply native FHE correctness.                     |
| optional-native-engines              | kryvola-engines      | CKKS, MPC, PSI, PIR, zkML and other approved Rust/C++/CUDA adapters and native codecs.                                              |
| threshold-crypto-adapter             | kryvola-engines      | Optional bindings to a separately reviewed threshold system; its independent custodians are outside Kryvola service custody.        |
| engine-and-owner-package-builds      | kryvola-engines      | Independent engine images and owner crypto packages, toolchain pins, SBOMs and build provenance.                                    |
| owner-sdk                            | kryvola-ml           | Python user-facing lifecycle and packaged owner bindings; no internal fabric/engine imports.                                        |
| model-import-and-quantization        | kryvola-ml           | Supported public model import, quantization and numerical limits; unrestricted import is not implied.                               |
| reference-fixture-semantics          | kryvola-ml           | Plaintext baseline, dataset/model cards, accuracy and exact arithmetic semantics.                                                   |
| plan-compiler-and-cost-model         | kryvola-ml           | Static approved plans and later constrained cost routing; unsupported trust/precision requirements fail closed.                     |
| dp-accounting                        | kryvola-ml           | Optional reviewed privacy accounting logic; fabric still owns transactional state and release enforcement.                          |
| service-deployment-and-identities    | kryvola-platform     | SQL, S3, Redpanda, Temporal, Ray, SPIRE and infrastructure configuration; no application workflow logic.                            |
| benchmark-and-fault-harness          | kryvola-platform     | Cross-repository orchestration, measurements, fault/security tests and capture of published-artifact evidence.                      |
| release-set-and-qualification        | kryvola-platform     | Exact tested repository/package/image composition and qualification reports, not cryptographic implementations.                     |
| observability-and-recovery           | kryvola-platform     | Operational metrics, backups, restore drills and runbooks, preserving fabric authorization invariants.                              |

Upstream brokers, storage, orchestration and compute runtimes retain their upstream implementation ownership. Kryvola owns their deployment/adapters as listed above, not forks or alternative implementations.

## State and trust boundaries

- Temporal history owns logical progression, retry eligibility and the decision to release. The SQL registry enforces current fences, selection and release effects; Ray holds disposable placement/cache state only.
- A committed selection survives dispatch lease expiry. Release still checks current cancellation, policy, recovery and recipient authorization; no bridge or proof verifier can authorize disclosure.
- Owners retain private decryption keys. Compute, brokers, Temporal workers and provers receive no such keys; evaluation material is classified separately. Platform deployment credentials are not FHE keys.
- References carry neither bulk ciphertext/proof bytes nor bearer credentials. Schema/manifest hashes identify bytes and do not authenticate a principal or authorize access.
- Test doubles remain owned by the component's repository; platform composes their published artifacts. An in-scope conformance fixture is not a production fallback.

## Review responsibilities

The implementation owner proposes changes and supplies tests. Spec reviewers own contract semantics and compatibility; affected repository leads review consumption. Security reviewers assess trust, custody, evidence and leakage changes. Engine reviewers supply parameter/native-codec evidence; an authorized legal reviewer records intended-use dispositions. Platform release integrators verify the tested composition without approving those specialist claims themselves.

These are responsibilities, not assignments to named people. One person may cover multiple repository roles if that fact is recorded; security/legal approval cannot be inferred from a repository merge. No automated check verifies reviewer expertise or authority.

## Manual ownership approval gate

Before KRY-001 is marked complete, nominate each reviewer and record their authenticated review link, outcome, reviewed spec commit and ownership-document digest. A substantive boundary change requires renewed affected-owner/security review. A passing test or this PR's merge does not fill the table.

| Required role                                | Named reviewer / review evidence | Status  |
| -------------------------------------------- | -------------------------------- | ------- |
| kryvola-spec lead                            | Not nominated                    | Pending |
| kryvola-fabric lead                          | Not nominated                    | Pending |
| kryvola-engines lead                         | Not nominated                    | Pending |
| kryvola-ml lead                              | Not nominated                    | Pending |
| kryvola-platform lead                        | Not nominated                    | Pending |
| Security reviewer for trust/state boundaries | Not nominated                    | Pending |

Release-specific legal and operational approvals follow [ADR 0003](adr/0003-release-governance.md). Use the [ADR template](adr/template.md) for further decisions. The detailed plan uses M0-PRn identifiers; the earlier M03-PRn prefix was a planning typo, not milestone M3 work.
