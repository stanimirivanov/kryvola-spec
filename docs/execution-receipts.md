# Signed execution receipt persistence

The Engine worker submits a signed provenance receipt after finalizing the output
for a registered physical execution. It calls `POST /v1/executions/receipt` over
workload mTLS with the exact attempt, execution ID, and finalized output upload ID.
The upload ID selects a particular immutable upload even when two physical
executions produce the same manifest digest. Fabric binds an upload to at most
one execution receipt. The signed output digest must match that upload's manifest.

The JSON request carries the exact canonical v3 receipt and canonical v3
signature envelope as unpadded base64url. Decode each field and require that
re-encoding reproduces the original string. The decoded limits are 32,768 bytes
for the receipt and 2,048 for the envelope. The complete control body retains
the 65,536-byte runtime limit. The signature envelope uses the existing v3
`receipt` signing preimage and Ed25519 verification. The success response
returns the canonical v3 receipt commitment as `receipt_digest` after commit.

## Authorization and binding

Fabric authorizes `EXECUTION_RECEIPT_WRITE` separately for the verified workload,
tenant and exact execution. Artifact grants and execution registration authority
do not authorize this write. Resolve the envelope's signer, key ID and key epoch
through trusted deployment policy for that workload and tenant. Reject
unrecognized, expired or revoked signing authority, signer disagreement between
receipt and envelope, or a signature that fails verification. Requests carry
neither verification keys nor trust configuration.

Compare the receipt's tenant, logical job, operation, stage, plan, policy and
key-context fields with authoritative operation metadata. Compare its workflow
epoch, attempt epoch and fence with the exact current live attempt, and its
execution ID with the execution registered to that attempt. The receipt's input
manifest digests must be a nonempty duplicate-free subset of the operation's
approved inputs. Require exactly one output manifest digest and require the
finalized, unreclaimed ciphertext upload to belong to the same workload, tenant,
attempt and key context. The remaining signed metadata describes what the
signer claims about execution. A valid signature establishes provenance. This
route grants no result selection, release or artifact read authority, and
provides no computation integrity proof.

## Commit and retry

Serialize the live-attempt check, including cancellation and recovery barriers,
with the durable write. Protect the finalized upload from reclamation during
the check and commit. Persist the exact canonical receipt and signature bytes,
the commitment, and the execution and upload binding atomically. A repeated
authorized submission of the same bytes and binding returns the same digest
while the attempt remains live. A different receipt, signature or upload for
the same execution, or a second execution claiming the same upload, returns
`IDEMPOTENCY_CONFLICT`. A committed barrier prevents further writes and
successful retries against the old attempt.

Malformed controls, encodings or canonical objects return `INVALID_REQUEST`.
Oversized control bodies return `PAYLOAD_TOO_LARGE`. Authorization, signature
or context mismatch returns `FORBIDDEN`. After scope authorization, a missing
registered execution or finalized upload returns `NOT_FOUND`. Expired and
stale attempts use the existing conflict codes. Dependency failures return
`UNAVAILABLE` without acknowledging durable success. Error bodies and logs
exclude receipt bytes, signature bytes and credentials.
