import { Schema } from "effect";

const Identifier = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}(?![\s\S])/u),
);
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/u));
// Lexical uint64 bound survives JSON Schema export without lossy JS numbers.
const maximum = "18446744073709551615";
const upperPrefixes = [...maximum].flatMap((digit, index) => {
  const lower = index === 0 ? 1 : 0;
  return Number(digit) > lower
    ? [`${maximum.slice(0, index)}[${lower}-${Number(digit) - 1}][0-9]{${19 - index}}`]
    : [];
});
export const Uint64Decimal = Schema.String.check(
  Schema.isPattern(
    new RegExp(`^(0|[1-9][0-9]{0,18}|${upperPrefixes.join("|")}|${maximum})(?![\\s\\S])`, "u"),
  ),
);
const Version = Schema.Literal("1");
export const PublicResultStatus = Schema.Literals([
  "COMPUTE_SELECTED",
  "EVIDENCE_PENDING",
  "EVIDENCE_VERIFIED",
  "RELEASED",
  "EVIDENCE_FAILED",
  "CANCELLED",
  "EXPIRED",
]);
export const PhysicalExecutionState = Schema.Literals([
  "CREATED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);
export const KeyContextRef = Schema.Struct({
  schema_version: Version,
  tenant_scope: Identifier,
  key_context_id: Identifier,
  immutable_version: Identifier,
  key_context_digest: Digest,
  key_epoch: Uint64Decimal,
});
export const PlanRef = Schema.Struct({
  schema_version: Version,
  tenant_scope: Identifier,
  plan_id: Identifier,
  immutable_version: Identifier,
  plan_digest: Digest,
});
export const DisclosureIdentity = Schema.Struct({
  schema_version: Version,
  tenant_scope: Identifier,
  logical_job_id: Identifier,
  output_stage: Identifier,
  recipient: Identifier,
  disclosure_index: Uint64Decimal,
});
/** Immutable intent; no public result exists until selection or a terminal verdict. */
export const Operation = Schema.Struct({
  schema_version: Version,
  tenant_scope: Identifier,
  logical_job_id: Identifier,
  operation_id: Identifier,
  workflow_epoch: Uint64Decimal,
  stage_id: Identifier,
  idempotency_key: Identifier,
  policy_digest: Digest,
  deadline_unix_ms: Uint64Decimal,
  plan_ref: PlanRef,
  key_context_ref: KeyContextRef,
  disclosure_identity: DisclosureIdentity,
});
export const Attempt = Schema.Struct({
  schema_version: Version,
  tenant_scope: Identifier,
  operation_id: Identifier,
  workflow_epoch: Uint64Decimal,
  attempt_epoch: Uint64Decimal,
  fence: Uint64Decimal,
});
export const Execution = Schema.Struct({
  schema_version: Version,
  attempt: Attempt,
  execution_id: Identifier,
  session_epoch: Uint64Decimal,
  deadline_unix_ms: Uint64Decimal,
  physical_state: PhysicalExecutionState,
});
export const CONTROL_SCHEMAS = Object.freeze({
  KeyContextRef,
  PlanRef,
  DisclosureIdentity,
  Operation,
  Attempt,
  Execution,
});
// Explicit tags, independent of schema declaration order. Never recycle retired tags.
export const CONTROL_FIELD_NUMBERS = Object.freeze({
  KeyContextRef: Object.freeze({
    schema_version: 1,
    tenant_scope: 2,
    key_context_id: 3,
    immutable_version: 4,
    key_context_digest: 5,
    key_epoch: 6,
  } as const),
  PlanRef: Object.freeze({
    schema_version: 1,
    tenant_scope: 2,
    plan_id: 3,
    immutable_version: 4,
    plan_digest: 5,
  } as const),
  DisclosureIdentity: Object.freeze({
    schema_version: 1,
    tenant_scope: 2,
    logical_job_id: 3,
    output_stage: 4,
    recipient: 5,
    disclosure_index: 6,
  } as const),
  Operation: Object.freeze({
    schema_version: 1,
    tenant_scope: 2,
    logical_job_id: 3,
    operation_id: 4,
    workflow_epoch: 5,
    stage_id: 6,
    idempotency_key: 7,
    policy_digest: 8,
    deadline_unix_ms: 9,
    plan_ref: 10,
    key_context_ref: 11,
    disclosure_identity: 12,
  } as const),
  Attempt: Object.freeze({
    schema_version: 1,
    tenant_scope: 2,
    operation_id: 3,
    workflow_epoch: 4,
    attempt_epoch: 5,
    fence: 6,
  } as const),
  Execution: Object.freeze({
    schema_version: 1,
    attempt: 2,
    execution_id: 3,
    session_epoch: 4,
    deadline_unix_ms: 5,
    physical_state: 6,
  } as const),
} as const);
const strict = { onExcessProperty: "error" } as const;
export const decodeKeyContextRef = Schema.decodeUnknownSync(KeyContextRef, strict);
export const decodePlanRef = Schema.decodeUnknownSync(PlanRef, strict);
export const decodeDisclosureIdentity = Schema.decodeUnknownSync(DisclosureIdentity, strict);
export const decodeAttempt = Schema.decodeUnknownSync(Attempt, strict);
export const decodeExecution = Schema.decodeUnknownSync(Execution, strict);
export function decodeOperation(input: unknown): typeof Operation.Type {
  const operation = Schema.decodeUnknownSync(Operation, strict)(input);
  for (const ref of [
    operation.plan_ref,
    operation.key_context_ref,
    operation.disclosure_identity,
  ]) {
    if (ref.tenant_scope !== operation.tenant_scope) throw new Error("Operation tenant mismatch");
  }
  if (operation.disclosure_identity.logical_job_id !== operation.logical_job_id) {
    throw new Error("Operation disclosure job mismatch");
  }
  return operation;
}

/** Structural correlation only, never a lease, selection or authorization decision. */
export function checkExecutionContext(
  operation: typeof Operation.Type,
  execution: typeof Execution.Type,
): void {
  const op = decodeOperation(operation);
  const run = decodeExecution(execution);
  for (const field of ["tenant_scope", "operation_id", "workflow_epoch"] as const) {
    if (op[field] !== run.attempt[field]) throw new Error(`Execution ${field} mismatch`);
  }
  if (op.deadline_unix_ms !== run.deadline_unix_ms) throw new Error("Execution deadline mismatch");
}

const tenant = "tenant-fixture";
const key: typeof KeyContextRef.Type = {
  schema_version: "1",
  tenant_scope: tenant,
  key_context_id: "key-context-1",
  immutable_version: "version-1",
  key_context_digest: "b".repeat(64),
  key_epoch: "0",
};
const plan: typeof PlanRef.Type = {
  schema_version: "1",
  tenant_scope: tenant,
  plan_id: "plan-1",
  immutable_version: "version-1",
  plan_digest: "c".repeat(64),
};
const disclosure: typeof DisclosureIdentity.Type = {
  schema_version: "1",
  tenant_scope: tenant,
  logical_job_id: "job-1",
  output_stage: "output",
  recipient: "owner-1",
  disclosure_index: "0",
};
const operation: typeof Operation.Type = {
  schema_version: "1",
  tenant_scope: tenant,
  logical_job_id: "job-1",
  operation_id: "operation-1",
  workflow_epoch: "0",
  stage_id: "output",
  idempotency_key: "admission-1",
  policy_digest: "d".repeat(64),
  deadline_unix_ms: "1793059200000",
  plan_ref: plan,
  key_context_ref: key,
  disclosure_identity: disclosure,
};
const attempt: typeof Attempt.Type = {
  schema_version: "1",
  tenant_scope: tenant,
  operation_id: operation.operation_id,
  workflow_epoch: "0",
  attempt_epoch: "0",
  fence: "1",
};
export const controlFixtures = {
  KeyContextRef: key,
  PlanRef: plan,
  DisclosureIdentity: disclosure,
  Operation: operation,
  Attempt: attempt,
  Execution: {
    schema_version: "1",
    attempt,
    execution_id: "execution-1",
    session_epoch: "0",
    deadline_unix_ms: operation.deadline_unix_ms,
    physical_state: "CREATED",
  } satisfies typeof Execution.Type,
};
