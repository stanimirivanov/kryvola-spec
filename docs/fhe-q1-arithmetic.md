# FHE-Q1 arithmetic candidate — issue #17

Bundle `0.1.0-preview.7` retains the existing Engine v1 vocabulary and defines matching signed **plan/manifest v2** candidates. The choice is exact unsigned modular ADD/MUL, not checked or saturating arithmetic. This resolves the candidate mismatch before native canonical adapters and planner/engine integration; it does not ratify a model, parameters or production profile. `src/fhe-q1.ts` owns the shared Effect declarations. No assurance profile is enabled.

## Arithmetic contract

| Property        | Meaning                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integer width   | `dtype` is uint8, uint16, uint32 or uint64; w is respectively 8, 16, 32 or 64. `parameters.radix_bits` is the same total unsigned width and must equal w.                                        |
| Encoding        | Fractional bits are exactly `"0"`. Input integers must already lie in `[0, 2^w)`; reject out-of-range values instead of reducing them during encoding.                                           |
| ADD             | Two encrypted unsigned operands of the same width; elementwise result `(a + b) mod 2^w`.                                                                                                         |
| MUL             | Two encrypted unsigned operands of the same width; elementwise result `(a × b) mod 2^w`. This is not an alias for ciphertext/clear multiplication.                                               |
| Overflow        | `WRAP`; overflow during valid operations is handled by the specified modulus. No checked-overflow exception or saturation is implied.                                                            |
| Operators field | Unique required capability set, containing ADD, MUL or both. Its order has no execution meaning; the exact allowlisted program defines circuit order, repeated operations and shape transitions. |

For uint8, ADD(255, 1) = 0 and MUL(255, 2) = 254. For uint64, ADD(18446744073709551615, 1) = 0. All reference arithmetic uses exact integer strings/BigInt. The fixed corpus includes overflow cases for all four widths plus ordinary operations. A test-only plaintext oracle rejects invalid operand ranges; it is not an engine implementation or evidence of encrypted correctness.

The public-model assumption is unchanged. Clear multiplication, signed/fractional numbers and checked/saturating arithmetic need separately specified, negotiated capabilities and signed formats. Parameter digests must resolve to independently approved metadata matching width and declared message/carry settings. Program/engine approval must bind the actual width, operand and shape semantics; an advertisement alone cannot establish those facts. TFHE noise/failure probability, memory and latency qualification remain separate work.

## Version and migration boundary

Existing v1 schemas, positive/negative fixtures, commitments and signatures retain their exact bytes. Historical v1 plans/manifests declare REJECT and plans permit MUL_CLEAR; they remain readable for historical conformance, but are **not** compatible baseline execution plans. Do not reinterpret those objects or rename MUL_CLEAR to MUL.

`CANONICAL_V2_SCHEMAS` adds plan/manifest schemas with `schema_version: "2"`, required `arithmetic: "EXACT_MODULAR"` and shared precision `overflow: "WRAP"`. Their detached signature envelope/header also uses version 2 and permits only plan/manifest payloads. Other object/envelope kinds remain v1. Published schemas are under `generated/canonical/v2/`; the new fixed corpus is `fixtures/canonical/modular-v2.json`, exported as `generated/fixtures/canonical-modular-v2.json`.

The APIs `canonicalBytes`, `decodeCanonical`, `commitment` and `signaturePreimage` accept an explicit third argument `"2"`. Their default remains `"1"`; there is no automatic version detection/fallback. Consumers select the expected version from trusted policy, not untrusted payload hints. Unsupported kind/version pairs fail. Envelope/payload versions must agree.

For v2 object commitments use `UTF8("kryvola/<kind>/v2") || NUL || JCS(payload)`. For signatures use `UTF8("kryvola/signature/<kind>/v2") || NUL` followed by the unchanged length-framed header/payload construction documented in [canonical formats](canonical.md). The v2 header itself carries schema_version 2. Cross-version payloads, headers, signature domains and commitments cannot be substituted. Chunk/full-blob framing remains v1 because byte transport semantics did not change. Key-context, journal, receipt, approval and operation-identity formats also remain v1; referenced plan/manifest commitments are computed using the explicitly selected referenced format version.

Consumers must explicitly re-pin the spec bundle and opt into the v2 corpus and validators. Existing consumer pins, Engine/Protobuf tags and native wire outputs remain unchanged. Native canonical adapters in M0-PR8–10 must test both historical v1 and opted-in v2 cases. No publication or consumer migration is performed here.

## Plan-to-Engine reference validation

`validatePlannedExecuteRequest(planBytes, request, capabilities, nowUnixMs)` requires canonical v2 plan bytes. It applies existing Engine intent/advertisement/deadline checks, then binds tenant, the exact v2 plan commitment, key context, engine/program/parameter commitments, profile, output/resource contract, required operator set and ordered input manifest commitments. Shared schema literals enforce the arithmetic mode in both plan and advertisement. V1/unsupported plans, changed context, missing operators and reordered inputs fail.

The checker does not authenticate a signature, qualify a program, fetch/verify input manifests, match actual key material, reserve capacity, check current fences/leases, or authorize release. Callers must independently authenticate the expected plan, allowlist its full parameter/program/engine metadata and validate fetched v2 manifests against plan precision/shapes before native decoding. Evidence/leakage/consent/model approval is not established by the Engine DTO, which lacks those policy records. This is metadata conformance, not proof of correct evaluation.

Focused gate: `pnpm build`, then `node --test tests/fhe-q1.test.mjs tests/canonical.test.mjs tests/engine.test.mjs` after `pnpm generate`. Full gate: `pnpm native:generate`, `pnpm check`, `pnpm native:check`. No new dependency or runtime repository implementation is introduced.
