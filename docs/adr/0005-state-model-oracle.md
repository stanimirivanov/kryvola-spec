# ADR 0005: distribute finite model graphs as test oracles

Status: proposed, 7 November 2026, Spec issue #69. Owner approval remains pending.

## Context

The M1 remediation plan requires implementation-trace evidence for Fabric selection
and cancellation (D05). Importing sibling source violates repository ownership;
reimplementing transition guards would create a second specification.

## Decision

Export the existing bounded attempts and release models as complete, versioned JSON
graphs with source hashes and model-derived sample traces. Effect owns their structural
schemas. Reuse canonicalize, SHA-256 and existing generation/publication provenance;
add no dependency. A generic graph walker checks outcomes and full observed states.
Prefer this over fixture-only examples (incomplete transitions) or distributing a
model interpreter (runtime language dependency). About 3 MiB of bounded graph data
is acceptable for test distribution; it never enters runtime control messages.

## Enforcement and current gaps

[Format and consumption](../state-oracle.md) records files, budgets and trust limits.
`pnpm check`, `pnpm check:state` and existing committed-bundle qualification own
verification. Source models and historical signed bytes remain unchanged. Publishing
and Fabric's raw-observation normalization adapter are separate, pending work.

## Consequences

The finite graphs are evidence under existing model assumptions, not production
admission or an unbounded proof. Consumers must authenticate and pin an immutable
artifact and independently qualify their mapping. Keep old pins/versions immutable;
breaking format changes require a new version. No runtime wire migration is added.
