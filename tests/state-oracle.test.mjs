import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkStateTrace } from "../dist/state-oracle.js";
import * as attempts from "../models/attempts/model.mjs";
import * as release from "../models/release/model.mjs";
import { sha256 } from "../tools/provenance.mjs";
import { exportOracle, oracleFiles } from "../tools/state-oracle.mjs";

for (const [name, model] of Object.entries({ attempts, release })) {
  test(`${name}: exported graph exactly represents every reachable model transition`, () => {
    const raw = oracleFiles().get(`state/v1/${name}.oracle.json`);
    const oracle = JSON.parse(raw);
    assert.equal(
      raw,
      readFileSync(new URL(`../generated/state/v1/${name}.oracle.json`, import.meta.url), "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(new URL("../generated/manifest.json", import.meta.url)),
    );
    assert.equal(manifest.files[`state/v1/${name}.oracle.json`], sha256(raw));
    for (const [path, digest] of Object.entries(oracle.source_sha256)) {
      assert.equal(digest, sha256(readFileSync(new URL(`../${path}`, import.meta.url))));
      assert.equal(manifest.sources[path], digest);
    }
    assert.deepEqual(oracle.bounds, model.bounds);
    assert.equal(oracle.initial, 0);
    assert.ok(oracle.nodes.length > 2000, "non-vacuous exhaustive model");
    for (const node of oracle.nodes) {
      assert.deepEqual(
        node.edges.map(([action]) => oracle.actions[action]),
        model.actions(node.state),
      );
      for (const [action, outcome, target] of node.edges) {
        const result = model.step(node.state, oracle.actions[action]);
        assert.equal(oracle.outcomes[outcome], result.outcome);
        assert.deepEqual(oracle.nodes[target].state, result.state);
        assert.equal(model.violation(node.state, oracle.actions[action], result.state), null);
      }
    }
    const fixtures = JSON.parse(
      readFileSync(new URL(`../fixtures/state/${name}.json`, import.meta.url)),
    );
    const samples = JSON.parse(
      readFileSync(new URL(`../generated/state/v1/${name}.traces.json`, import.meta.url)),
    );
    assert.equal(samples.length, fixtures.traces.length);
    for (const sample of samples) assert.doesNotThrow(() => checkStateTrace(raw, sample));
    let fenceChecks = 0;
    for (const fixture of fixtures.traces) {
      let state = model.initial();
      const trace = {
        format: "kryvola-state-trace-v1",
        model: name,
        oracle_sha256: sha256(raw),
        steps: (fixture.actions ?? fixture.steps.map(([action]) => action)).map((action) => {
          const next = model.step(state, action);
          state = next.state;
          return { action, outcome: next.outcome, state };
        }),
      };
      assert.doesNotThrow(() => checkStateTrace(raw, trace));
      for (const change of [
        (value) => {
          value.steps = [];
        },
        (value) => {
          value.unplanned = true;
        },
        (value) => {
          value.steps[0].outcome = "CORRUPTED";
        },
        (value) => {
          value.steps.reverse();
        },
        (value) => {
          value.steps[0].state.unplanned = true;
        },
        (value) => {
          value.oracle_sha256 = "f".repeat(64);
        },
        (value) => {
          value.format = "kryvola-state-trace-v2";
        },
        (value) => {
          value.model = name === "attempts" ? "release" : "attempts";
        },
      ]) {
        const bad = structuredClone(trace);
        change(bad);
        assert.throws(() => checkStateTrace(raw, bad));
      }
      const fence = structuredClone(trace);
      const observed = fence.steps.find(
        (event) => (event.state.attempts ?? event.state.compute?.attempts)?.length,
      );
      if (observed) {
        fenceChecks++;
        const attempt = (observed.state.attempts ?? observed.state.compute.attempts)[0];
        attempt.fence++;
        assert.throws(() => checkStateTrace(raw, fence));
      }
    }
    assert.ok(fenceChecks > 0, "fence negative is non-vacuous");
  });
}

test("incomplete exploration fails rather than exporting a partial oracle", () => {
  const model = { ...attempts, bounds: { ...attempts.bounds, states: 1 } };
  assert.throws(() => exportOracle("attempts", model, {}), /budget/);
});

test("invalid bounds, invariant failures and byte overflow cannot produce an oracle", () => {
  for (const states of [0, 100001])
    assert.throws(
      () =>
        exportOracle(
          "attempts",
          {
            ...attempts,
            bounds: { ...attempts.bounds, states },
          },
          {},
        ),
      /budget/,
    );
  assert.throws(
    () =>
      exportOracle(
        "attempts",
        {
          ...attempts,
          step: (state, action) => attempts.step(state, action, "reacquire-retired"),
        },
        {},
      ),
    /irreversible-retirement/,
  );
  assert.throws(
    () =>
      exportOracle(
        "attempts",
        {
          ...attempts,
          initial: () => "x".repeat((16 << 20) + 1),
          actions: () => [],
        },
        {},
      ),
    /byte budget/,
  );
});
