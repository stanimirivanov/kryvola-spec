// Compile against emitted public declarations; this file is never executed.
import { CANONICAL_LIMITS, CANONICAL_SCHEMAS, CANONICAL_V2_SCHEMAS } from "../dist/canonical.js";
import { CONTROL_FIELD_NUMBERS, CONTROL_SCHEMAS } from "../dist/control.js";
import { ENGINE_FIELD_NUMBERS, ENGINE_METHODS, ENGINE_SCHEMAS } from "../dist/engine.js";
import { ARTIFACT_REF_FIELD_NUMBERS, LIMITS, METADATA_LEAKAGE } from "../dist/index.js";

function rejectedWrites(): void {
  // @ts-expect-error public limits are readonly even when assigning the same value
  LIMITS.artifact_max_bytes = LIMITS.artifact_max_bytes;
  // @ts-expect-error canonical limits are readonly
  CANONICAL_LIMITS.depth = CANONICAL_LIMITS.depth;
  // @ts-expect-error v1 registry slots cannot be replaced
  CANONICAL_SCHEMAS.plan = CANONICAL_SCHEMAS.plan;
  // @ts-expect-error v2 registry slots cannot be replaced
  CANONICAL_V2_SCHEMAS.plan = CANONICAL_V2_SCHEMAS.plan;
  // @ts-expect-error control registry slots cannot be replaced
  CONTROL_SCHEMAS.Operation = CONTROL_SCHEMAS.Operation;
  // @ts-expect-error engine registry slots cannot be replaced
  ENGINE_SCHEMAS.ExecuteRequest = ENGINE_SCHEMAS.ExecuteRequest;
  // @ts-expect-error root wire tags are readonly
  ARTIFACT_REF_FIELD_NUMBERS.schema_version = ARTIFACT_REF_FIELD_NUMBERS.schema_version;
  // @ts-expect-error nested wire-tag tables are readonly
  CONTROL_FIELD_NUMBERS.Attempt.fence = CONTROL_FIELD_NUMBERS.Attempt.fence;
  // @ts-expect-error wire-tag table slots are readonly
  CONTROL_FIELD_NUMBERS.Attempt = CONTROL_FIELD_NUMBERS.Attempt;
  // @ts-expect-error nested engine wire tags are readonly
  ENGINE_FIELD_NUMBERS.ExecuteRequest.operation = ENGINE_FIELD_NUMBERS.ExecuteRequest.operation;
  // @ts-expect-error engine wire-tag table slots are readonly
  ENGINE_FIELD_NUMBERS.ExecuteRequest = ENGINE_FIELD_NUMBERS.ExecuteRequest;
  // @ts-expect-error method vocabulary cannot be reordered
  ENGINE_METHODS.reverse();
  // @ts-expect-error leakage vocabulary cannot be extended
  METADATA_LEAKAGE.push("TIMING");
}
void rejectedWrites;

// Read-only use, literal wire tags and caller-owned copies retain their types.
const fenceTag: 6 = CONTROL_FIELD_NUMBERS.Attempt.fence;
const operationTag: 2 = ENGINE_FIELD_NUMBERS.ExecuteRequest.operation;
const methods = [...ENGINE_METHODS];
methods.reverse();
const localSchemas = { ...CANONICAL_SCHEMAS };
localSchemas.plan = CANONICAL_SCHEMAS.plan;
void [fenceTag, operationTag, methods, localSchemas];
