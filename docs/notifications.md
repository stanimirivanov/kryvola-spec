# Outbox notification v2

A notification tells a subscriber to re-read the authoritative SQL registry.
It carries five required fields.

| Field                          | Meaning                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `version`                      | JSON number `2`                                                                                                |
| `id`                           | Canonical decimal string in the range 1–9223372036854775807. Identity is scoped to one authoritative registry. |
| `tenant_scope`, `operation_id` | The operation's existing bounded ASCII identifiers                                                             |
| `kind`                         | `operation_created`, `result_selected`, `cancelled`, or `recovery_fenced`                                      |

The body is compact canonical UTF-8 JSON with lexicographically sorted field
names. The decoder rejects duplicate or unknown fields, invalid UTF-8, and
noncanonical bytes. The Kafka key concatenates the decimal UTF-8 byte length of
the tenant, a colon, the tenant, and the operation ID. For example,
`11:tenant:westop:42` identifies tenant `tenant:west` and operation `op:42`.
The key is stable across event kinds and versions for the same operation.
All headers are forbidden. The combined serialized key and body may use at
most 64,512 bytes. The transport separately enforces the 65,536-byte limit
on the complete uncompressed record, including broker framing.

Use the [generated schema](../generated/notifications/v2/Notification.schema.json)
for structure and the [interoperability vector](../generated/notifications/v2/vector.json)
for exact body and key bytes. The Effect codec also checks the partition key
and application byte budget. Wakeups may be duplicated, reordered, or lost.
Deduplicate by registry-scoped event ID and resolve current state from SQL before
acting.

Fabric's private v1 encodes `id` as a JSON number and uses `version: 1`. A
migration adapter reads that number losslessly as a positive signed 64-bit
integer or obtains it directly from the outbox row. It emits the decimal
string under v2, preserves the partition key and event kind, and keeps the
same SQL event identity for deduplication across versions. Prefer replay
from the outbox when a reader cannot recover the exact v1 integer. The
v2 codec accepts only v2. Fabric rollout and compatibility handling are
consumer-side work.
