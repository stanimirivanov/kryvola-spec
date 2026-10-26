import { type Effect, Schema } from "effect";
import { CANONICAL_SCHEMAS } from "../dist/canonical.js";
import { controlFixtures, Operation } from "../dist/control.js";
import {
  decodeCanonicalEffect,
  decodeOperationEffect,
  type ReferenceValidationError,
  type ValidatedCanonical,
  type ValidatedOperation,
} from "../dist/index.js";

const raw = Schema.decodeUnknownSync(Operation)(controlFixtures.Operation);
// @ts-expect-error structural decoding does not grant semantic validation
const unchecked: ValidatedOperation = raw;
const plan = Schema.decodeUnknownSync(CANONICAL_SCHEMAS.plan)({});
// @ts-expect-error a structural plan is not canonical-byte validated
const uncheckedPlan: ValidatedCanonical<"1", "plan"> = plan;
const operation: Effect.Effect<ValidatedOperation, ReferenceValidationError, never> =
  decodeOperationEffect(raw);
const canonical: Effect.Effect<
  ValidatedCanonical<"2", "plan">,
  ReferenceValidationError,
  never
> = decodeCanonicalEffect("plan", new Uint8Array(), "2");
// @ts-expect-error format selection is explicit
decodeCanonicalEffect("plan", new Uint8Array());
// @ts-expect-error receipt has no v2 format
decodeCanonicalEffect("receipt", new Uint8Array(), "2");
// @ts-expect-error v2 success cannot substitute for a v1 validated value
const wrongFormat: Effect.Effect<
  ValidatedCanonical<"1", "plan">,
  ReferenceValidationError,
  never
> = canonical;
// @ts-expect-error a plan brand cannot substitute for a manifest brand
const wrongKind: Effect.Effect<
  ValidatedCanonical<"2", "manifest">,
  ReferenceValidationError,
  never
> = canonical;
declare const valid: ValidatedCanonical<"2", "plan">;
const version: "2" = valid.schema_version;
const name: string = valid.display_name;
void [unchecked, uncheckedPlan, operation, wrongFormat, wrongKind, version, name];
