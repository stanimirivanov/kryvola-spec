import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actions, bounds, initial, step, violation } from "../models/attempts/model.mjs";

const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/state/attempts.json", import.meta.url)),
);
function replay(trace, mutation = "none") {
  let state = initial();
  let failure = null;
  const outcomes = [];
  for (const action of trace) {
    assert.ok(actions(state).includes(action), `unknown action ${action}`);
    const next = step(state, action, mutation);
    failure ??= violation(state, action, next.state);
    outcomes.push(next.outcome);
    state = next.state;
  }
  return { state, failure, outcomes };
}

// Breadth-first exploration reports a shortest replayable counterexample.
function explore(mutation) {
  const queue = [{ state: initial(), parent: -1, action: null }];
  const seen = new Set([JSON.stringify(queue[0].state)]);
  const coverage = new Set();
  let edges = 0;
  for (let index = 0; index < queue.length; index++) {
    const { state } = queue[index];
    for (const action of actions(state)) {
      const next = step(state, action, mutation);
      edges++;
      coverage.add(next.outcome);
      if (next.state.executions.filter((e) => e.epoch === 1).length === 2)
        coverage.add("DUPLICATE");
      if (next.state.attempts.length === 2) coverage.add("RETRY");
      if (next.state.selected && next.state.attempts.at(-1).retired) coverage.add("RETAINED");
      const failure = violation(state, action, next.state);
      if (failure) {
        const trace = [action];
        for (let at = index; queue[at].parent !== -1; at = queue[at].parent) {
          trace.unshift(queue[at].action);
        }
        assert.equal(replay(trace, mutation).failure, failure);
        return { failure, trace, states: queue.length, edges };
      }
      const key = JSON.stringify(next.state);
      if (!seen.has(key)) {
        seen.add(key);
        assert.ok(seen.size <= bounds.states, "state budget exceeded; exploration is incomplete");
        queue.push({ state: next.state, parent: index, action });
      }
    }
  }
  for (const required of fixtures.required_coverage) {
    assert.ok(coverage.has(required), `vacuous exploration: missing ${required}`);
  }
  return { failure: null, states: queue.length, edges };
}

for (const fixture of fixtures.traces) {
  const result = replay(fixture.actions);
  assert.equal(result.failure, null, fixture.name);
  assert.deepEqual(result.outcomes, fixture.outcomes, fixture.name);
  assert.equal(result.state.selected?.id ?? null, fixture.selected, fixture.name);
}
const correct = explore("none");
assert.equal(correct.failure, null);
console.log(
  `Attempt model: ${correct.states} states, ${correct.edges} edges; ${fixtures.traces.length} traces.`,
);
for (const [mutation, expected] of Object.entries(fixtures.mutations)) {
  const result = explore(mutation);
  assert.equal(result.failure, expected, `negative control ${mutation} did not fail as expected`);
  console.log(`Counterexample ${mutation}: ${JSON.stringify(result.trace)} -> ${result.failure}`);
}

await import("./check-release-state.mjs");
