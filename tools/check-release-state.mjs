import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actions, bounds, initial, step, violation } from "../models/release/model.mjs";

const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/state/release.json", import.meta.url)),
);
function replay(trace, mutation = "none") {
  let state = initial();
  let failure = null;
  const outcomes = [];
  for (const action of trace) {
    assert.ok(actions().includes(action), `unknown action ${action}`);
    const next = step(state, action, mutation);
    failure ??= violation(state, action, next.state);
    outcomes.push(next.outcome);
    state = next.state;
  }
  return { state, failure, outcomes };
}
function explore(mutation) {
  const queue = [{ state: initial(), parent: -1, action: null }];
  const seen = new Set([JSON.stringify(queue[0].state)]);
  const coverage = new Set();
  let edges = 0;
  for (let index = 0; index < queue.length; index++) {
    const { state } = queue[index];
    for (const action of actions()) {
      const next = step(state, action, mutation);
      edges++;
      coverage.add(next.outcome);
      if (next.outcome === "GRANTED" && state.compute.attempts.at(-1).retired)
        coverage.add("GRANT_AFTER_EXPIRY");
      if (next.outcome === "DISCLOSURE_CONFLICT" && state.workflowEpoch === 1)
        coverage.add("RECOVERY_DEDUP");
      if (next.outcome === "REPLAYED" && state.workflowEpoch === 1 && state.ledger[0].epoch === 0)
        coverage.add("RECOVERY_REPLAY");
      if (next.outcome === "GRANTED" && state.cancel === "PENDING") coverage.add("RELEASE_WINS");
      if (
        next.outcome === "REJECTED" &&
        action === `release:${state.workflowEpoch}` &&
        state.authorization &&
        state.cancel === "COMMITTED"
      )
        coverage.add("CANCEL_WINS");
      if (
        next.outcome === "REJECTED" &&
        action === `release:${state.workflowEpoch}` &&
        state.authorization &&
        state.revoked
      )
        coverage.add("REVOKE_WINS");
      const failure = violation(state, action, next.state);
      if (failure) {
        const trace = [action];
        for (let at = index; queue[at].parent !== -1; at = queue[at].parent)
          trace.unshift(queue[at].action);
        assert.equal(replay(trace, mutation).failure, failure);
        return { failure, trace };
      }
      const key = JSON.stringify(next.state);
      if (!seen.has(key)) {
        seen.add(key);
        assert.ok(
          seen.size <= bounds.states,
          "release state budget exceeded; exploration incomplete",
        );
        queue.push({ state: next.state, parent: index, action });
      }
    }
  }
  for (const required of fixtures.required_coverage)
    assert.ok(coverage.has(required), `vacuous release coverage: ${required}`);
  return { failure: null, states: queue.length, edges };
}
for (const fixture of fixtures.traces) {
  const result = replay(fixture.steps.map(([action]) => action));
  assert.equal(result.failure, null, fixture.name);
  assert.deepEqual(
    result.outcomes,
    fixture.steps.map(([, outcome]) => outcome),
    fixture.name,
  );
  assert.equal(result.state.ledger.length, fixture.grants, fixture.name);
}
const correct = explore("none");
assert.equal(correct.failure, null, JSON.stringify(correct));
console.log(
  `Release model: ${correct.states} states, ${correct.edges} edges; ${fixtures.traces.length} traces.`,
);
for (const [mutation, expected] of Object.entries(fixtures.mutations)) {
  const result = explore(mutation);
  assert.equal(result.failure, expected, `negative control ${mutation}`);
  console.log(`Counterexample ${mutation}: ${JSON.stringify(result.trace)} -> ${result.failure}`);
}
