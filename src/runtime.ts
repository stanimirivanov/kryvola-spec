import { Schema } from "effect";
import { Attempt, Operation, PublicResultStatus, Uint64Decimal } from "./control.js";
import { LIMITS } from "./index.js";
import { assertControlBytes } from "./transport.js";

const version = { schema_version: Operation.fields.schema_version };
const Id = Operation.fields.operation_id;
const Digest = Operation.fields.policy_digest;
const upload = { ...version, tenant_scope: Operation.fields.tenant_scope };
const operation = { ...upload, operation_id: Id };

const CancellationPending = Schema.Struct({
  ...version,
  outcome: Schema.Literal("CANCELLATION_PENDING"),
});
const Cancelled = Schema.Struct({
  ...version,
  outcome: Schema.Literal("CANCELLED"),
  fence: Uint64Decimal,
});

export const RUNTIME_SCHEMAS = Object.freeze({
  CreateUploadRequest: Schema.Struct({
    ...upload,
    byte_length: Schema.Int.check(
      Schema.isBetween({ minimum: 1, maximum: Number(LIMITS.artifact_max_bytes) }),
    ),
  }),
  CreateUploadResponse: Schema.Struct({ ...version, upload_id: Id }),
  FinalizeUploadRequest: Schema.Struct({ ...upload, manifest_digest: Digest }),
  FinalizeUploadResponse: Schema.Struct({ ...version, manifest_digest: Digest }),
  CreateOperationRequest: Schema.Struct({
    ...version,
    operation: Operation,
    input_manifest_digests: Schema.Array(Digest).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
  }),
  OperationResponse: Schema.Struct({
    ...version,
    operation: Operation,
    public_status: Schema.NullOr(PublicResultStatus),
  }),
  EnsureAttemptRequest: Schema.Struct({
    ...version,
    attempt: Schema.Struct({
      ...operation,
      workflow_epoch: Uint64Decimal,
      attempt_epoch: Uint64Decimal,
    }),
  }),
  EnsureAttemptResponse: Schema.Struct({
    ...version,
    attempt: Attempt,
    lease_expires_unix_ms: Uint64Decimal,
  }),
  SelectResultRequest: Schema.Struct({
    ...version,
    attempt: Attempt,
    execution_id: Id,
    output_manifest_digest: Digest,
  }),
  SelectResultResponse: Schema.Struct({
    ...version,
    outcome: Schema.Literal("COMPUTE_SELECTED"),
    execution_id: Id,
    output_manifest_digest: Digest,
  }),
  CancelOperationRequest: Schema.Struct({
    ...operation,
    idempotency_key: Operation.fields.idempotency_key,
  }),
  CancellationPending,
  Cancelled,
  CancelOperationResponse: Schema.Union([CancellationPending, Cancelled]),
  AuthorizeArtifactRequest: Schema.Struct({
    ...version,
    attempt: Attempt,
    manifest_digest: Digest,
    purpose: Schema.Literals(["COMPUTE_READ", "COMPUTE_WRITE", "EVIDENCE_READ"]),
  }),
  AuthorizeArtifactResponse: Schema.Struct({
    ...version,
    expires_unix_ms: Uint64Decimal,
  }),
  RuntimeError: Schema.Struct({
    ...version,
    code: Schema.Literals([
      "INVALID_REQUEST",
      "FORBIDDEN",
      "NOT_FOUND",
      "PAYLOAD_TOO_LARGE",
      "QUOTA_EXCEEDED",
      "ATTEMPT_EXPIRED",
      "STALE_FENCE",
      "IDEMPOTENCY_CONFLICT",
      "UNAVAILABLE",
    ]),
  }),
});

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
