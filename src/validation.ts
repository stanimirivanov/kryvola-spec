import { Brand, Data, Effect } from "effect";
import {
  type CANONICAL_SCHEMAS,
  type CANONICAL_V2_SCHEMAS,
  type CanonicalKind,
  type CanonicalVersion,
  decodeCanonical,
  type SignatureEnvelope,
  type SignatureEnvelopeV2,
} from "./canonical.js";
import { decodeOperation, type Operation } from "./control.js";

/** ValidatedOperation passed strict structure and tenant/job correlation, not authorization. */
export type ValidatedOperation = typeof Operation.Type & Brand.Brand<"ValidatedOperation">;
const validatedOperation = Brand.nominal<ValidatedOperation>();

type Formats = {
  "1": typeof CANONICAL_SCHEMAS & { signature: typeof SignatureEnvelope };
  "2": typeof CANONICAL_V2_SCHEMAS & { signature: typeof SignatureEnvelopeV2 };
};
/** CanonicalKindFor restricts object kinds to those supported by the selected format. */
export type CanonicalKindFor<V extends CanonicalVersion> = keyof Formats[V] &
  (CanonicalKind | "signature");
/** ValidatedCanonical passed bounded UTF-8/JCS, strict schema and reference semantic checks.
 * Its brand records kind/format, not authenticated trust, signature verification or approval.
 */
export type ValidatedCanonical<
  V extends CanonicalVersion,
  K extends CanonicalKindFor<V>,
> = (Formats[V][K] extends { readonly Type: infer A } ? A : never) &
  Brand.Brand<`ValidatedCanonical:${V}:${K & string}`>;

/** ReferenceValidationError exposes only a stable tag/code and fixed safe message.
 * No input, parser diagnostic or original cause is retained. Codes identify the API,
 * not the failing field or validation phase.
 */
export class ReferenceValidationError extends Data.TaggedError("ReferenceValidationError")<{
  readonly code: "INVALID_OPERATION" | "INVALID_CANONICAL";
}> {
  override get message(): string {
    return "Reference validation failed";
  }
}

/** decodeOperationEffect lazily validates strict structure and tenant/job correlations.
 * Synchronous validation throws become typed INVALID_OPERATION failures; no services
 * are required. Success is a validation snapshot, not a lease or authorization.
 */
export function decodeOperationEffect(
  input: unknown,
): Effect.Effect<ValidatedOperation, ReferenceValidationError, never> {
  return Effect.try({
    try: () => validatedOperation(decodeOperation(input)),
    catch: () => new ReferenceValidationError({ code: "INVALID_OPERATION" }),
  });
}

/** decodeCanonicalEffect lazily validates bytes using an explicitly selected format.
 * UTF-8, JSON, size/depth, canonical equality, strict schema and semantic failures
 * become typed INVALID_CANONICAL failures without raw diagnostics. No I/O/services,
 * key trust, signature verification or cross-object authorization is performed.
 */
export function decodeCanonicalEffect<V extends CanonicalVersion, K extends CanonicalKindFor<V>>(
  kind: K,
  bytes: Uint8Array,
  version: V,
): Effect.Effect<ValidatedCanonical<V, K>, ReferenceValidationError, never> {
  return Effect.try({
    // The private constructor is reached only after the complete synchronous validator.
    try: () =>
      Brand.nominal<ValidatedCanonical<V, K>>()(
        decodeCanonical(kind, bytes, version) as Brand.Brand.Unbranded<ValidatedCanonical<V, K>>,
      ),
    catch: () => new ReferenceValidationError({ code: "INVALID_CANONICAL" }),
  });
}
