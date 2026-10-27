# Canonical objects and commitments (M0-PR7)

[Rust](canonical-rust.md), [Python](canonical-python.md) and [C++](canonical-cpp.md) adapters now share `pnpm check:canonical` and compare actual outputs. References below to pending PR8–10 describe the original M0-PR7 scope; these test adapters do not establish production qualification.

Issue #17 adds [modular plan/manifest v2 and explicit migration](fhe-q1-arithmetic.md) in bundle `0.1.0-preview.7`. The v1 definitions/corpus below remain historical and unchanged; v1 plans are not compatible FHE-Q1 execution plans. Default canonical API calls still select v1; the new checker requires an explicitly selected v2 plan.

Bundle `0.1.0-preview.6` introduces an **unratified, explicit opt-in** v1 signed-format candidate. Effect in `src/canonical.ts` owns the closed schemas; `generated/canonical/` exports structural JSON Schema. `fixtures/canonical/` is the fixed candidate corpus, copied to `generated/fixtures/canonical-{corpus,negative}.json`. Tests compare exact bytes, digests and public-test-key signatures. Import the reference submodule from `dist/canonical.js`; it is not a production signing or authorization library. Rust/Python/C++ canonical adapters remain M0-PR8–10. Protobuf is not a signing representation.

**BEHAVIOR-ADJACENT / compatibility:** existing unsigned fixtures, RPC tags and consumer pins remain unchanged. Existing illustrative operation IDs/digests are not silently reinterpreted as computed commitments. Adopting signed objects requires explicit validation of their format, context and producer trust. Adding a signed field or changing semantics requires a new object version, domain and vectors. Do not call this candidate a frozen production format.

## Closed objects

All fields are mandatory, unknown fields are rejected recursively, and each payload carries `schema_version: "1"`, `object_type` and `tenant_scope`. Integers are canonical unsigned decimal **strings** in `[0, 18446744073709551615]`; digests are exactly 64 lowercase hexadecimal characters. Identifiers use the control contract's ASCII grammar and 128-character maximum. Lists preserve their order; no sorting or deduplication changes meaning.

| Object type          | Bound context and restrictions                                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest`           | Producer, ciphertext/evaluation-key kind, key context, `tfhe-rs-safe` codec/version, TFHE parameter digest and radix/message/carry settings, integer precision, shape, serialized/expanded lengths, ordered chunks and full-blob digest. Proof, CKKS and MPC payload codecs require a later format version.                                         |
| `plan`               | Key context, model/program/engine, parameters, input/output shapes, ADD/MUL_CLEAR operators, ordered input manifests, output/resource/evidence/leakage/consent commitments and FHE-Q1 profile. `display_name` permits up to 256 Unicode code points for scalar/escaping vectors; it has no authorization meaning.                                   |
| `approval`           | Job, plan, key context, typed subject commitment, compute/evidence/release purpose, recipient, policy/consent and validity interval. A RELEASE-purpose approval alone is not a release transaction.                                                                                                                                                 |
| `key-context`        | Owner, key ID/epoch, public-key digest, evaluation-key blob digest, parameters, codec version and FHE-Q1. No private keys. Excludes its own digest, which is computed over this payload.                                                                                                                                                            |
| `journal`            | Job/operation/attempt/execution/fence/session, plan/key/model/program/guest/verifier, proof system/mode/security version, ordered input/output manifests, evidence policy and validity interval. MANIFEST_PROCESSING / STRUCTURAL_VALIDITY_ONLY is the only relation candidate; it does not prove FHE evaluation or witness privacy.                |
| `receipt`            | Job/operation/attempt/execution/fence/session/stage, plan/key/program/engine, ordered input/output manifests, capability/leakage/evidence policy, journal commitments, signer and times. NOT_REQUESTED/PENDING/CLAIMED are observations, never verified evidence or release verdicts.                                                               |
| `operation-identity` | Tenant, logical job, plan commitment, stage and workflow epoch only. Its commitment is lowercase hexadecimal `operation_id`. Attempts, fences, sessions and physical execution IDs cannot enter this closed object. Workflow-epoch changes remain coordinated recovery decisions, not permission for another disclosure. This object is not signed. |

Parameter numbers must be positive; precision fixes fractional bits to zero and overflow to REJECT. Shape rank is 1–8, dimensions are positive and their product is at most 1,048,576 elements. These are metadata bounds, **not approved cryptographic parameters or memory estimates**. Consumers must match exact parameter/codec/engine/profile versions to an independently approved allowlist before allocation or decoding. No profile is enabled. Validity intervals must increase; receipt completion must not precede start. Current-time expiry and cross-object consistency require consuming policy.

The key context commits to exact evaluation-key blob bytes, not its manifest. Construct key bytes, then the key-context commitment, then the evaluation-key manifest referring to that context. Receivers must match the manifest full-blob digest to the approved key-context blob digest. Committing the context back to that manifest would create an impossible hash cycle. Plan consent commitments refer to independent consent declarations, not approvals that already bind the plan.

## Canonical bytes and limits

Use RFC 8785 JCS UTF-8: lexicographic UTF-16 code-unit property ordering, shortest JSON escapes, no whitespace/BOM/terminal newline. Strings contain Unicode scalar values; do not normalize composed/decomposed forms. This profile admits strings, arrays and closed objects only: JSON numbers (including integers, exponent forms and negative zero), null and booleans are forbidden. Large integers cannot pass through floating-point conversion.

`decodeCanonical` enforces a 1,048,576-byte cap before fatal UTF-8 decoding, scans nesting before parsing (maximum 16 containers), applies strict Effect schemas/semantic checks, then requires byte equality with JCS output. Duplicate properties, including escaped aliases, necessarily differ from unique-key serialization and are rejected. The parsed object must not be used before comparison succeeds; last-key-wins JSON parsing alone is never acceptance. Programmatic `canonicalBytes` checks value/depth/schema restrictions and output size. The cap applies to every payload/envelope; schema bounds may impose a lower achievable size. Exported JSON Schema alone does not enforce Unicode scalars, canonical bytes, chunk arithmetic, timestamp comparisons or shape products.

Manifest entries start at index/offset zero, are contiguous and ordered, and have positive lengths at most 4,194,304 bytes. Their sum equals `serialized_bytes` and is at most 1,073,741,824 bytes; `max_expanded_bytes` is between that sum and the same 1 GiB cap. At most 1,024 entries are permitted. Default producer chunk target: 1,048,576 bytes; other bounded sizes are accepted. Empty artifacts are excluded. Native expansion needs separate enforcement of the declared bound and aggregate process quotas.

## Normative framing

`UTF8(s)` is exact UTF-8; `0x00` is one NUL byte; `U64LE(n)` is exactly eight unsigned little-endian bytes, rejecting overflow. BLAKE3 is unkeyed BLAKE3-256 (32 bytes), represented as lowercase hexadecimal. No implicit prefixes, tree format, native framing or JSON newline:

```text
D(kind)           = UTF8("kryvola/" + kind + "/v1") || 0x00
commitment        = BLAKE3-256(D(object_type) || JCS(payload))
chunk_digest      = BLAKE3-256(D("chunk") || U64LE(index) || U64LE(byte_length) || chunk_bytes)
full_blob_digest  = BLAKE3-256(D("blob") || exact_serialized_blob_bytes)
operation_id      = commitment(operation-identity payload)
```

Manifest commitment binds chunk order/offsets/lengths and the full-blob commitment. A receiver authenticates the expected signed manifest, checks every chunk's length/index/digest, verifies ordered concatenation and full blob length/digest, then permits an allowlisted bounded decoder. Reference helpers compute commitments; they do not fetch/reassemble/authenticate/authorize artifacts. Attackers can recompute unsigned hashes. Low-entropy plaintext hashes are not hiding commitments and must not be published as private-feature protection.

Typed references use the corresponding object domain: `plan_digest`, `key_context_digest`, manifest lists and journal lists select plan, key-context, manifest and journal commitments; `subject_kind`/`payload_kind` select subject/payload domains. Other digest fields identify exact external byte blobs using the full-blob framing, including public/evaluation keys, model/program/guest/verifier bytes, parameter sets, output contracts, policies, consent declarations and resource/capability/leakage records. An `engine_digest` identifies an immutable release-descriptor blob, not an untagged OCI SHA-256 value; its eventual descriptor must bind the exact OCI algorithm/digest and be independently qualified. Those external artifact formats/allowlists remain their owning tasks; no fixture digest establishes their validity. Field names and the enclosing typed commitment bind each blob's role. Never insert build-provenance SHA-256 hashes or guessed digests in their place.

## Signature envelope and trust

The detached envelope has exactly `schema_version`, `algorithm: "Ed25519"`, `payload_kind` (one of the six signed types), `payload_digest`, `signer`, `key_id`, `key_epoch`, and `signature`. Signature: exactly 64 bytes in canonical unpadded base64url (86 characters with constrained pad bits). Payload is separate; no nested signatures/private material. Let `H` be JCS bytes of the envelope with **only** `signature` omitted and `P` the validated canonical payload bytes:

```text
Ed25519 message = D("signature/" + payload_kind)
               || U64LE(len(H)) || H || U64LE(len(P)) || P
```

Use pure Ed25519 over those bytes, not Ed25519ph/ctx, an implementation-specific hash or the digest alone. `signaturePreimage` validates header, canonical payload kind and commitment. Identity/key/epoch and payload domain are signed. Verification needs an independently authenticated expected producer/owner, identity-to-key binding, algorithm and key rotation/revocation history—not a key chosen solely by the envelope. Require payload producer/signer/owner consistency where fields occur. Compare expected tenant/plan/key/model/program/subject, current fence/session, purpose, policy, consent and validity. Replay protection and release uniqueness need later registry protocols. A valid signature on a bad computation remains a signed bad claim. There is no trust store, signing service, key custody, production verification policy or post-quantum claim here.

The corpus uses the public RFC 8032 test key and carries `UNRATIFIED_TEST_ONLY`. Hashes/signatures are fixed bytes, not regenerated expectations during tests. Tests independently check the official empty-input BLAKE3 digest and RFC 8032 empty-message signature. Native differential evidence remains pending PR8–10; M0 is not complete.

## Prior art and gates

Adopt `canonicalize` 5.1.0 (Apache-2.0) as a JCS dependency and `@noble/hashes` 2.4.0 (MIT) for BLAKE3 behind the restricted reference wrapper; neither adds transitive runtime dependencies. Pins/integrity: `package.json`/`pnpm-lock.yaml`. The historical noble-hashes audit excluded BLAKE3; no audit claim is made for this use. Node built-in crypto is used only in tests with public fixture signatures. No custom hash/Ed25519 implementation. Kryvola-specific schemas, domains and bounds are original protocol policy requiring ratification.

Run `pnpm generate`, `pnpm native:generate` (native provenance covers spec inputs), then `pnpm check`. Focused gate: `pnpm build`, then `node --test tests/canonical.test.mjs`. Existing `pnpm native:check` covers wire bindings, not native JCS.

References: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032), [canonicalize](https://github.com/erdtman/canonicalize), [noble-hashes scope/license](https://github.com/paulmillr/noble-hashes), [BLAKE3 specification](https://github.com/BLAKE3-team/BLAKE3-specs).

[Python conformance and Rust differential gate](canonical-python.md) adds M0-PR9 fixture compatibility evidence; [M0-PR10](canonical-cpp.md) extends comparison to C++.
