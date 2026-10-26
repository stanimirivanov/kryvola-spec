# Documentation index

1. [Design v2](kryvola-design-v2.md) and [Implementation plan v2](kryvola-implementation-plan-v2.md) are the approved architectural and roadmap context from 25 October 2026. They explicitly supersede v1.
2. [ADR 0001: schema authoring amendment](adr/0001-schema-authoring.md) records the subsequent explicit user decision. It supersedes v2 only for authoring/toolchain ownership, preserving its runtime and wire boundaries.
3. [ADR 0002: foundation delivery scope](adr/0002-foundation-scope.md) limits this work to a buildable initial scaffold.
4. [Ownership and review responsibilities](ownership.md) and [ADR 0003: release governance](adr/0003-release-governance.md) propose the KRY-001 inventory and immutable candidate/release process. Human sign-off remains pending; these documents do not supersede the design. Use the [ADR template](adr/template.md) for new decisions.
5. [Harness](harness.md) maps requirements to code and checks.
6. [Progress](progress.md) records evidence and remaining work. File timestamps do not establish authority.

[FHE-Q1 assurance and consent](assurance.md) describes the M0-PR2 preview schemas, reference policy checks, evidence modes and residual threat boundaries. Its baseline fixture remains disabled and unreviewed.

Other repositories consume a checked, commit-pinned copy of `generated/`, not this repository's source tree. Change a contract here, run generation/verification, commit it, then explicitly update consumers' `spec.lock.json` and artifacts.

[Reference and identity previews](control.md) describes M0-PR4 contracts, strict decoding, status separation and wire-preview limitations.

[Engine API and transport boundaries](engine.md) describes M0-PR5 negotiation, events, cancellation and byte-budget contracts.

[Native wire generation](native-wire.md) describes M0-PR6 bindings, pinned native toolchains, golden vectors and the separate Docker conformance gate.

[Canonical objects and commitments](canonical.md) describes M0-PR7's opt-in signed-format candidate, reference framing, fixed corpus and remaining native/trust gates.

[FHE-Q1 arithmetic and v2 migration](fhe-q1-arithmetic.md) resolves issue #17's plan/Engine mismatch with an explicitly versioned modular candidate and a cross-contract reference checker.

[Immutable authoring policy](policy.md) documents issue #18's readonly containers, runtime mutation guards and public declaration type tests.
