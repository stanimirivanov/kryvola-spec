/** Test-only finite graph contracts; never a runtime authorization decision. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import canonicalize from "canonicalize";
import { Schema } from "effect";

const Index = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100000 }));
const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128));
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/u));
const Model = Schema.Literals(["attempts", "release"]);
const list = <S extends Schema.Top>(schema: S, maximum: number) =>
  Schema.Array(schema).check(Schema.isMaxLength(maximum));
export const StateOracle = Schema.Struct({
  format: Schema.Literal("kryvola-state-oracle-v1"),
  purpose: Schema.Literal("BOUNDED_MODEL_TEST_ONLY"),
  model: Model,
  source_sha256: Schema.Record(Name, Digest),
  bounds: Schema.Record(Name, Index),
  initial: Schema.Literal(0),
  actions: list(Name, 256),
  outcomes: list(Name, 256),
  nodes: list(
    Schema.Struct({ state: Schema.Json, edges: list(Schema.Tuple([Index, Index, Index]), 256) }),
    100000,
  ),
});
export const StateTrace = Schema.Struct({
  format: Schema.Literal("kryvola-state-trace-v1"),
  model: Model,
  oracle_sha256: Digest,
  steps: list(Schema.Struct({ action: Name, outcome: Name, state: Schema.Json }), 10000).check(
    Schema.isMinLength(1),
  ),
});

/** The caller must authenticate/pin oracle bytes first; a matching hash is not trust. */
export function checkStateTrace(oracleBytes: string, observed: unknown): void {
  if (new TextEncoder().encode(oracleBytes).length > 16 * 1024 * 1024)
    throw new Error("oracle budget");
  const strict = { onExcessProperty: "error" } as const;
  const oracle = Schema.decodeUnknownSync(StateOracle, strict)(JSON.parse(oracleBytes));
  const trace = Schema.decodeUnknownSync(StateTrace, strict)(observed);
  if (
    trace.model !== oracle.model ||
    trace.oracle_sha256 !== bytesToHex(sha256(new TextEncoder().encode(oracleBytes)))
  )
    throw new Error("oracle binding mismatch");
  if (!oracle.nodes.length || oracle.nodes.length > (oracle.bounds.states ?? 0))
    throw new Error("incomplete oracle");
  let at: number = oracle.initial;
  for (const event of trace.steps) {
    const node = oracle.nodes[at];
    const edges = node?.edges.filter(([action]) => oracle.actions[action] === event.action);
    if (edges?.length !== 1) throw new Error("unknown or ambiguous transition");
    const edge = edges[0];
    if (
      !edge ||
      oracle.outcomes[edge[1]] !== event.outcome ||
      !oracle.nodes[edge[2]] ||
      canonicalize(oracle.nodes[edge[2]]?.state) !== canonicalize(event.state)
    )
      throw new Error("trace outcome/state mismatch");
    at = edge[2];
  }
}
