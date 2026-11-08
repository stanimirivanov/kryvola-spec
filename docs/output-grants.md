# Scoped output grant issuance

The Engine computes an output manifest commitment after evaluation. It asks
Fabric for a grant with `POST /v1/executions/output-grants` and the exact v1
attempt, execution ID, manifest digest and action. The Engine uses the existing
upload routes with `Authorization: Bearer <grant>`:

| Action         | Route                                            | Additional target fields       |
| -------------- | ------------------------------------------------ | ------------------------------ |
| `RESERVE`      | `POST /v1/uploads`                               | None                           |
| `PUT_PART`     | `PUT /v1/uploads/{upload_id}/parts/{part_index}` | Upload ID and zero-based index |
| `PUT_MANIFEST` | `PUT /v1/uploads/{upload_id}/manifest`           | Upload ID                      |
| `FINALIZE`     | `POST /v1/uploads/{upload_id}/finalize`          | Upload ID                      |
| `ABORT`        | `POST /v1/uploads/{upload_id}/abort`             | Upload ID                      |

## Authority and scope

Issuance requires verified workload mTLS and a separate operator-provisioned
`EXECUTION_OUTPUT_GRANT` bearer capability for that workload, tenant,
operation, workflow epoch, attempt epoch, fence and registered execution ID.
The capability may be reused while live. Registry, receipt, and artifact
capabilities do not authorize issuance. A caller cannot delegate issuance.
Issuance checks the exact registered execution and current live attempt,
including committed cancellation and recovery barriers and result selection.
For non-reservation actions, require the upload previously reserved by this
workload for this execution, attempt and digest.

A successful response carries a fresh cryptographically random 32-byte token
as 64 lowercase hexadecimal characters in `Kryvola-Output-Grant`, and includes
`Cache-Control: no-store`. The JSON body contains only the version and expiry.
Expiry is no later than 60 seconds from issuance or the earliest issuance
capability, workload identity, operation or attempt deadline. A grant is
single-use and only authorizes its exact workload, execution, attempt,
manifest digest and upload action, including any upload ID and part index.
Bind grants to the current runtime boot. Check live authority at redemption
and enforce the operation fence when committing the upload mutation.
Revoked issuance authority invalidates outstanding grants. Issuance and
redemption fail closed on dependency, clock or capacity failure.

## Output binding and retries

The first successful reservation durably binds the execution to its exact
workload, manifest digest, reserved byte length and upload ID. A retry with
a fresh grant and identical reservation returns the same upload ID without
another quota charge. A changed digest or size conflicts. An aborted or
reclaimed upload cannot be replaced for the same execution. Different
executions reserve distinct uploads even when the digest is identical.

Repeat issuance after a lost response or a consumed grant. It yields a fresh
token only while the exact authority and fence remain live. Unused grants
expire and are subject to a bounded outstanding-grant limit. Upload mutations
use the existing upload contracts. Only matching scoped output grants can
mutate an upload created through this route. Receipt persistence for such an
upload must match its bound execution. Existing operator-provisioned grants
retain their existing upload behavior for other uploads.

This route issues only `COMPUTE_WRITE` upload authority. Input reads, receipt
submission, result selection and release remain separate. Bearers are
transport credentials and must not appear in JSON, URLs, logs, traces or
workflow history. Return a bounded error without the grant header on failure.
Use `INVALID_REQUEST` for malformed controls, `PAYLOAD_TOO_LARGE` for oversize
bodies, `FORBIDDEN` for authority or scope mismatch, `NOT_FOUND` for a missing
execution or upload after scope authorization, the existing fence/expiry
conflicts for closed attempts, `IDEMPOTENCY_CONFLICT` for a changed binding,
`QUOTA_EXCEEDED` when issuance capacity is exhausted, and `UNAVAILABLE` for
dependency failures.
