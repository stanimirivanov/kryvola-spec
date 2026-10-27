# Bounded attempt and fence model

M0-PR11 models design v2 §5.2 in `models/attempts/model.mjs`. Run `pnpm check:state`
(also in `pnpm check` and CI's `verify` job). It uses only Node built-ins: no new
runtime dependency, SDK, service, database or model-checker installation.

The breadth-first checker in `tools/check-state.mjs` exhausts every reachable state
and enabled/rejected action at these explicit bounds: one tenant/operation, two
workflow-authorized attempt epochs, two physical executions per attempt, four DB
time instants (0–3), and deadline 3. A fresh lease lasts one instant; renewal can
extend it by two instants, capped at the deadline. The 100,000-state resource cap
fails the gate rather than treating incomplete exploration as success. JSON state
equality deduplicates states; no partial-order reduction or depth cutoff is used.

## Authorities and atomic boundaries

- Only `workflow-authorize` creates a logical epoch. Worker requests are rejected;
  `ensure` retries do not derive epochs from SDK activity retry counters.
- `ensure` atomically commits lease/fence and SQL dispatch intent. `launch` is a
  separate external effect; it leaves intent unacknowledged. Retrying after a lost
  acknowledgement can create another execution ID and distinct immutable output.
  `ack` is a separate durable bridge observation. Lost ack/bridge crash is modeled
  by leaving that step unscheduled, with no transactional SQL/Ray assumption.
- Time advancement retires expired leases irreversibly. Renewal cannot resurrect
  them. Only a new explicit workflow decision can authorize the next epoch/fence.
- `complete` means an immutable execution-specific artifact has finalized, even
  when its grant is stale. `select` represents one coordinator SQL transaction:
  it checks the current unexpired fence and atomically commits selection/outbox.
  A stale completion cannot select. Conflicting outputs need not be byte-identical;
  selection returns the first accepted output and rejects another execution.
- Lookup and same-result finalization return committed selection after lease
  expiry. This says nothing about subsequent release authorization.

Invariant predicates are separate from transition guards. They check workflow-only
authorization, irreversible retirement, immutable selection, authorized executions
and a completed artifact with the live current epoch/fence at selection time.
`fixtures/state/attempts.json` pins explicit expected outcomes for lost-ack duplicate
dispatch, crash before launch, expiry, renewal/deadline, explicit logical retry,
stale completion, selection conflict and lookup after expiry. Coverage requirements
fail if duplicate execution, retry, retained selection or other listed outcomes
become unreachable, guarding against vacuous safety passes.

Three intentionally broken variants must produce replayable shortest counterexamples:
reacquiring a retired epoch; omitting live-fence checks; and accepting an old fence
while the new attempt has a live lease. The checker replays each discovered trace
and requires its expected invariant violation. Counterexamples are diagnostic action
arrays printed in CI, not success evidence for those weakened rules.

## Prior art and limits

Adapted patterns: [Temporal activity idempotency](https://docs.temporal.io/activity-definition)
and [Ray task fault tolerance](https://docs.ray.io/en/latest/ray-core/fault-tolerance/tasks.html)
motivate retryable observations and duplicate physical work. No upstream code is
copied, dependency is added or wrapper is introduced; upstream license/dependency
obligations are unchanged. The bounded explicit-state algorithm is custom test
tooling under this repository's Apache-2.0 license.

This is finite safety exploration, not an unbounded proof, fairness/liveness claim,
SQL isolation test or live Temporal/Ray integration. Operation identity, approved
intent/input binding, immutable storage, authenticated grants, DB time and atomic
coordinator transactions are assumptions. Fence equals monotonically increasing
attempt epoch in this model; deployment/recovery fencing remains unmodeled. Epoch
and execution bounds limit the evidence; multiple tenants, clock skew, arithmetic
overflow, malicious storage, resource starvation and interactive one-use material
need separate qualification. The model covers pure restartable compute only.

The [M0-PR12 release model](state-release.md) adds stable workflow/recovery identity,
disclosure deduplication and cancellation/revocation ordering at the compute boundary.
No release service, consent service, SQL migration, Temporal workflow or Ray adapter
is implemented here. M0/KRY-005 remain partial.
