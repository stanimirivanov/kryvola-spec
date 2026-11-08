# Fenced compute-input reads

A worker fetches the manifest with `POST /v1/compute-inputs/manifest` and each
part with `POST /v1/compute-inputs/parts/{part_index}`. Both take a bounded JSON
control body with `schema_version`, the exact `attempt`, and `manifest_digest`.
Each request, including retries, redeems a fresh single-use bearer grant bound
to the verified workload, tenant, operation, workflow epoch, attempt epoch,
fence, manifest digest, and `COMPUTE_READ` purpose.

Fabric checks the current operation and lease, the exact attempt, and the
absence of a committed cancellation or recovery barrier. The requested digest
must appear in the operation's recorded input manifest digests. This applies
to both ciphertext and evaluation-key inputs. The finalized manifest must
match that digest, tenant, and the operation's key-context digest. Only an
immutable finalized copy is eligible. Staged objects and entries marked for
reclamation are ineligible. Read access does not follow from the digest or an
output's selection or release status.

The service serializes the read admission decision with changes to the
operation fence and protects the artifact against reclamation through the
bounded read. Before handing bytes to HTTP, it verifies the complete manifest
commitment or the part length and indexed chunk commitment in that manifest,
and checks that the workload identity and grant are still live. A committed
barrier prevents subsequent reads. Bytes handed to HTTP by an earlier admitted
read may finish sending after a barrier. A failed integrity or dependency
check returns a bounded JSON error before any success body is handed to HTTP.

A success is uncompressed `application/octet-stream` with an exact
`Content-Length` and `Cache-Control: no-store`. The manifest is at most
65,536 bytes. A part is at most 4,194,304 bytes and uses the manifest's
zero-based index. The API does not accept ranges or return partial content.
A caller retries a failed or interrupted transfer with a new grant and
checks the complete length and commitment before using the bytes.

Errors use the existing runtime envelope. Malformed controls are invalid
requests. Scope or input membership denial returns `FORBIDDEN`. Once the
scope is authorized, a missing finalized input or index returns `NOT_FOUND`.
Expired attempts and stale fences use the existing conflict codes. Storage
failure and integrity mismatch return `UNAVAILABLE`. Owner release reads
and compute-write permissions use separate authorization boundaries.
