# Release-bound consumer reads

Use `POST /v1/released-outputs/manifest` to read the exact canonical v2
manifest or `POST /v1/released-outputs/parts/{part_index}` to read a complete
part. The part index is a canonical unsigned decimal path segment from
0 through 1023. Both routes take `ReadReleasedOutputRequest` with
`schema_version: "1"`, `tenant_scope`, `disclosure_id`, `recipient`, and
`output_manifest_digest`. The disclosure ID is the existing stable v3
commitment to the tenant, logical job, output stage, recipient and disclosure
index. Identifiers and digests carry no authority.

## Authorization

Each request requires a verified workload identity over mTLS and a fresh,
single-use `CONSUMER_READ` bearer in the Authorization header. The trusted
consumer-grant provisioner binds the credential to the workload identity,
tenant, recipient, disclosure ID, output manifest digest, expiration and
exact route target (manifest or one indexed part). The service must verify
that the workload is authorized for that recipient. Caller-supplied recipient
metadata alone proves nothing. No grant issuance route is defined here.
Compute and evidence credentials are ineligible for these routes. Consumer
credentials are ineligible for compute and evidence operations.

Before admitting each read, resolve the current authoritative release record
for the exact disclosure ID. Verify the tenant, recipient and digest against
that record and serve only its recorded immutable upload. Require the current
workflow and policy context, an open release validity window, and clear
cancellation, recovery and approval-revocation barriers. Evaluate these
predicates independently of the dispatch lease. A selected result or stale
grant cannot substitute for an eligible release. Serialize read admission
against competing authority changes. If authorization, identity or authority
becomes invalid or unavailable before returning the buffered response, return
an error without any artifact bytes.

Use `403 FORBIDDEN` for missing or ineligible release and identity, scope or
credential mismatch. This avoids revealing whether a digest or disclosure
exists to an unauthorized caller. Use `404 NOT_FOUND` only for an index absent
from an authorized manifest and `503 UNAVAILABLE` when release authority or
verified artifact bytes cannot be obtained. Return `400` for malformed
requests, query parameters and Range headers.

## Byte boundary

Return the complete, verified and uncompressed bytes as
`application/octet-stream` with an exact Content-Length and
`Cache-Control: no-store`. Manifest responses are limited to 65,536 bytes.
Part responses are limited to 4,194,304 bytes and must match the recorded
manifest's index, length and chunk digest. Reject partial responses, direct
object storage reads, presigned URLs and redirects. The contract covers
encrypted artifacts. Local plaintext opening is a separate operation.
