import { LIMITS } from "./index.js";

function length(bytes: Uint8Array): number {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError("Expected serialized bytes, not an object or string");
  return bytes.byteLength;
}
export function assertControlBytes(bytes: Uint8Array): void {
  if (length(bytes) > Number(LIMITS.control_bytes)) throw new Error("Control exceeds 64 KiB");
}
/** Complete uncompressed encoded record, including key, headers and record framing. */
export function assertEventRecordBytes(record: Uint8Array): void {
  if (length(record) > Number(LIMITS.control_bytes)) throw new Error("Event record exceeds 64 KiB");
}
/** Metadata is application-call overhead excluding the separately supplied payload bytes. */
export function assertTemporalCallBytes(
  payloads: readonly Uint8Array[],
  metadata = new Uint8Array(),
): void {
  let total = length(metadata);
  if (total > Number(LIMITS.temporal_call_bytes)) throw new Error("Temporal call exceeds 128 KiB");
  for (const payload of payloads) {
    const size = length(payload);
    if (size > Number(LIMITS.temporal_payload_bytes))
      throw new Error("Temporal payload exceeds 32 KiB");
    total += size;
    if (total > Number(LIMITS.temporal_call_bytes))
      throw new Error("Temporal call exceeds 128 KiB");
  }
}
