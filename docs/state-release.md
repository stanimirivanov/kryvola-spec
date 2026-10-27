# Bounded disclosure, cancellation and recovery model

M0-PR12 extends `pnpm check:state` and CI's existing `verify` job through
`tools/check-release-state.mjs`, `models/release/model.mjs` and the fixed traces in
`fixtures/state/release.json`. The original attempt model still runs unchanged.
There are no new dependencies, runtime APIs, schemas, migrations or crypto claims.

## Composition and boundaries

The release model starts at a finalized-candidate boundary: the real M0-PR11
transitions authorize one attempt, ensure its lease, launch two pure executions
and complete their separate immutable outputs. It delegates selection, time
advancement and compute safety predicates to that model. M0-PR11 explores all
dispatch interleavings separately; this model explores their release-boundary
projection rather than claiming to explore their complete Cartesian product.

One tenant/job/plan/output stage/recipient and disclosure index zero are fixed.
`operationKey` includes the application workflow epoch, while `disclosureKey`
excludes application epoch, attempt epoch, execution ID and Temporal run ID.
Continue-As-New changes only a diagnostic run counter. Output identities are two
abstract immutable manifests, independent of epoch: the same artifact can recur
after recovery. They are identity labels, not digests or cryptographic checks.

`verify` abstracts successful verification for the selected output/current epoch;
`authorize-release` is a subsequent explicit workflow decision. The atomic release
transaction checks current authorization, evidence, recovery quarantine, revocation
and cancellation before reading/inserting the stable disclosure ledger. A retry
returns the existing record for the same artifact; another artifact conflicts.
Selection survives dispatch expiry: lease liveness gates new selection, not release
of an already selected artifact. Selection cannot be replaced within an operation.

Cancellation has separate request, tombstone commit and acknowledgement steps.
A request alone does not acknowledge `CANCELLED`; commit serializes against both
selection and release, then acknowledgement is allowed. Either release or the
tombstone can win that order. Revocation is another permanent release barrier,
including after workflow authorization. Committed grants/previously disclosed
information are not erased by later cancellation or revocation. This model counts
grant effects, not recipient downloads or the ability to retract disclosed data.

Coordinated recovery increments application epoch, clears old computation/evidence/
authorization and quarantines new work while preserving ledger, revocation and
cancellation tombstones. `reconcile-unknown` leaves quarantine intact. `reconcile`
means independent audit/owner watermarks have established authoritative freshness;
only then can an explicit `workflow-readmit` decision seed new pure compute.
Stale epoch completions and release requests remain rejected. Existing grants are
replayed for identical output after renewed authorization, never minted again.

## Evidence and limitations

Breadth-first exploration exhausts reachable states within two application epochs,
two diagnostic runs total, two candidate outputs per operation, one attempt per
operation and DB-time instants 0–3 inherited from M0-PR11. Recovery seeds a new
approved operation/deadline; it does not rewind an old operation's lease. The
100,000-state cap fails closed. Fixed traces cover lease expiry, Continue-As-New,
both cancellation orders, missing authorization, revocation, ambiguous recovery,
old completions and same/different-output recovery retries. Required coverage
checks prevent a vacuous pass for either race outcome or deduplication behavior.

Five broken-rule variants must yield shortest replayable counterexamples: early
acknowledgement, forgotten tombstones, bypassed release barriers, stale selection
and epoch-scoped disclosure keys. Transition-independent safety predicates also
check durable revocation/ledger records, immutable selection, current evidence/
authorization and recovery quarantine. The same command prints all witnesses.

This is finite safety evidence, not unbounded proof, liveness, SQL isolation or
live Temporal/Ray testing. Authenticated callers, atomic coordinator transactions,
immutable artifact binding and truthful evidence/watermark verification are
assumptions. It does not simulate snapshot storage/audit protocols; an unresolved
watermark requires remaining suspended, not fresh approval. Multiple disclosures,
policy/key/version-specific revocation, MPC randomness, DP budgets, admission
retention and real crash/restore integration remain later qualification. No
runtime service can consume this model as an authorization implementation.
