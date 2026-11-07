import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import canonicalize from "canonicalize";
import { Schema } from "effect";
import { checkStateTrace, StateOracle } from "../dist/state-oracle.js";
import * as attempts from "../models/attempts/model.mjs";
import * as release from "../models/release/model.mjs";
import { sha256 } from "./provenance.mjs";

export function exportOracle(name, model, sources) {
  assert.ok(
    Number.isInteger(model.bounds.states) &&
      model.bounds.states > 0 &&
      model.bounds.states <= 100000,
    "invalid oracle state budget",
  );
  const nodes = [{ state: model.initial(), edges: [] }];
  const seen = new Map([[canonicalize(nodes[0].state), 0]]);
  const actionNames = new Set(),
    outcomeNames = new Set();
  for (let at = 0; at < nodes.length; at++) {
    for (const action of model.actions(nodes[at].state)) {
      const next = model.step(nodes[at].state, action);
      assert.equal(model.violation(nodes[at].state, action, next.state), null);
      const key = canonicalize(next.state);
      if (!seen.has(key)) {
        assert.ok(nodes.length < model.bounds.states, "oracle state budget exceeded");
        seen.set(key, nodes.length);
        nodes.push({ state: next.state, edges: [] });
      }
      actionNames.add(action);
      outcomeNames.add(next.outcome);
      nodes[at].edges.push([action, next.outcome, seen.get(key)]);
    }
  }
  const actions = [...actionNames].sort(),
    outcomes = [...outcomeNames].sort();
  for (const node of nodes)
    node.edges = node.edges.map(([a, o, to]) => [actions.indexOf(a), outcomes.indexOf(o), to]);
  const oracle = {
    format: "kryvola-state-oracle-v1",
    purpose: "BOUNDED_MODEL_TEST_ONLY",
    model: name,
    source_sha256: sources,
    bounds: model.bounds,
    initial: 0,
    actions,
    outcomes,
    nodes,
  };
  Schema.decodeUnknownSync(StateOracle, { onExcessProperty: "error" })(oracle);
  const bytes = `${JSON.stringify(oracle)}\n`;
  assert.ok(Buffer.byteLength(bytes) <= 16 * 1024 * 1024, "oracle byte budget exceeded");
  return oracle;
}

export function oracleFiles() {
  return new Map(
    Object.entries({ attempts, release }).flatMap(([name, model]) => {
      const paths = [
        "models/attempts/model.mjs",
        ...(name === "release" ? ["models/release/model.mjs"] : []),
        "tools/state-oracle.mjs",
        "src/state-oracle.ts",
      ];
      const sources = Object.fromEntries(
        paths.map((path) => [path, sha256(readFileSync(new URL(`../${path}`, import.meta.url)))]),
      );
      const raw = `${JSON.stringify(exportOracle(name, model, sources))}\n`;
      const fixtures = JSON.parse(
        readFileSync(new URL(`../fixtures/state/${name}.json`, import.meta.url)),
      );
      const traces = fixtures.traces.map((fixture) => {
        let state = model.initial();
        const steps = (fixture.actions ?? fixture.steps.map(([action]) => action)).map((action) => {
          const next = model.step(state, action);
          state = next.state;
          return { action, outcome: next.outcome, state };
        });
        return { format: "kryvola-state-trace-v1", model: name, oracle_sha256: sha256(raw), steps };
      });
      return [
        [`state/v1/${name}.oracle.json`, raw],
        [`state/v1/${name}.traces.json`, `${JSON.stringify(traces, null, 2)}\n`],
      ];
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [path, expected] of oracleFiles()) {
    const raw = readFileSync(new URL(`../generated/${path}`, import.meta.url), "utf8");
    assert.equal(raw, expected, `stale ${path}; run pnpm generate`);
    if (!path.endsWith(".oracle.json")) continue;
    const name = JSON.parse(raw).model;
    const traces = JSON.parse(
      readFileSync(new URL(`../generated/state/v1/${name}.traces.json`, import.meta.url)),
    );
    for (const trace of traces) checkStateTrace(raw, trace);
    console.log(
      `Oracle ${name}: ${JSON.parse(raw).nodes.length} states; ${traces.length} traces verified.`,
    );
  }
}
