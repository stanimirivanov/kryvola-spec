# M0 close-out — ratified non-production baseline

Current project milestone status: **CLOSED_FOR_RATIFIED_NONPRODUCTION_SCOPE**.
This closes M0's approved contract/feasibility and qualified fake-only composition
baseline. It does not assert that every originally planned production or
cryptographic capability has been implemented or qualified.

## Authority and exact baseline

This is a current-status addendum to the original [implementation plan](kryvola-implementation-plan-v2.md),
not a rewrite of that historical plan or its acceptance criteria. The controlling
decision is [the actual solo-owner ratification](m0-ratification-approved.md),
recorded in [the v2 decision](m0-ratification-approved.json), under
[ADR 0004](adr/0004-solo-owner-agentic-review.md). The owner reviewed
[the agentic package](m0-solo-review/README.md) and approved its exact subject and
report in [comment 6547394306](https://github.com/stanimirivanov/kryvola-spec/pull/54#issuecomment-6547394306).
Spec PR #56 and Platform verifier fix PR #45 are merged. Their earlier pending
wording remains a historical observation, not a current dependency blocker.

The [qualification ledger](m0-composition-qualification.json) identifies all five
published artifacts and the immutable retained evidence archive. Publisher
signatures and exact bindings passed; the installed wheel/driver bytes, service
checks, replay, network/isolation controls, admission negatives, cleanup and
post-run predicates passed. No new release or qualification run is claimed by
this documentation close-out.

- Tested candidate: bbfafdfc85f0bf41f90b6cd520f0fac5fb44eabcbf59507e411db1fb5f9fbf01.
- Composition report: 3085d512c596513c29f701ad1f90543e3114ee65eae6c7e588d05ce37cc6a909.
- Reviewed subject: 348f32c09322ee0da99fd7cf941f98778ccd0e8bbdb3bbb33f6ebc8d11917fce.
- Agentic report: d9028c74a69c50f9fd74f76e2a870810211da45547901051a72d697d1e9d00eb.

The qualified sources remain Spec contracts 1a5b57a590487ba116913050af8041f5e5f1fb52
(published by 12f20a9324d2e8069c16a2ab41f10999e14d2d55), Fabric
f02281ffa78decb6acd032c102359bf758f92a3a, Engines
f8023959081fa6a1e8169b41ef427630a5da72f3, ML
68f949516b450a77eb30229ac2d1f92e6e4ad740 and Platform
b9993e98ef534039f8f8bbdd5346aa6363a9d7ed. Later governance/verifier commits do not
retroactively change those tested artifact identities.

## Original M0 roadmap disposition

The original KRY identifiers are roadmap work-package IDs, not GitHub issue
numbers. This table is evidence/disposition traceability, not bulk closure of
unrelated GitHub issues. "Baseline delivered" means delivered within the owner's
ratified scope. Remaining original criteria are explicitly retained below; they
must pass before the affected capability is enabled.

| Original item                             | Evidence delivered for this baseline                                                                                                                                                                                                                                      | Remaining boundary / disposition                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KRY-001 — architecture/ownership          | [Ownership boundaries](ownership.md), original design/ADRs, versioned contract identities, [solo governance](adr/0004-solo-owner-agentic-review.md) and exact owner decision.                                                                                             | Baseline delivered under one accountable owner plus agentic review. Historical multi-role nomination/signature slots are not fabricated or populated. Future implementation ownership remains explicit.                            |
| KRY-002 — assurance/leakage               | [Assurance and consent](assurance.md), disabled profile fixtures, reference policy rejection cases and the agentic report's security limitations.                                                                                                                         | Bounded declarations/review delivered. No production threat-model certification or approval of real crypto parameters is asserted; unsupported profiles stay disabled.                                                             |
| KRY-003 — bounded control/engine APIs     | [Control](control.md), [engine boundary](engine.md), [native wire](native-wire.md), cross-language vectors and actual published fake conformance/transport negatives.                                                                                                     | Contract/fake baseline delivered. Production identity, encrypted execution and service integration remain later runtime work.                                                                                                      |
| KRY-004 — canonical/native artifacts      | [Canonical formats](canonical.md), Rust/Python/C++ conformance, generated byte vectors and strict reference validation.                                                                                                                                                   | Bounded format/conformance baseline delivered. This is not universal native crypto decoding, arbitrary large-artifact safety or production storage/release authorization.                                                          |
| KRY-005 — fenced state protocol           | [Attempt/fence model](state-attempts.md), [release/recovery model](state-release.md), bounded state exploration, fixture replay and SQL/artifact traversal.                                                                                                               | Spec/model baseline delivered. Models do not substitute for the full production registry, outbox, durable workflows or recovery implementations.                                                                                   |
| KRY-006 — reproducible benchmark profiles | [Measurement contracts](measurement-release.md), qualified shaped-network reports and retained feasibility campaigns with explicit units/failures/source identities.                                                                                                      | Harness/research evidence delivered. Synthetic stages are not owner-to-owner latency; complete crypto/service distributions, resource envelope and SLO claims remain unqualified.                                                  |
| KRY-007 — supply-chain/permissions        | All five signed publications, exact toolchain/source/artifact locks, provenance/SBOM inputs and fake-engine two-build checks.                                                                                                                                             | Fake-only publication baseline delivered. Real TFHE/SP1 distribution/service permission is still DENY. Do not label dependency metadata as legal clearance or claim a published crypto OCI image/owner package from fake archives. |
| KRY-008 — crypto feasibility              | [Retained engine feasibility decision](https://github.com/stanimirivanov/kryvola-engines/blob/a60dd541cf3bd18389d99cba3a7126e02a479963/docs/m0-feasibility.md), pinned numeric research campaigns and declared go/no-go limits.                                           | Research evidence delivered, not a supported crypto service. Private production inference remains NO_GO and service latency INCONCLUSIVE. GPU/private-witness/alternate-proof claims remain unavailable or disabled.               |
| KRY-009 — ML plaintext baseline           | [Frozen public workload](https://github.com/stanimirivanov/kryvola-ml/blob/68f949516b450a77eb30229ac2d1f92e6e4ad740/docs/model-card.md), licensed synthetic inputs, model/program/fixture manifests, exact arithmetic and 100-case reproduction from the installed wheel. | Bounded integer-circuit baseline delivered. Not general model accuracy, trained-classifier quality, encrypted-output correctness or an approved production TFHE profile.                                                           |
| KRY-010 — integration harness             | Exact five-component archive, pinned service fixtures, fake reference-only traversal, replay, isolation/admission negatives and post-cleanup composition evidence.                                                                                                        | Qualified non-production harness delivered. Not production deployment, real private inference or production HA/DR qualification.                                                                                                   |

## Carry-forward work and preserved restrictions

No excluded feature is silently marked done or absorbed as completed M0 work:

- Real owner-to-owner transport/cache behavior, immutable runtime artifacts, owner
  custody/encryption, CPU TFHE execution, production fencing and durable inference
  belong to the affected M1 work (including KRY-011–020). Permissions and supported
  parameter/accuracy/security evidence must be resolved before enabling real crypto.
- Real end-to-end warm/cold distributions, complete owner-side/queue/evidence stages,
  resource envelopes and capacity claims remain workload-specific runtime and
  measurement gates. Warm p95 <=5 s and cold p95 <=15 s are still unmeasured targets,
  not results produced by fake workflow timing.
- GPU/PBS, alternate proof exports and private-witness support remain separately
  gated by the owning M2/extension work; optional research is not a prerequisite
  for the approved fake-only baseline and cannot be advertised as enabled.
- Production security/isolation, deployment, availability, backup/DR and accepted
  SLOs remain M5/profile-specific qualification work, not closed by local fixtures.
- TFHE/SP1 distribution/commercial-service DENY remains in force. Owner acceptance
  of documented residual risk is not a legal opinion, a patent/service permission
  grant or cryptographic parameter certification.

The original roadmap remains the future delivery reference. When planning an
affected later task, carry forward its unresolved prerequisites explicitly; this
close-out does not waive them. Subsequent development may start from the ratified
baseline, but no running service, protocol profile or deployment is authorized.

## Status interpretation and remaining operations

| Status/flag                                                | Meaning after this close-out                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Project milestone M0                                       | Closed for the owner-ratified non-production scope above.                                                         |
| m0_ratified                                                | True in the actual v2 ratification record.                                                                        |
| m0_accepted / m1_admitted                                  | False in existing runtime/acceptance evidence; administrative milestone closure does not mint an admission token. |
| production_ready / profile_enabled / deployment_authorized | False; no activation or deployment permission.                                                                    |
| Historical BLOCKED_PENDING_SIGNOFFS / old audit blockers   | Preserved historical v1 inputs and outputs. They must not be read as missing current solo-owner approval.         |
| Acceptance publication                                     | Disabled; no acceptance artifact is needed for this scoped administrative close-out.                              |

The old Platform README/audit and earlier progress entries describe the historical
v1 audit, whose frozen blockers deliberately do not promote to success. The v2
solo gate and actual ratification are the current decision path. Do not "fix"
history by changing old hashes, pending records or legacy legal/signing assertions.
The original intended_use text ending "approvals pending" is likewise preserved
reviewed data; the explicit owner comment and ratification record establish the
actual decision.

There is no remaining release, qualification or reviewer ceremony for this exact
scope. Do not publish another component merely to relabel it closed, rerun an
unchanged qualification gratuitously, or publish an acceptance artifact as a
side effect of this close-out. A future machine-readable administrative closure
command is optional tooling, not a newly introduced M0 prerequisite. Supporting
v2 acceptance publication would require a separate explicit versioned change and
authorization; the legacy publisher must not reinterpret this owner approval.

Preserve evidence commits and backups. For future current-use verification, keep
independent owner/revocation policy current and enforce expiry; the recorded
verification event is historical and does not promise perpetual authentication.
Withdrawal/substantive changes require a visible successor and renewed affected
review. Reverting a document alone is not revocation.

Existing checks remain the verification entry points:

```sh
node tools/check-solo-ratification.mjs
pnpm check
```

The first command establishes historical record consistency, not live owner
verification. No contract/schema, runtime flag, publisher setting or immutable
qualified evidence byte is changed by this close-out.
