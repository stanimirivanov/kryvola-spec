// Generated from openapi/runtime.schemas.json; run pnpm generate. Do not edit.
import { Schema } from "effect";
import { Attempt, Operation, PublicResultStatus } from "./control.js";
import { assertControlBytes } from "./transport.js";
const CreateUploadRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "tenant_scope": Operation.fields.tenant_scope, "byte_length": Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1073741824 }))});
const CreateUploadResponse = Schema.Struct({"schema_version": Operation.fields.schema_version, "upload_id": Operation.fields.operation_id});
const FinalizeUploadRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "tenant_scope": Operation.fields.tenant_scope, "manifest_digest": Operation.fields.policy_digest});
const FinalizeUploadResponse = Schema.Struct({"schema_version": Operation.fields.schema_version, "manifest_digest": Operation.fields.policy_digest});
const CreateOperationRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "operation": Operation, "input_manifest_digests": Schema.Array(Operation.fields.policy_digest).check(Schema.isMinLength(1), Schema.isMaxLength(128))});
const OperationResponse = Schema.Struct({"schema_version": Operation.fields.schema_version, "operation": Operation, "public_status": Schema.Union([PublicResultStatus, Schema.Null])});
const EnsureAttemptRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "attempt": Schema.Struct({"schema_version": Operation.fields.schema_version, "tenant_scope": Operation.fields.tenant_scope, "operation_id": Operation.fields.operation_id, "workflow_epoch": Attempt.fields.workflow_epoch, "attempt_epoch": Attempt.fields.attempt_epoch})});
const EnsureAttemptResponse = Schema.Struct({"schema_version": Operation.fields.schema_version, "attempt": Attempt, "lease_expires_unix_ms": Operation.fields.deadline_unix_ms});
const SelectResultRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "attempt": Attempt, "execution_id": Operation.fields.operation_id, "output_manifest_digest": Operation.fields.policy_digest});
const SelectResultResponse = Schema.Struct({"schema_version": Operation.fields.schema_version, "outcome": Schema.Literal("COMPUTE_SELECTED"), "execution_id": Operation.fields.operation_id, "output_manifest_digest": Operation.fields.policy_digest});
const CancelOperationRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "tenant_scope": Operation.fields.tenant_scope, "operation_id": Operation.fields.operation_id, "idempotency_key": Operation.fields.idempotency_key});
const CancellationPending = Schema.Struct({"schema_version": Operation.fields.schema_version, "outcome": Schema.Literal("CANCELLATION_PENDING")});
const Cancelled = Schema.Struct({"schema_version": Operation.fields.schema_version, "outcome": Schema.Literal("CANCELLED"), "fence": Attempt.fields.fence});
const CancelOperationResponse = Schema.Union([CancellationPending, Cancelled]);
const AuthorizeArtifactRequest = Schema.Struct({"schema_version": Operation.fields.schema_version, "attempt": Attempt, "manifest_digest": Operation.fields.policy_digest, "purpose": Schema.Literals(["COMPUTE_READ","COMPUTE_WRITE","EVIDENCE_READ"])});
const AuthorizeArtifactResponse = Schema.Struct({"schema_version": Operation.fields.schema_version, "expires_unix_ms": Operation.fields.deadline_unix_ms});
const RuntimeError = Schema.Struct({"schema_version": Operation.fields.schema_version, "code": Schema.Literals(["INVALID_REQUEST","FORBIDDEN","NOT_FOUND","PAYLOAD_TOO_LARGE","QUOTA_EXCEEDED","ATTEMPT_EXPIRED","STALE_FENCE","IDEMPOTENCY_CONFLICT","UNAVAILABLE"])});
export const RUNTIME_SCHEMAS = Object.freeze({CreateUploadRequest, CreateUploadResponse, FinalizeUploadRequest, FinalizeUploadResponse, CreateOperationRequest, OperationResponse, EnsureAttemptRequest, EnsureAttemptResponse, SelectResultRequest, SelectResultResponse, CancelOperationRequest, CancellationPending, Cancelled, CancelOperationResponse, AuthorizeArtifactRequest, AuthorizeArtifactResponse, RuntimeError});
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Decode a complete UTF-8 runtime JSON body. Authorization is a service responsibility. */
export function decodeRuntime<K extends keyof typeof RUNTIME_SCHEMAS>(
  name: K,
  bytes: Uint8Array,
): (typeof RUNTIME_SCHEMAS)[K]["Type"] {
  assertControlBytes(bytes);
  const input: unknown = JSON.parse(utf8.decode(bytes));
  return Schema.decodeUnknownSync(RUNTIME_SCHEMAS[name])(input, { onExcessProperty: "error" });
}
