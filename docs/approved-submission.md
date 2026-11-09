# Approved encrypted submission

Every submission route requires workload mTLS and an independently provisioned
owner submission bearer in the Authorization header. Bind the bearer to the
verified workload, tenant, action and exact target. Reuse within its validity
is allowed only for the same target. The runtime verifies authority for the
owner and tenant independently of caller-supplied references. Execution,
compute, evidence and consumer grants cannot authorize submission. The
existing coordinator operation route does not accept owner submission grants.

## Register the key context and upload inputs

`POST /v1/key-contexts` registers canonical v1 public key-context metadata
and returns the exact `KeyContextRef`. The unpadded base64url field is limited
to 16 KiB decoded. Verify the canonical bytes and digest, tenant, key context
ID and key epoch against the reference, and the owner identity against
current policy. The immutable version is scoped to the tenant and key
context ID. The same reference and bytes replay. Changing bytes under a
recorded version conflicts. Registration conveys no independent proof of
key ownership.

`POST /v1/input-uploads` reserves a private upload for a registered context,
manifest digest, artifact kind and byte length. Reservation identity is the
tenant, authorized workload, registered context and idempotency key. An
identical retry returns the same upload ID and status 201. Changed intent
conflicts. The operation and its dispatch attempt do not have to exist.

Stage the parts and canonical v2 manifest through
`PUT /v1/input-uploads/{upload_id}/parts/{part_index}` and
`PUT /v1/input-uploads/{upload_id}/manifest`. Use complete binary bodies
with Content-Length. Parts are at most 4 MiB and use canonical decimal
indexes 0–1023. The manifest is at most 64 KiB. The grant binds the exact
upload and, for a part, its index. Identical writes replay and changed
writes conflict. Upload IDs and digests do not authorize access. No query
parameters, ranges, or direct object-store URLs are supported.

`POST /v1/input-uploads/{upload_id}/finalize` checks the reserved tenant,
context, manifest digest, kind and size, every indexed part and the full
blob commitment. For an evaluation key, the full blob digest must match
the registered context's evaluation-key commitment. Publish only verified,
immutable data. Identical finalization retries return the recorded digest.
Staging and unpinned inputs are eligible for existing bounded reclamation.

## Record approval and admit the operation

`POST /v1/compute-approvals` registers immutable reviewed canonical v2 plan
bytes, consent, a canonical v3 approval and its signature envelope as
unpadded base64url. Decoded limits are 32 KiB for the plan, 8 KiB each for
consent and approval, and 2 KiB for the envelope. The complete JSON body
remains subject to the 64 KiB control limit. This metadata registration
accepts no artifact bytes, private keys or transport credentials.

Verify the plan and consent commitments, trusted owner signature and
half-open validity interval, and current approval revocation and policy.
Require a plan-subject approval with purpose `COMPUTE` and the exact
plan, key context, consent, model, program and policy commitments. Reject
unsupported assurance. The supported baseline is FHE-Q1 confidentiality-only
with unproven computation integrity and no required evidence. An identical
registration returns the approval digest. An immutable plan reference cannot
be rebound. Approval registration does not enqueue work.

`POST /v1/operations/admit` carries operation metadata and immutable
references only. The approval digest identifies the registered signed
approval. Revalidate current owner authority, approval expiry and
revocation, and match the operation's tenant, logical job, operation ID,
workflow epoch, disclosure recipient, stage and index, policy and exact plan
and key-context references. The approved plan's ordered input manifest
digests must equal the submitted ciphertext list. Require the exact
verified evaluation-key manifest for the registered context, separate from
the ciphertext list. Reject duplicate inputs. All inputs must be finalized,
eligible for use by the authenticated submitter, and bound to the same
tenant and context. Record the evaluation-key digest first, followed by
the approved ciphertext digests, in the workflow's immutable input list.

Commit the operation, exact approval and input bindings, input pins and
operation-created notification atomically. Serialize admission with approval
revocation and artifact reclamation. Retry a lost response with the same
operation ID, idempotency key and immutable bindings. An identical authorized
retry returns the recorded operation without enqueueing again. Changed
intent returns `409 IDEMPOTENCY_CONFLICT`. Rate or quota limits return
`429 QUOTA_EXCEEDED` without requiring a new identity. Missing or mismatched
authority returns `403 FORBIDDEN`. Unavailable authority returns
`503 UNAVAILABLE` without admitting new work.
