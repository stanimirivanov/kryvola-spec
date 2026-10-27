# ADR 0003: immutable contract candidates and reviewed release sets

Status: proposed governance, 26 October 2026. Implements the documentation scope of M0-PR1 / [issue #3](https://github.com/stanimirivanov/kryvola-spec/issues/3); human approval is pending.

## Context

[Design v2](../kryvola-design-v2.md) and the [implementation plan](../kryvola-implementation-plan-v2.md) require independent repository delivery against shared contracts. [ADR 0001](0001-schema-authoring.md) keeps Effect/TypeScript schema authority in spec and Redocly authority for OpenAPI. A green build of one repository cannot establish interoperable deployment, cryptographic safety, license approval or production readiness.

## Decision

### Candidate identity

Spec maintains contract definitions, normative vectors and decision records. A contract candidate identifies the full immutable source commit, contract/schema version, generated bundle and manifest hashes, toolchain/plugin pins and conformance evidence. A tag is a convenience pointer; the commit and verified artifact bytes establish identity. Do not move a published version to different bytes.

The current generated manifest records SHA-256 build provenance, not a signed protocol commitment. Its existence neither authenticates the publisher nor grants artifact access. Native crypto formats remain engine-owned; schema releases do not approve parameters or proof modes.

### Review and compatibility

1. The spec owner proposes a candidate through a dedicated issue and PR, documenting the changed contract, assurance/state implications and migration requirements.
2. Affected repository leads review the generated API and consumer impact. Security review is required for trust, state, custody, evidence or leakage changes; parameter/native-codec changes require engine review.
3. Preserve stable Protobuf tags, reserve removed tags/names, and separate wire evolution from signed-format evolution. Protobuf serialization is not canonical signing input. Unknown signed fields fail; a new signed field needs a versioned schema and vectors.
4. Before declaring compatibility, run affected cross-language, canonical, state/replay, native-codec and negative checks. An additive wire change can still alter authorization semantics and must be reviewed accordingly.
5. An incompatible candidate receives a new supported version and explicit reader/writer migration order. Never reinterpret old signatures, history or proofs under a new schema/verifier silently.

### Explicit consumer adoption

Consumers update `spec.lock.json` and their complete generated bundle in one repository PR. Verify the immutable source revision, manifest hash and every included file; run that repository's checks against the candidate. No sibling source checkout, floating branch, implicit package update or successful upstream build updates a consumer automatically.

Consumers may independently merge against a preview candidate while keeping unsupported runtime features disabled. This is contract adoption, not deployment approval. The [ownership inventory](../ownership.md) fixes implementation boundaries for production and test tools alike.

### Tested release set

Platform composes published artifacts into a proposed release set. The future release record must identify:

- All five exact repository commits, the contract source/version and bundle digest, and the separate review/ratification revision when applicable.
- Package and OCI image digests, native serialization/library versions, crypto parameter/profile digests, and relevant compiler/driver compatibility.
- Guest/program/verifying-key and verifier/circuit/ceremony artifact identities for enabled proof modes; absent or disabled features are explicit.
- Identity/policy bundle, dependency/SBOM/provenance/signature evidence, intended-use legal dispositions and numerical/capacity profile digests.
- Test reports bound to that exact composition, named review evidence and remaining exclusions. Fake engines, development identities and mock evidence remain labelled non-production.

Generate a final signed release-set artifact from the tested source revisions rather than committing a file that must contain its own future commit hash. A newer repository head does not change an accepted set. Missing required evidence blocks acceptance; optional exclusions do not fabricate a supported baseline.

### Approval, deployment and rollback

The platform integrator collects evidence. Repository leads approve their components/compatibility; security reviewers approve supported trust/parameter claims, authorized legal reviewers record deployment/distribution rights, and the operational owner accepts the measured envelope/recovery limits. Record authenticated reviewer identity, review link, decision and exact candidate/release digest; substantive changes invalidate affected approvals. Do not record approval from silence or tool success.

M0 ratification approves a contract/feasibility candidate, not production enablement. Deployment requires a separate authorized action and the owning milestone's gates. Changes to remote branch protection are maintainer actions, not side effects of checked-in documentation or CI.

Rollback selects a previously qualified release set only after confirming it can read current workflow history, stored schemas, crypto objects and evidence. Forward-only migrations need an explicit recovery path; restoring a binary cannot restore revoked permission or resurrect a cancelled job. Withdrawn artifacts remain identifiable; publish a superseding disposition instead of overwriting versions or evidence.

## Enforcement and current gaps

Today `pnpm check` checks foundation contracts, deterministic generation, Buf/Redocly and local documentation/ownership invariants. Consumer foundation harnesses verify pinned generated files. These checks do not implement candidate publication, full interoperability, state exploration, signed release-set admission or deployment.

M0-PR6 supplies native wire tooling, M0-PR8–12 supply canonical/state conformance, and M0-PR13 defines unqualified release-candidate records and a consistency/file-binding gate. M0-PR17/24/32/37 release-set/build acceptance remains later work; no successful schema check constitutes those gates. Manual ownership/security review is recorded in [ownership](../ownership.md); legal and release-specific operational sign-off remain pending future evidence.

## Consequences

Repository PRs remain independently reviewable and revertible. Coordinated publication/adoption requires additional consumer PRs and measured integration before release. No runtime dependency, wire schema, generated artifact, security claim or deployed setting changes in this decision's documentation PR.
