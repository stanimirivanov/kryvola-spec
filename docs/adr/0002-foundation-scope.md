# ADR 0002: deliver a buildable M0 scaffold before feasibility qualification

Status: accepted implementation scope, 25 October 2026.

All five repositories initially contained only their Apache-2.0 LICENSE. This change delivers independently buildable/checkable foundations and a small contract preview. It does not execute the complete M0 research/feasibility gate or invent an inference workload.

Spec owns schemas/docs; fabric owns Rust control and separate Python Temporal/Ray integration boundaries; engines owns Rust and C++ adapters and future zkVM guests; ml owns Python SDK/planner/reference semantics; platform composes released artifacts and owns operational qualification. Consumers pin spec by commit and manifest hash without importing sibling implementation source. Their first runtime diagnostics say execution/inference is unavailable.

No project-local `.codex/config.toml` is justified: this work changes neither the configured model nor reasoning effort. No repository skill is added because the current recurring commands fit concise root AGENTS.md and contributor documentation. No empty service directories, crypto dependencies, mock proof acceptance, cloud resources or production secrets are introduced.

Root AGENTS.md applies from repository root through child working directories using [documented Codex discovery](https://developers.openai.com/codex/guides/agents-md). Scoped instructions are unnecessary while the rules are uniform. GitHub merge rules remain maintainer configuration; checked-in CI and agent guidance do not enable branch protection.
