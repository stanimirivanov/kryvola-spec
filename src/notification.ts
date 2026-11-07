import canonicalize from "canonicalize";
import { Schema } from "effect";
import { Operation } from "./control.js";
import { LIMITS } from "./index.js";

// PostgreSQL's outbox identity is positive bigint. Keep the bound in the
// projected regex so JSON Schema and the Effect decoder agree without rounding.
const maximum = "9223372036854775807";
const smallerPrefixes = [...maximum].flatMap((digit, index) => {
  const minimum = index === 0 ? 1 : 0;
  return Number(digit) > minimum
    ? [`${maximum.slice(0, index)}[${minimum}-${Number(digit) - 1}][0-9]{${18 - index}}`]
    : [];
});
const EventId = Schema.String.check(
  Schema.isPattern(
    new RegExp(`^(?:[1-9][0-9]{0,17}|${smallerPrefixes.join("|")}|${maximum})(?![\\s\\S])`, "u"),
  ),
);

/** Reference-only wakeup scoped to one authoritative registry. */
export const Notification = Schema.Struct({
  version: Schema.Literal(2),
  id: EventId,
  tenant_scope: Operation.fields.tenant_scope,
  operation_id: Operation.fields.operation_id,
  kind: Schema.Literals(["operation_created", "result_selected", "cancelled", "recovery_fenced"]),
});
export type Notification = typeof Notification.Type;

export const NOTIFICATION_CONTENT_BYTES = Number(LIMITS.control_bytes) - 1024;
const utf8 = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function checkBudget(body: Uint8Array, key: Uint8Array): void {
  if (body.byteLength + key.byteLength > NOTIFICATION_CONTENT_BYTES)
    throw new Error("Notification exceeds key and body byte budget");
}

function validate(input: unknown): Notification {
  try {
    return Schema.decodeUnknownSync(Notification)(input, { onExcessProperty: "error" });
  } catch {
    throw new Error("Invalid notification envelope");
  }
}

function partitionKey({ tenant_scope, operation_id }: Notification): string {
  // Identifiers are ASCII. The length is the number of tenant UTF-8 bytes.
  return `${tenant_scope.length}:${tenant_scope}${operation_id}`;
}

export function encodeNotification(input: unknown): { key: Uint8Array; body: Uint8Array } {
  const value = validate(input);
  const key = utf8.encode(partitionKey(value));
  const body = utf8.encode(canonicalize(value));
  checkBudget(body, key);
  return { key, body };
}

/** Validate application bytes. Apply the complete-record cap at the transport boundary. */
export function decodeNotification(
  body: Uint8Array,
  key: Uint8Array,
  hasHeaders: boolean,
): Notification {
  if (hasHeaders) throw new Error("Notification headers are forbidden");
  checkBudget(body, key);
  let text: string;
  let input: unknown;
  try {
    text = decoder.decode(body);
    input = JSON.parse(text);
  } catch {
    throw new Error("Invalid notification JSON");
  }
  const value = validate(input);
  if (canonicalize(value) !== text) throw new Error("Noncanonical notification JSON");
  const expected = utf8.encode(partitionKey(value));
  if (expected.length !== key.length || expected.some((byte, index) => byte !== key[index]))
    throw new Error("Invalid notification partition key");
  return value;
}
