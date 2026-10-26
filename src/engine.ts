import { Schema } from "effect";
import { CANONICAL_V2_SCHEMAS, commitment, decodeCanonical } from "./canonical.js";
import {
  Attempt,
  checkExecutionContext,
  controlFixtures,
  Execution,
  Operation,
  Uint64Decimal,
} from "./control.js";
import { FheQ1Arithmetic, FheQ1Operator } from "./fhe-q1.js";
import { ArtifactRef, artifactRefFixture, decodeArtifactRef } from "./index.js";

const Version = Operation.fields.schema_version;
const Id = Operation.fields.operation_id;
const Digest = Operation.fields.policy_digest;
const list = <S extends Schema.Constraint>(schema: S, min: number, max: number) =>
  Schema.Array(schema).check(Schema.isMinLength(min), Schema.isMaxLength(max));
const Operators = FheQ1Operator;
export const Capabilities = Schema.Struct({
  schema_version: Version,
  engine_digest: Digest,
  parameter_set_digest: Digest,
  security_profiles: list(Schema.Literal("FHE-Q1"), 1, 1),
  program_digests: list(Digest, 1, 32),
  operators: list(Operators, 1, 2),
  arithmetic: FheQ1Arithmetic,
  max_parallel_executions: Uint64Decimal,
});
export const GetCapabilitiesRequest = Schema.Struct({ schema_version: Version });
export const GetCapabilitiesResponse = Schema.Struct({
  schema_version: Version,
  capabilities: Capabilities,
});
export const ExecuteRequest = Schema.Struct({
  schema_version: Version,
  operation: Operation,
  execution: Execution,
  engine_digest: Digest,
  parameter_set_digest: Digest,
  program_digest: Digest,
  security_profile: Id,
  required_operators: list(Operators, 1, 2),
  input_refs: list(ArtifactRef, 1, 128),
  output_contract_digest: Digest,
  resource_profile_digest: Digest,
});
export const ExecuteResponse = Schema.Struct({ schema_version: Version, execution: Execution });
const target = { schema_version: Version, attempt: Attempt, execution_id: Id };
export const GetExecutionStatusRequest = Schema.Struct(target);
export const EngineErrorCode = Schema.Literals([
  "NONE",
  "INVALID_REQUEST",
  "UNSUPPORTED_PROFILE",
  "DEADLINE_EXCEEDED",
  "CANCELLED",
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "INTERNAL",
]);
export const GetExecutionStatusResponse = Schema.Struct({
  schema_version: Version,
  execution: Execution,
  output_refs: list(ArtifactRef, 0, 128),
  error_code: EngineErrorCode,
});
export const CancelExecutionRequest = Schema.Struct({ ...target, cancellation_id: Id });
export const CancelExecutionResponse = Schema.Struct({
  ...target,
  cancellation_id: Id,
  cancellation_state: Schema.Literals(["REQUESTED", "OBSERVED_STOPPED", "NOT_FOUND"]),
});
export const ExecutionObservedEvent = Schema.Struct({
  schema_version: Version,
  event_id: Id,
  causation_id: Id,
  aggregate_sequence: Uint64Decimal,
  event_type: Schema.Literal("EXECUTION_OBSERVED"),
  operation: Operation,
  observation: GetExecutionStatusResponse,
});
export const ENGINE_SCHEMAS = Object.freeze({
  Capabilities,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  ExecuteRequest,
  ExecuteResponse,
  GetExecutionStatusRequest,
  GetExecutionStatusResponse,
  CancelExecutionRequest,
  CancelExecutionResponse,
  ExecutionObservedEvent,
});
export const ENGINE_METHODS = Object.freeze([
  "GetCapabilities",
  "Execute",
  "GetExecutionStatus",
  "CancelExecution",
] as const);
export const ENGINE_FIELD_NUMBERS = Object.freeze({
  Capabilities: Object.freeze({
    schema_version: 1,
    engine_digest: 2,
    parameter_set_digest: 3,
    security_profiles: 4,
    program_digests: 5,
    operators: 6,
    arithmetic: 7,
    max_parallel_executions: 8,
  } as const),
  GetCapabilitiesRequest: Object.freeze({ schema_version: 1 } as const),
  GetCapabilitiesResponse: Object.freeze({ schema_version: 1, capabilities: 2 } as const),
  ExecuteRequest: Object.freeze({
    schema_version: 1,
    operation: 2,
    execution: 3,
    engine_digest: 4,
    parameter_set_digest: 5,
    program_digest: 6,
    security_profile: 7,
    required_operators: 8,
    input_refs: 9,
    output_contract_digest: 10,
    resource_profile_digest: 11,
  } as const),
  ExecuteResponse: Object.freeze({ schema_version: 1, execution: 2 } as const),
  GetExecutionStatusRequest: Object.freeze({
    schema_version: 1,
    attempt: 2,
    execution_id: 3,
  } as const),
  GetExecutionStatusResponse: Object.freeze({
    schema_version: 1,
    execution: 2,
    output_refs: 3,
    error_code: 4,
  } as const),
  CancelExecutionRequest: Object.freeze({
    schema_version: 1,
    attempt: 2,
    execution_id: 3,
    cancellation_id: 4,
  } as const),
  CancelExecutionResponse: Object.freeze({
    schema_version: 1,
    attempt: 2,
    execution_id: 3,
    cancellation_id: 4,
    cancellation_state: 5,
  } as const),
  ExecutionObservedEvent: Object.freeze({
    schema_version: 1,
    event_id: 2,
    causation_id: 3,
    aggregate_sequence: 4,
    event_type: 5,
    operation: 6,
    observation: 7,
  } as const),
} as const);
const strict = { onExcessProperty: "error" } as const;

/** Reference negotiation only: advertisements are not authenticated qualification or grants. */
export function validateExecuteRequest(input: unknown, advertised: unknown, nowUnixMs: string) {
  const request = Schema.decodeUnknownSync(ExecuteRequest, strict)(input);
  const caps = Schema.decodeUnknownSync(Capabilities, strict)(advertised);
  const now = Schema.decodeUnknownSync(Uint64Decimal)(nowUnixMs);
  checkExecutionContext(request.operation, request.execution);
  if (request.execution.physical_state !== "CREATED")
    throw new Error("Execute requires CREATED intent");
  if (request.execution.session_epoch !== "0") throw new Error("Unsupported interactive session");
  if (BigInt(request.operation.deadline_unix_ms) <= BigInt(now))
    throw new Error("DEADLINE_EXCEEDED");
  if (!caps.security_profiles.some((profile) => profile === request.security_profile))
    throw new Error("UNSUPPORTED_PROFILE");
  if (
    request.engine_digest !== caps.engine_digest ||
    request.parameter_set_digest !== caps.parameter_set_digest ||
    !caps.program_digests.includes(request.program_digest) ||
    request.required_operators.some((op) => !caps.operators.includes(op))
  ) {
    throw new Error("Unsupported engine, parameters, program or operators");
  }
  if (BigInt(caps.max_parallel_executions) === 0n) throw new Error("UNAVAILABLE");
  for (const ref of request.input_refs) {
    decodeArtifactRef(ref);
    if (ref.tenant_scope !== request.operation.tenant_scope)
      throw new Error("Input tenant mismatch");
  }
  return request;
}

/** validatePlannedExecuteRequest correlates an explicitly selected v2 plan with Engine intent.
 * Throws on format/context/support mismatches; does not authenticate the plan or grant execution.
 */
export function validatePlannedExecuteRequest(
  planBytes: Uint8Array,
  input: unknown,
  advertised: unknown,
  nowUnixMs: string,
) {
  const plan = Schema.decodeUnknownSync(
    CANONICAL_V2_SCHEMAS.plan,
    strict,
  )(decodeCanonical("plan", planBytes, "2"));
  const request = validateExecuteRequest(input, advertised, nowUnixMs);
  if (
    plan.tenant_scope !== request.operation.tenant_scope ||
    commitment("plan", plan, "2") !== request.operation.plan_ref.plan_digest ||
    plan.key_context_digest !== request.operation.key_context_ref.key_context_digest ||
    plan.engine_digest !== request.engine_digest ||
    plan.parameters.parameter_set_digest !== request.parameter_set_digest ||
    plan.program_digest !== request.program_digest ||
    plan.security_profile !== request.security_profile ||
    plan.output_contract_digest !== request.output_contract_digest ||
    plan.resource_profile_digest !== request.resource_profile_digest
  )
    throw new Error("Plan/Engine context mismatch");
  if (
    plan.operators.length !== request.required_operators.length ||
    plan.operators.some((op) => !request.required_operators.includes(op))
  )
    throw new Error("Plan/Engine operator mismatch");
  if (
    plan.input_manifest_digests.length !== request.input_refs.length ||
    plan.input_manifest_digests.some(
      (digest, i) => digest !== request.input_refs[i]?.manifest_digest,
    )
  )
    throw new Error("Plan/Engine input order mismatch");
  return request;
}

export function decodeExecutionObservation(input: unknown) {
  const observation = Schema.decodeUnknownSync(GetExecutionStatusResponse, strict)(input);
  const state = observation.execution.physical_state;
  if (
    (state === "FAILED" || state === "CANCELLED" || state === "EXPIRED") ===
    (observation.error_code === "NONE")
  ) {
    throw new Error("Contradictory physical state/error");
  }
  if (state !== "SUCCEEDED" && observation.output_refs.length > 0)
    throw new Error("Only succeeded executions have candidates");
  if (state === "SUCCEEDED" && observation.output_refs.length === 0)
    throw new Error("Missing output candidate");
  for (const ref of observation.output_refs) {
    decodeArtifactRef(ref);
    if (ref.tenant_scope !== observation.execution.attempt.tenant_scope)
      throw new Error("Output tenant mismatch");
  }
  return observation;
}

export function decodeExecutionEvent(input: unknown) {
  const event = Schema.decodeUnknownSync(ExecutionObservedEvent, strict)(input);
  decodeExecutionObservation(event.observation);
  checkExecutionContext(event.operation, event.observation.execution);
  return event;
}

const capabilities: typeof Capabilities.Type = {
  schema_version: "1",
  engine_digest: "e".repeat(64),
  parameter_set_digest: "f".repeat(64),
  security_profiles: ["FHE-Q1"],
  program_digests: ["1".repeat(64)],
  operators: ["ADD", "MUL"],
  arithmetic: "EXACT_MODULAR",
  max_parallel_executions: "1",
};
const execute: typeof ExecuteRequest.Type = {
  schema_version: "1",
  operation: controlFixtures.Operation,
  execution: controlFixtures.Execution,
  engine_digest: capabilities.engine_digest,
  parameter_set_digest: capabilities.parameter_set_digest,
  program_digest: capabilities.program_digests[0]!,
  security_profile: "FHE-Q1",
  required_operators: ["ADD"],
  input_refs: [artifactRefFixture],
  output_contract_digest: "2".repeat(64),
  resource_profile_digest: "3".repeat(64),
};
const observation: typeof GetExecutionStatusResponse.Type = {
  schema_version: "1",
  execution: { ...controlFixtures.Execution, physical_state: "SUCCEEDED" },
  output_refs: [{ ...artifactRefFixture, opaque_artifact_id: "output-candidate-1" }],
  error_code: "NONE",
};
export const engineFixtures = {
  capabilities,
  execute,
  observation,
  event: {
    schema_version: "1",
    event_id: "event-1",
    causation_id: "dispatch-1",
    aggregate_sequence: "1",
    event_type: "EXECUTION_OBSERVED",
    operation: controlFixtures.Operation,
    observation,
  } satisfies typeof ExecutionObservedEvent.Type,
};
