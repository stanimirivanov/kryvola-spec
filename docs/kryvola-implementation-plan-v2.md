# Kryvola: Implementation Plan v2

*Version 2 · 25 October 2026 · Companion to `kryvola-design-v2.md`*

This roadmap turns Kryvola into a supported confidential inference service before expanding it into a protocol composition research platform. It specifies 60 issue-ready work packages across six milestones. These are proposed GitHub issues, not issues that have been created. The documents available for this review are the original design and implementation plan; repository names below specify intended ownership, not an assertion that code, CI, or deployments have been inspected.

The first deliverable is **FHE-Q1**, one deliberately small, public-model, quantized TFHE inference profile. The owner encrypts inputs and alone opens the encrypted result. Durable artifact storage is part of the execution path; Temporal owns the logical workflow; Ray supplies replaceable compute capacity. Proofs, GPU acceleration, CKKS, MPC, PSI, DP, PIR, ABE, threshold custody, and confidential hardware are admitted through separate measured and reviewed gates. Production GA does not require every research extension.

## 1. Architectural corrections carried into delivery

The v1 plan put Rust-native engines in the fabric, assumed a zero-copy stream as a completion criterion, postponed correctness evidence, and treated threshold custody and protocol switching as available integration details. The v2 roadmap replaces those assumptions with the following delivery rules:

1. **Contracts before implementations.** `kryvola-spec` owns Protobuf control schemas, RFC 8785 JCS signed formats with strict versioned schemas, capability and leakage declarations, conformance fixtures, and protocol profiles. Protobuf transport encoding is not itself the canonical format for signatures or commitments. Compatibility is tested rather than promised by an indefinite API freeze.
2. **One workflow authority.** Temporal's production Python SDK implements deterministic workflows and activities in `kryvola-fabric`. Rust services implement authentication, artifacts, registry APIs, receipts, and the owner agent. A Python bridge submits to Ray; neither bridge nor Ray is a second durable DAG scheduler. A production Rust Temporal SDK is not an unverified dependency of the first release.
3. **Bounded control plane.** Redpanda carries serialized control events of at most 64 KiB. Temporal application payloads, including inputs, results, and heartbeat details, are at most 32 KiB each with a 128 KiB aggregate application limit per call. Oversized structures become artifacts. These are Kryvola limits enforced before transport; they do not restate upstream defaults. Ray receives authorized artifact references and execution metadata, never pickled FHE vectors, proofs, private keys, or user-supplied Python closures.
4. **Durability before optimization.** Immutable S3-compatible artifacts and a PostgreSQL operation/attempt registry enable recovery. Optional Arrow Flight transfers opaque, library-native byte chunks, default 1 MiB and maximum 4 MiB, with bounded decoding and flow control. The initial test profile caps each artifact at 1 GiB; a larger class needs explicit quota/memory qualification. GPU IPC and shared memory are measured optional optimizations; no gate requires universal zero-copy behavior.
5. **Fenced result selection, not global exactly-once execution.** PostgreSQL CAS transitions, attempt fences, outbox/inbox records, and immutable execution-specific outputs select at most one current result. A SQL commit cannot atomically submit to Ray: duplicate pure physical executions can occur and must be harmless. Selection requires a live dispatch lease; after committed selection, evidence/release use that selection and current authorization/cancellation/recovery state without requiring the dispatch lease to remain live. Interactive protocols reserve preprocessing for one physical session; ambiguous outcomes burn material and start a fresh authorized epoch.
6. **Keys stay in their authorized domains.** Owners retain private decryption keys and approvals in an owner-side agent. An independently reviewed threshold service is a later alternative. Ray workers, brokers, Temporal workers, provers, and platform control services receive no decryption keys and expose no generic cloud decrypt RPC. TFHE `ServerKey` is evaluation material, not the private client key.
7. **Claims match evidence.** Signed receipts authenticate claims; they do not prove execution. SP1 is the initial zkVM; RISC Zero is an optional conformance alternative. Every allowed proof states its exact relation and public journal binding. An allowed SP1 proof mode must provide the claimed witness privacy; raw STARK proofs must not be labelled zero knowledge. A prover sees the witness it receives. Ordinary Ray provers therefore receive public metadata or ciphertext bytes only, never owner plaintext or secrets.
8. **Release is a policy decision.** Only the Temporal workflow can authorize release, after the current committed selection, owner consent, cancellation/recovery state, policy epoch, and evidence policy are checked. `REQUIRED_BEFORE_RELEASE` blocks release until verification succeeds; `OPTIONAL_LATER` permits explicitly consented release followed by evidence and has no retroactive withholding guarantee; `NONE` claims no evidence. Unsupported computation-integrity requirements fail closed. The artifact service denies owner/consumer access to any candidate or selected output until an exact committed `RELEASED` record permits that recipient and digest, even within the same tenant; internal compute/evidence grants use a separate purpose. The owner agent validates the signed release authorization again before opening a result.
9. **Performance is an output of measurement.** Versioned benchmark profiles record key size, ciphertext expansion, CPU/GPU memory, queueing, transfer, evaluation, proof time, verification, accuracy, and cost. No implementation issue is accepted solely because it reproduces a vendor speedup. No arbitrary latency target is represented as an observed result.

M0 ratifies or replaces the provisional FHE-Q1 target of warm end-to-end p95 ≤5 seconds and cold p95 ≤15 seconds for its fixed small workload and declared concurrency; if it cannot fit the measured envelope, it is supported only as asynchronous inference. Required proof latency is measured separately and included in the corresponding end-to-end release class. Provisional disaster-recovery objectives are RPO ≤5 minutes and RTO ≤60 minutes. These are proposed engineering targets from the design, not measured results or production commitments.

## 2. Repository ownership and parallel execution

| Repository | Primary implementation responsibility | Parallel development contract |
|---|---|---|
| `kryvola-spec` | Protobuf schemas; canonical manifests, plans, receipts and proof journals; approved profiles; threat model; test vectors | Publish generated Rust, Python, and C++ artifacts plus fixtures from a tagged schema revision. No runtime engine dependency. |
| `kryvola-fabric` | Rust gateway, owner agent, artifact service, registry/coordinator, receipts and release API; Python Temporal workflows/activities and Ray bridge | Develop against the fake engine and recorded event traces. All engine implementations, including Rust engines and zkVM guests, remain outside this repo. |
| `kryvola-engines` | Rust TFHE-rs adapter and owner-side crypto bindings, SP1/RISC Zero guests and hosts; C++ CKKS, MPC, PSI, PIR and other optional adapters | Export versioned Engine API and client crypto packages. Heavy Rust/C++/CUDA builds have independent images and toolchain locks. No fabric source dependency. |
| `kryvola-ml` | Python owner SDK, model importer, quantization, static plans, constrained planner, DP accounting interfaces and examples | Consume generated contracts and packaged owner crypto bindings; test against fixture capabilities and costs. Do not import internal fabric or engine implementation modules. |
| `kryvola-platform` | Local environment, deployment manifests, identity policies, benchmark/fault harnesses, release lock, observability, DR and runbooks | Compose published packages and images. Execute cross-repository conformance and end-to-end gates without becoming the owner of cryptographic code. |

Each repository can test locally against fixtures once KRY-003 through KRY-005 publish a preview. Integration gates use one reviewed release-set lock containing repository revisions, schema version, engine image digests, crypto parameters, proof modes/verifying keys, dependency licenses, and benchmark profile digests. Nightly integration tests a proposed release set; successful main-branch builds do not silently change the production lock.

### Milestones and gates

| Milestone | Entry condition | Parallel tracks | Exit gate |
|---|---|---|---|
| **M0 — contracts and feasibility** | v1 documents and nominated repo owners | Spec/security; reproducible builds; crypto feasibility; baseline ML; platform harness | Reviewed profile and threat model; versioned wire/state fixtures; legal disposition; reproducible TFHE baseline measurements; unresolved blockers explicitly disable affected features. |
| **M1 — durable private inference** | M0 baseline approved | Fabric auth/storage/state; CPU TFHE; owner SDK/static planner; deployment/fault tests | Owner-to-owner TFHE inference works through Redpanda → Temporal → Ray → artifact store. Duplicate/lost completions, cancellation, stale fences, corrupted payloads, and worker key-exfiltration attempts pass. Baseline integrity limitations are visible in consent and receipts. |
| **M2 — evidence and measured scale** | M1 functional and failure gates pass | zkVM/evidence; Ray resilience; TFHE GPU; optional Flight; independent CKKS | Approved proof relation and policy-gated release work asynchronously; required evidence fails closed. CPU profile meets declared capacity envelope. GPU/Flight/CKKS ship only if their individual gates pass. |
| **M3 — constrained composition** | M2 plus an approved threat model for each added protocol | Planner; isolated MPC; PSI alignment; DP ledger; conversion research | At least one approved multi-owner profile passes correctness, leakage, failure/restart and release tests. Protocol conversions remain disabled until separately reviewed. This milestone is not a prerequisite for baseline GA. |
| **M4 — optional extensions** | Extension-specific research/legal/security sign-off | PIR; ABE; threshold service; TEE; zkML; GPU FSS | Each extension has its own support record and independent go/no-go. A failed or deferred extension does not prevent release of supported profiles. |
| **M5 — production qualification** | M1/M2 supported profile; selected extension gates only | Compatibility/security review; SRE/DR; owner UX/docs; canary | Independent security findings blocking supported profiles resolved, reproducible release set, DR/failover and canary gates pass, documented SLO/capacity/error envelope and operational ownership accepted. |

The baseline critical path is KRY-003/004/005 → KRY-012/013/017 → KRY-016/019/020 → KRY-022/024 → KRY-025/027/028/029/035 → KRY-054/055/056/057/058/059/060. KRY-011 authentication and KRY-014 owner custody gate every deployed stage. KRY-007 licensing and KRY-008 parameter review can block any engine before deployment. M3 and M4 are independent extension branches; their issue dependencies do not force them into the baseline GA release.

## 3. Issue backlog by milestone

Every block supplies the issue title, owning repository, dependencies, technical scope, and objective acceptance criteria. Dependencies are completion gates for integrated delivery; work using published fixtures may start earlier. Three acceptance criteria are the default minimum. An issue's documentation must record supported profiles, leakage, failure semantics, and residual limitations as applicable.

### M0 — contracts, feasibility and reproducibility

30 October 2026, M0-PR36: the [ratification candidate](m0-ratification.md) freezes
the already-tested preview.10 contract/profile identities and records immutable
wire/canonical/state, ML, platform and research crypto evidence. Its decision is
BLOCKED_PENDING_SIGNOFFS: no owner/security approvals are inferred from merges,
research-only crypto remains disabled for production, and five-component release
acceptance remains separate. Warm p95 ≤5 s / cold p95 ≤15 s remain proposed M1
owner-to-owner objectives, not measured service claims. M1's approved-baseline
entry gate above is unchanged. Semantic review changes reopen affected contract
and consumer checks; this record does not mark KRY-001–010 or M0 complete.

#### KRY-001 — [Architecture] docs: establish repository boundaries and decision records

**Repository:** `kryvola-spec` · **Dependencies:** none

**Description:** Publish the v2 system context, trust-boundary inventory, ownership map, ADR template, supported-profile format and cross-repository release process. Record the choice of Python Temporal workflows, Rust fabric services, Python Ray bridge, Rust/C++ engine adapters, and reference-only control messages. Mark documents versus implemented behavior explicitly; do not report fictional repository inspection or completed benchmarks.

**Acceptance criteria:**

- All five repo owners approve the ownership map; every runtime component and client crypto package has exactly one implementation owner.
- ADRs record durable storage, workflow authority, threat assumptions, engine location, and optional research feature gates.
- A schema release candidate and a release-set lock can identify the exact contract revision consumed by all five repos.

#### KRY-002 — [Security-Model] feat: define enforceable assurance and leakage profiles

**Repository:** `kryvola-spec` · **Dependencies:** KRY-001

**Description:** Define confidentiality, computation integrity, input validity, model visibility, output privacy, availability, and metadata leakage as separate claims. Start with single-owner encrypted inputs, a public/non-confidential quantized model, and an encrypted result. Cover malicious cloud workers, compromised bridges, tenant crossover, parameter substitution, timing/size/cache leakage and owner compromise. Specify `REQUIRED_BEFORE_RELEASE`, `OPTIONAL_LATER`, and `NONE` policies; no profile may treat a signature, FHE encryption, redundant execution, or input proof as an inference-correctness proof.

**Acceptance criteria:**

- A policy test matrix rejects a request for malicious-compute integrity when its engine supplies only an execution signature.
- Baseline consent fixtures disclose model visibility, size/timing leakage, residual side channels and owner endpoint trust.
- Every enabled profile names its security assumptions, allowed proof relations and release authority; unreviewed profiles are disabled.

#### KRY-003 — [Spec-Contracts] feat: publish bounded control and engine APIs

**Repository:** `kryvola-spec` · **Dependencies:** KRY-001, KRY-002

**Description:** Define Protobuf `ArtifactRef`, `KeyContextRef`, `PlanRef`, `Operation`, `Attempt`, `Execution`, `Capabilities`, engine execution/status/cancel, and versioned Redpanda events. Include tenant, logical job, stable application `workflow_epoch`, attempt/fence, physical execution ID, session epoch, deadline, idempotency/disclosure identity, policy digest and immutable artifact references. Use public statuses `COMPUTE_SELECTED`, `EVIDENCE_PENDING`, `EVIDENCE_VERIFIED`, `RELEASED`, `EVIDENCE_FAILED`, `CANCELLED` and `EXPIRED` with separate physical execution state. Specify application message limits of 64 KiB for events, 32 KiB per Temporal payload and 128 KiB aggregate application data per Temporal call. Generation uses reviewed pinned `protoc`/plugin versions with Rust, Python and C++ fixtures; RPC retries must respect the documented idempotency contract.

**Acceptance criteria:**

- Generated clients round-trip golden control messages across all three languages with unknown-field and unsupported-version cases tested.
- Exactly-at-limit fixtures pass and one-byte-over-limit serialized messages fail before broker, Temporal, or Ray submission.
- Fake engine conformance covers capability negotiation, deadlines, cancellation, error classification, and unsupported security profiles.

#### KRY-004 — [Artifact-Format] feat: specify canonical manifests and bounded native codecs

**Repository:** `kryvola-spec` · **Dependencies:** KRY-002, KRY-003

**Description:** Specify RFC 8785 JCS UTF-8 encoding for signed plans, approvals, manifests, key contexts, journals and receipts under a strict versioned schema. Encode 64-bit integers and decimal values as specified strings, forbid floats and duplicate/unknown signed fields, reject noncanonical encodings, and preserve string bytes without silent normalization. Define domain-separated BLAKE3 commitments with unambiguous lengths and field ordering. Bind tenant/context, artifact kind, exact bytes/chunk tree, size, codec/library version, scheme, parameter set, key context, shape, model/program hash, session and relevant proof/precision metadata. Define default 1 MiB/maximum 4 MiB transport chunks and an initial 1 GiB artifact test limit without reinterpreting native ciphertexts as Arrow tensors. Native decoding must enforce size and conformance constraints, reject unsupported formats before allocation, and never use unsafe generic deserialization on untrusted bytes.

**Acceptance criteria:**

- Rust, Python and C++ implementations reproduce the same JCS bytes and digest for golden vectors, including 64-bit boundaries; duplicate/unknown signed fields, floats and noncanonical encodings fail.
- Cross-tenant, wrong-key-context, wrong-program, changed-chunk, oversized-shape and unknown-codec fixtures are rejected.
- Specification separates content integrity from uploader identity/authorization and defines temporary upload versus finalized immutable artifact states.

#### KRY-005 — [State-Protocol] feat: specify fenced operation and release transitions

**Repository:** `kryvola-spec` · **Dependencies:** KRY-002, KRY-003, KRY-004

**Description:** Define PostgreSQL-backed operation, logical attempt, lease/fence, physical execution, result selection, artifact pin, event inbox/outbox and release-ledger transitions. Temporal owns DAG progression and retry decisions. Keep application `workflow_epoch` stable across Continue-As-New and ordinary retries; only coordinated recovery/re-admission changes it while preserving logical job admission/disclosure tombstones. A bridge may claim an authorized dispatch and report observations, but cannot create a new logical attempt, accept stale results, or authorize disclosure. An expired lease epoch is irreversibly retired: `EnsureAttempt` returns `ATTEMPT_EXPIRED`, old grants cannot renew/reacquire it, and Temporal alone explicitly chooses a new epoch. Require a live lease for result selection, but keep the committed selection valid after dispatch lease expiry; release checks independent current authorization/cancellation/recovery predicates. Deduplicate release by `(tenant, logical_job_id, output_stage, recipient, disclosure_index)`, independent of attempt/workflow epochs. Define terminal cancellation tombstones, policy revocation, crash reconciliation and the non-atomic SQL-to-Ray submit boundary. Separate pure duplicate-safe FHE/proof execution from single-use MPC preprocessing.

**Acceptance criteria:**

- Model-based concurrency tests produce at most one selected current-fence result, reject renewal/reacquisition of retired epochs, preserve selection after dispatch expiry, and deduplicate disclosure across Continue-As-New/recovery without release after cancellation/revocation wins.
- State traces cover a crash before Ray submit, after submit but before job-ID persistence, after artifact finalization, and after DB commit before event publication.
- A separately documented interactive protocol trace burns uncertain preprocessing and requires a fresh approved session epoch instead of resuming it.

#### KRY-006 — [Benchmark] feat: define reproducible capacity and crypto-cost profiles

**Repository:** `kryvola-platform` · **Dependencies:** KRY-002, KRY-004

**Description:** Build a repeatable Python-driven harness with shaped LAN/WAN conditions, pinned datasets, CPU/GPU inventory, cold/warm runs and machine-readable results. Measure upload/manifest verification, key upload/cache miss, ciphertext expansion, native decode, evaluation, bootstrapping, proof queue/prove/verify, download and owner decrypt separately. Record p50/p95/p99, throughput, peak RSS/VRAM, serialized bytes, failures and cost per completed request. Initial load envelopes are provisional until KRY-008 and KRY-009 produce data.

**Acceptance criteria:**

- A second run from the same lock/profile reproduces input digests and records run variance and hardware/toolchain identifiers.
- Reported end-to-end latency includes queueing, transfer, evidence policy and owner-side work; no stage-only metric is labelled total latency.
- Harness rejects a result missing parameters, accuracy/error budget, security profile, concurrency, warm/cold state or unsuccessful-request counts.

#### KRY-007 — [Supply-Chain] build: pin engine toolchains and resolve license blockers

**Repository:** `kryvola-engines` · **Dependencies:** KRY-001

**Description:** Create independently built OCI images and owner crypto packages using pinned Cargo/CMake/CUDA/Python toolchains as applicable. Review primary upstream licenses, patent conditions, transitive dependencies and intended deployment/distribution rights for TFHE-rs, SP1, OpenFHE and optional libraries; record counsel decisions where necessary. Publish SBOMs and provenance with engine, dependency and verifying-key digests. Do not infer that a permissive software license resolves all patent or service terms, or assert an unverified latest version.

**Acceptance criteria:**

- Two clean builds have compared provenance and any nondeterministic output is explained; published images/packages have verified signatures and SBOMs.
- A machine-readable allowlist blocks unresolved legal dispositions and unpinned engine/proof dependencies from release.
- TFHE and SP1 version candidates are locked and their upgrade procedure reruns codecs, security review, correctness and performance gates.

#### KRY-008 — [Crypto-Feasibility] test: measure TFHE and proof-system feasibility

**Repository:** `kryvola-engines` · **Dependencies:** KRY-004, KRY-006, KRY-007

**Description:** Benchmark a reviewed TFHE-rs integer profile, evaluation-key sizes, compact/native ciphertext representations, expansion, bootstrap counts, memory growth, CPU path and available GPU path. Evaluate zk-pok compatibility and cost independently of inference proofs. For SP1, measure a narrowly defined metadata/commitment guest and select a reviewed proof mode; evaluate trusted-setup/verifying-key handling where required. Witness privacy must be assessed for the exact exported proof mode, and remote prover access must be included in the data classification.

**Acceptance criteria:**

- Published artifacts include exact parameters, correctness/security references, cold/warm distributions and peak memory; unmeasured GPU availability is recorded as unavailable.
- Go/no-go report sets workload/concurrency limits and excludes profiles that violate parameter safety, accuracy or memory envelopes.
- Proof report distinguishes public-journal correctness, private-witness visibility to the prover, exported proof privacy, proving latency, proof size and verifier cost.

#### KRY-009 — [ML-Baseline] feat: freeze a quantized public-model inference fixture

**Repository:** `kryvola-ml` · **Dependencies:** KRY-002, KRY-006

**Description:** Choose a small tabular classifier, integer circuit or similarly bounded model for FHE-Q1 that can be implemented directly in the reviewed TFHE profile. Publish model/program digests, quantization ranges, fixed-point/integer semantics, operator count, input bounds, overflow policy and a plaintext reference. Establish an accuracy/error budget before measuring encrypted outputs. This initial fixture assumes non-confidential weights; private-model claims and unrestricted PyTorch/JAX/ONNX import are outside its support record.

**Acceptance criteria:**

- Repeated reference execution produces identical integer outputs for golden and boundary inputs.
- Out-of-range inputs, unsupported operators and arithmetic overflow are rejected or handled exactly as the approved semantics specify.
- Model card records dataset license, accuracy budget, input/output limits, model visibility and expected cryptographic workload; no baseline benchmark is presented as general ML performance.

#### KRY-010 — [Integration-Harness] build: create reproducible local and cross-repo environments

**Repository:** `kryvola-platform` · **Dependencies:** KRY-003, KRY-004, KRY-005, KRY-007

**Description:** Create a pinned local Compose/kind environment with PostgreSQL, S3-compatible storage, Redpanda, Temporal, Ray, identity fixtures and the fake engine. Add independent repo pipelines, contract checks, release-set integration and artifact capture. Separate owner process and compute identities from the start, including local development. CI must avoid making production cryptographic claims from fake engines, mock proofs, or unreviewed test parameters.

**Acceptance criteria:**

- One documented command creates the environment from a clean supported machine and completes a fake-engine reference-only workflow.
- CI rejects schema incompatibility, dependency direction violations, unsigned/unpinned images and control-plane payload-limit violations.
- Release-set reports identify every repository revision and visibly label fake engines, development keys and mock evidence as non-production.

### M1 — durable owner-to-owner TFHE inference

#### KRY-011 — [Identity] feat: enforce workload and tenant authorization at every boundary

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-002, KRY-003, KRY-010

**Description:** Implement Rust service authentication and policy checks using mTLS with SPIFFE/SPIRE identities or an equivalently reviewed deployment identity. Authorize every artifact read/write, engine session, operation update, result submission and release request against tenant, purpose, operation/fence and expiry. Use scoped short-lived capabilities without embedding credentials or raw object-store URLs in durable events. A valid BLAKE3 digest is never sufficient permission to fetch an artifact.

**Acceptance criteria:**

- Cross-tenant digest guessing, expired capabilities, wrong service identities and replayed result submissions fail with audited denial records.
- Rotation of workload identities does not require changing immutable artifact bytes; revocation takes effect for new access according to the documented cache TTL.
- Logs and Temporal/Redpanda histories contain neither bearer tokens nor private key material; negative credential fixtures are exercised in CI.

#### KRY-012 — [Artifact-Store] feat: implement immutable durable cryptographic artifacts

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-004, KRY-010, KRY-011

**Description:** Implement the Rust artifact service using a pinned S3-compatible client with bounded multipart uploads, per-tenant quotas, conditional finalization, canonical manifests and BLAKE3 verification. Consumers can reference only finalized immutable artifacts. Retain execution-specific outputs until a coordinator selects or rejects them; maintain pins for in-flight workflows, release/audit retention and key contexts. Owner/consumer reads of candidate or selected output bytes require an exact committed `RELEASED` record for that output/recipient; tenant membership and a known digest do not bypass quarantine. Separate purpose-bound internal compute/evidence grants from consumer grants. Authorize native decode only after context, length and digest validation, and quarantine incomplete or corrupt uploads.

**Acceptance criteria:**

- Crashes at each upload/finalize step yield either a verified immutable artifact or an unreachable temporary upload; an object cannot be overwritten under an existing finalized manifest.
- Bit flips, truncated objects, manifest substitutions, oversized declared lengths and concurrent finalization are rejected without unbounded memory allocation; owner/consumer reads before exact committed release fail even within the correct tenant.
- A worker loss after output upload can recover through the object store; GC preserves active pins and eventually removes abandoned uploads and unselected outputs after policy retention.

#### KRY-013 — [TFHE-Owner-Crypto] feat: package owner-side keygen and encryption separately

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-008, KRY-009

**Description:** Build a narrow Rust TFHE-rs owner crypto library with reviewed Python bindings for key generation, input encryption and result decryption; provide a separate worker evaluator package with no private-key loading or decrypt API. Pin serialization and parameter identifiers from the spec. Export public/evaluation material through approved artifact types; distinguish TFHE `ClientKey` from `ServerKey`. Owner-side decrypt accepts only the approved result shape and authorization context, rather than arbitrary uploaded ciphertexts.

**Acceptance criteria:**

- Owner encrypt → evaluator compute → owner decrypt matches KRY-009 fixtures, including signed/range/overflow edge cases.
- Dependency and binary/API inspections confirm the worker package exposes evaluation functionality without a private-key import/decrypt route.
- Loading wrong-version, wrong-parameter or wrong-key-context material fails before evaluation; owner private key files never appear in worker fixtures or container mounts.

#### KRY-014 — [Owner-Agent] feat: enforce local custody and scoped disclosure approvals

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-002, KRY-004, KRY-011, KRY-013

**Description:** Implement a Rust owner-side agent outside the compute trust domain. It stores encrypted private keys, approves a signed plan/session/policy epoch and validates a signed release authorization before bounded decryption to the local authorized consumer. Select and document an OS keystore/HSM integration where available; an encrypted file fallback requires explicit deployment policy. No remote platform command may request unrestricted decryption. Use protected process/core-dump settings and best-effort secret erasure with explicit runtime limitations.

**Acceptance criteria:**

- Ray, Temporal, Redpanda and platform identities cannot reach a private-key endpoint or use an owner decrypt RPC; attempts are denied by network and application policy.
- A changed model/program, operation, output digest, evidence policy, epoch, recipient or expiry invalidates approval/release fixtures.
- Revoked approval, owner unavailability and malformed result ciphertexts fail closed without plaintext/error-detail leakage to compute workers; local recovery is tested with encrypted backup material.

#### KRY-015 — [Owner-SDK] feat: expose asynchronous encrypted inference lifecycle

**Repository:** `kryvola-ml` · **Dependencies:** KRY-003, KRY-012, KRY-013, KRY-014

**Description:** Implement the Python owner SDK for approved key-context registration, encrypt/upload, submit, inspect, cancel, wait for evidence/release and fetch/open through the owner agent. Prefer typed artifact references and bounded generated RPC clients; never serialize Python closures or ciphertext objects into workflow arguments. Report `COMPUTE_SELECTED`, `EVIDENCE_PENDING`, `EVIDENCE_VERIFIED`, `RELEASED` and explicit terminal statuses separately. A cancellation response reports `CANCELLED` only after the coordinator has committed the tombstone/fence; registry unavailability means cancellation pending. Map rate limits and unsupported assurance policies into actionable typed errors.

**Acceptance criteria:**

- SDK contract tests complete the lifecycle against recorded server traces and preserve idempotency across client timeout/retry.
- Instrumented calls prove that ciphertext vectors, secrets and proofs do not enter event payloads, Temporal arguments or Ray task parameters.
- Cancellation pending, `CANCELLED`, `EVIDENCE_PENDING`, rejected integrity policy and unavailable owner agent have distinct documented states; the client never presents a `COMPUTE_SELECTED` but unreleased output as available plaintext.

#### KRY-016 — [TFHE-Compute] feat: implement bounded CPU evaluation engine

**Repository:** `kryvola-engines` · **Dependencies:** KRY-003, KRY-004, KRY-008, KRY-009, KRY-013

**Description:** Implement the Rust TFHE-rs CPU engine behind the Engine API. Fetch authorized immutable input/key/program artifacts, perform conformant safe deserialization, validate shape/parameters and execute only allowlisted programs. Advertise capacity, supported operators, arithmetic semantics and assurance limitations. Write output to an execution-specific immutable artifact and return its reference plus a signed execution claim. Isolate native evaluation from the control endpoint with CPU/memory/deadline limits.

**Acceptance criteria:**

- Golden, boundary and randomized valid inputs match the exact quantized reference under the approved TFHE parameter profile.
- Wrong context, hostile serialized lengths, unsupported programs and requests beyond memory/CPU quota terminate safely without worker or host OOM.
- Engine runs with evaluation material only, produces no plaintext output/logs and reports a confidentiality-only execution claim unless a separately verified integrity relation is available.

#### KRY-017 — [Operation-Registry] feat: implement PostgreSQL fencing and transactional state

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-005, KRY-010, KRY-011, KRY-012

**Description:** Implement the Rust coordinator's operation/attempt/execution APIs and PostgreSQL migrations using a reviewed SQL client. Use transactionally checked state, monotonically advancing attempt fences, lease expiry, idempotency constraints, outbox/inbox tables and artifact pins. Expiry irreversibly retires the epoch; `EnsureAttempt` returns `ATTEMPT_EXPIRED` rather than reacquiring it, and old grants cannot renew it. Store physical execution IDs separately from logical attempts and preserve stable logical disclosure identities across workflow recovery epochs. Result acceptance compares operation status, live dispatch lease, expected fence, plan, key context, policy and manifest digests; immutable candidates do not become selected results merely because a worker finished. A selected artifact remains valid when its dispatch lease later expires; evidence/release use the committed selection and current authorization state.

**Acceptance criteria:**

- Concurrent workers racing to commit different results select at most one current-fence candidate; expired/retired leases cannot be renewed or reacquired and old epochs cannot change it.
- Crash/restart tests at transaction boundaries preserve selected-result, pin, outbox and cancellation invariants; migrations are tested against the supported upgrade path.
- Repeated identical API requests return the recorded outcome, while conflicting idempotency payloads fail; no worker role can write release authorization directly.

#### KRY-018 — [Redpanda-Control] feat: add bounded event outbox and deduplicating consumers

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-003, KRY-011, KRY-017

**Description:** Implement Redpanda publication from the PostgreSQL transactional outbox and deduplicating inbox consumption. Partition operation events consistently, version envelopes, set retention/DLQ policies and reconcile missing notifications from authoritative state. Broker events notify or request an idempotent transition; they do not replace the registry or Temporal history. Kafka transaction semantics must not be described as an atomic transaction with PostgreSQL, object storage, Ray or Temporal.

**Acceptance criteria:**

- Duplicate, delayed, reordered and replayed events produce the same authorized terminal state as a single delivery.
- A publisher crash after send/before marking published and a consumer crash after state commit/before offset commit recover without extra logical attempts or releases.
- Serialized events exceeding 64 KiB are rejected; broker topics, DLQs and audit records contain references and redacted metadata only.

#### KRY-019 — [Temporal-Orchestrator] feat: implement deterministic durable workflow ownership

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-003, KRY-005, KRY-017, KRY-018

**Description:** Use the pinned production Temporal Python SDK for deterministic plan execution, logical retries, cancellation, evidence wait and release decisions. Run external I/O, registry calls and Ray submission/polling in activities; long activities heartbeat bounded references, not payloads. Keep logical job identity and application `workflow_epoch` unchanged across Continue-As-New and ordinary retries; a Temporal run ID is diagnostic only. Distinguish activity retry from creating a new logical compute attempt: retries first reconcile the registry, and `ATTEMPT_EXPIRED` requires an explicit workflow choice of a new attempt epoch rather than transparent renewal. The public cancellation API first commits the coordinator tombstone/fence, then acknowledges `CANCELLED` and requests Temporal cancellation. Use shielded cleanup; administrative termination follows the same fencing path, with reconciliation for unreachable/terminated workflows. Configure timeouts, task queues, history limits/Continue-As-New and workflow versioning. Workflow code contains no nondeterministic network, cryptographic keygen or wall-clock calls outside SDK APIs.

**Acceptance criteria:**

- Replay tests pass across worker restart, compatible code upgrade and Continue-As-New without changing application `workflow_epoch` or logical disclosure identity.
- Lost activity completion reconciles a committed result without relaunch even after dispatch lease expiry; cancellation/administrative termination acknowledge effective cancellation only after fencing and complete shielded/reconciled cleanup.
- History inspection enforces the 32 KiB per-payload/128 KiB aggregate-call application limits for arguments, results, failures and heartbeat details, with no secrets or cryptographic bulk data.

#### KRY-020 — [Ray-Bridge] feat: dispatch fenced reference-only pure executions

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-003, KRY-016, KRY-017, KRY-019

**Description:** Implement a Python bridge with the supported pinned Ray Jobs/actor interfaces. It claims authorized attempts, records execution IDs, submits allowlisted resource-bounded jobs with artifact references, observes status and reports immutable outputs to the registry. Temporal remains the sole retry/DAG authority. Disable implicit Ray task/actor retry for side-effecting operations; explicitly permit duplicate-safe pure FHE execution only. A crash in the SQL-to-Ray gap is reconciled by job metadata where possible; if duplicate pure launches occur, their execution IDs and output namespaces remain distinct.

**Acceptance criteria:**

- Bridge restart before/after submit or before job-ID persistence never releases a stale result; duplicates produce separate artifacts and one current-fence selection.
- Ray task inputs and object-store inspection show bounded metadata/references only, with no ciphertext pickles, private keys or user code.
- Attempting to create a workflow retry, advance the DAG, authorize release or submit an unapproved program through the bridge is denied and audited.

#### KRY-021 — [Planner-Baseline] feat: compile static approved TFHE plans

**Repository:** `kryvola-ml` · **Dependencies:** KRY-002, KRY-003, KRY-004, KRY-009

**Description:** Build a static planner for the baseline graph and approved TFHE operator set. Emit canonical signed plan artifacts with exact model/program, operator semantics, parameters, shapes, key context, resource/memory estimate, evidence policy, leakage and owner consent requirements. Reject unsupported operators, confidential-model requests, trust downgrades and integrity requirements that no engine can satisfy. Defer general compiler imports and protocol cost search until the profile is operationally measured.

**Acceptance criteria:**

- A fixed model/profile produces stable plan bytes and digests consumed by the fake and TFHE engines.
- Negative plans requiring arbitrary nonlinear operators, hidden model weights, unsupported security or inconsistent shapes fail before scheduling.
- Plan explains its quantization/error bounds, model visibility, expected bulk sizes and required evidence; owner-approved and executed digests match.

#### KRY-022 — [Receipts-Release] feat: bind signed execution claims to owner release policy

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-004, KRY-014, KRY-017, KRY-019, KRY-021

**Description:** Implement signed stage receipts and the initial release gate, including identities, plan/model/program hashes, current execution/fence, input/output/key-context commitments, security profile and explicit evidence status. The Temporal release activity submits a scoped authorization request checked transactionally by the coordinator, which commits a unique `RELEASED` record and release authorization for the exact output/recipient. Use stable disclosure identity `(tenant, logical_job_id, output_stage, recipient, disclosure_index)` independently of attempt/workflow epochs; the baseline permits one disclosure index. Artifact reads by owners/consumers require that record; knowing the digest or owning the decryption key is insufficient before release. A selected result can be released after its physical dispatch lease expires if current authorization/cancellation/recovery predicates still permit it. The owner agent verifies authorization independently. Signatures establish provenance only; baseline computation correctness remains an explicitly accepted limitation. A Merkle log client can publish receipt digests without storing sensitive artifacts in the log.

**Acceptance criteria:**

- Tampered receipt fields, swapped output/context, stale fences and worker-signed release requests are rejected.
- Baseline requests requiring an unsupported computation-correctness proof cannot obtain release; consented signature-only requests retain that label end to end.
- Owner agent accepts a current authorized result and rejects canceled, expired, revoked or mismatched authorization; repeated delivery/Continue-As-New/recovery returns the same disclosure record and cannot authorize a different output.

#### KRY-023 — [Platform-Isolation] deploy: separate owner control and compute trust domains

**Repository:** `kryvola-platform` · **Dependencies:** KRY-010, KRY-011, KRY-016, KRY-017, KRY-018, KRY-019, KRY-020

**Description:** Ship local and preproduction manifests for Redpanda, Temporal, PostgreSQL, artifact storage, Rust services and Ray compute with distinct identities, network policies and service accounts. Keep the owner agent outside platform compute credentials. Deny Ray access to owner endpoints, signing/release credentials, DB mutation credentials and broker administration; disable cloud metadata access and privileged containers. Apply native worker memory limits, scratch quotas, restricted egress and secret/core-dump logging controls.

**Acceptance criteria:**

- An instrumented compromised worker cannot read owner keys, platform release credentials, other-tenant artifacts or metadata-service credentials.
- Positive network tests permit only documented artifact, identity and coordinator operations; denied calls generate usable audit signals.
- Deployment inventories show no owner decryption secret mounted, injected, backed up or logged by Ray, Temporal, Redpanda or platform pods.

#### KRY-024 — [End-to-End] test: qualify durable private inference and cancellation

**Repository:** `kryvola-platform` · **Dependencies:** KRY-012, KRY-015, KRY-016, KRY-017, KRY-018, KRY-019, KRY-020, KRY-021, KRY-022, KRY-023

**Description:** Deliver the M1 owner-to-owner TFHE slice using the real CPU engine and release-set lock. Build failure injection around event duplicates, worker death, lost activity completion, stale leases, corrupted artifacts, cancellation/result races, oversize payloads and disconnected owners. Capture assertions from registry, workflow history, artifact pins and owner output rather than requiring a zero-copy data path. Establish the first documented supported envelope; unmet latency goals require capacity/profile adjustment, not invented benchmark success.

**Acceptance criteria:**

- A clean deployment completes encrypted inference with correct owner-decrypted output, bounded histories/events and no secret or plaintext in compute/control logs.
- Each injected failure reaches documented recovery or safe terminal failure, selects at most one fenced result and never releases after a winning cancellation tombstone; API/administrative cancellation acknowledgement cannot precede the registry barrier.
- A versioned gate report includes accuracy, latency/throughput distributions, memory/bytes, key-cache behavior and the confidentiality-only integrity limitation accepted by the baseline profile.

### M2 — asynchronous evidence, Ray resilience and independent optimization tracks

#### KRY-025 — [Evidence-Spec] feat: define exact proof statements and release requirements

**Repository:** `kryvola-spec` · **Dependencies:** KRY-002, KRY-004, KRY-024

**Description:** Specify evidence types separately: ciphertext input validity, authenticated execution claim, approved zkVM relation, plaintext zkML relation and hardware attestation. Define canonical public journals binding tenant/purpose domain, operation/fence/session, program/guest/verifier IDs, model/plan/key-context and exact input/output commitments. Include proof system/mode, security version, validity/expiry and verifier policy. List exactly what each relation proves; a hash of an engine receipt proves receipt processing, not correct FHE evaluation.

**Acceptance criteria:**

- Golden proof envelopes and public journals reject field omission, encoding ambiguity, wrong instance/fence, substituted program/model and proof-type downgrade.
- The approved relation registry states witness visibility, exported proof privacy, trusted setup assumptions and unsupported inference-integrity claims.
- `REQUIRED_BEFORE_RELEASE`, `OPTIONAL_LATER` and `NONE` policy fixtures yield their specified release decisions, and unsupported required relations are rejected before compute where possible.

#### KRY-026 — [Input-Validity] feat: verify supported TFHE compact-input proofs

**Repository:** `kryvola-engines` · **Dependencies:** KRY-008, KRY-016, KRY-025

**Description:** Integrate the pinned TFHE-rs zk-pok/compact-ciphertext verification path only for documented compatible parameters and serialization versions. Bind proof verification to exact ciphertext bytes, range/shape, key context and required context metadata; verify before expansion/evaluation under bounded memory. Pin the approved `CompactPkeCrs` digest, version, parameters and setup provenance in the key/profile registry; reject caller-supplied/unapproved CRS material. This is a separate CRS lifecycle from any SP1 setup. Keep this distinct from an inference proof or generic CKKS range proof. If the chosen release does not support the approved baseline profile, report unsupported and retain fail-closed behavior for requests requiring input validity.

**Acceptance criteria:**

- Valid vectors pass and corrupted proof, swapped ciphertext/key/context, unapproved/wrong CRS, invalid range and unsupported compact-list version vectors fail before evaluation.
- Benchmark report records proof bytes, owner proving cost, verifier time, expansion time and peak memory under adversarial input limits.
- Capability/receipt labels claim input validity only for verified supported inputs and never claim model correctness or FHE execution integrity.

#### KRY-027 — [SP1-Prover] feat: implement reviewed narrow zkVM evidence guests

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-008, KRY-025

**Description:** Implement an SP1 guest and host for one reviewed relation, such as deterministic processing of a canonical bounded manifest or public aggregation transcript. Pin guest ELF/hash, verifying key, proof-mode identifiers and journal ABI. Use a reviewed zero-knowledge mode for exported proofs of private witnesses, including required trusted-setup/key provenance; public-data-only STARK profiles must explicitly disclaim witness privacy. Dev/mock proofs and raw execution traces are not production evidence. Do not attempt to claim that the guest proves arbitrary TFHE evaluation or infer input/output ciphertext linkage from unrelated plaintext proofs.

**Acceptance criteria:**

- Independent verifier accepts correct production-mode fixtures and rejects wrong guest/verifying key, altered journal, invalid proof, dev/mock proof and unsupported proof mode.
- A relation-specific review states exactly which bytes are public, what the prover sees, what the verifier learns and whether any trusted setup is assumed.
- Measured prove/verify distributions, proof size and memory are stored under the release lock, and the capability declares the narrow supported relation only.

#### KRY-028 — [Prover-Scheduling] feat: offload asynchronous evidence through isolated pools

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-017, KRY-020, KRY-025, KRY-027

**Description:** Add separate Ray resource classes/task queues for evidence generation, with admission control, artifact references, quotas, deadlines and cancellation. The Temporal evidence stage submits pure proof jobs through the same fencing discipline as evaluation. Ordinary platform provers receive public metadata/ciphertext witnesses only; owner-private witness proofs require an owner-controlled or independently approved domain. Cache only verified proofs keyed by exact relation, guest/verifier/mode, parameter/context, canonical journal and all witness/input commitments; new nonces/epochs require new bindings.

**Acceptance criteria:**

- Slow or unavailable provers do not block scheduling of unrelated compute; queue limits and `REQUIRED_BEFORE_RELEASE` deadlines produce explicit `EVIDENCE_PENDING`/failed states.
- Duplicate proof launches produce immutable execution-specific outputs and at most one verified selected evidence artifact.
- Cache tests reject wrong journal, key/version, context, changed input/output commitment or epoch; Ray inputs/logs expose no owner-private witness or key material.

#### KRY-029 — [Evidence-Release] feat: verify evidence and enforce fail-closed release gates

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-022, KRY-025, KRY-028

**Description:** Implement an independent proof verification service/activity with pinned supported verifier implementations and bounded inputs. Verify the exact public journal against the committed selected result and policy, then record a transactional verdict reference. Temporal waits for all required verdicts, owner approvals and current revocation/cancellation/recovery state before requesting release; physical dispatch lease expiry after selection is not evidence failure. `OPTIONAL_LATER` is a separate owner-approved profile that can release before proof completion; later failures are auditable incidents, not silently upgraded assurances. Verification failure must not trigger a weaker execution tier automatically.

**Acceptance criteria:**

- Incorrect proof, wrong output/model/context, unsupported required relation and expired verifier policy prevent release under `REQUIRED_BEFORE_RELEASE`, including timeout and retry cases.
- `OPTIONAL_LATER` receipt/status fixtures disclose release-before-verification, and delayed proof failure creates a tracked incident without rewriting the original assurance claim.
- Cancellation/revocation racing with successful verification cannot authorize a stale output; owner agent validates the same evidence-policy and result bindings.

#### KRY-030 — [RISC-Zero] feat: add an optional independent zkVM conformance backend

**Repository:** `kryvola-engines` · **Dependencies:** KRY-025, KRY-027

**Description:** Implement the same approved relation behind a RISC Zero host/guest adapter as an optional alternative, not a proof-byte interchangeability claim. Pin image/method IDs, receipt kind, verifier/security version and any zero-knowledge/compression assumptions. Reject development/fake receipts. Maintain system-specific verification with one shared semantic journal contract; benchmark separately and permit policy to restrict the accepted backend.

**Acceptance criteria:**

- Both backends produce the same canonical semantic result on shared fixtures, while each verifier rejects receipts from the wrong system/image/kind.
- Dev mode, invalid assumptions/claims, revoked verifier versions and tampered journals fail production verification.
- Benchmark and review record show the backend's supported proof modes and trust assumptions; disabling it leaves the SP1 path functional.

#### KRY-031 — [TFHE-GPU] perf: add measured GPU evaluation and scoped key caching

**Repository:** `kryvola-engines` · **Dependencies:** KRY-008, KRY-016, KRY-024

**Description:** Add the reviewed TFHE-rs GPU backend in a separate image/resource profile. Reserve VRAM for evaluation keys, ciphertext expansion, bootstrapping and output buffers before dispatch; cap concurrency and model dimensions. Cache evaluation material by authorized tenant/key-context/version/device with bounded residency and reference counts; cache membership must not grant authorization. Measure host/device transfers and any IPC experiment explicitly. Preserve CPU support when GPU is absent or admission fails; policy controls whether fallback is permitted.

**Acceptance criteria:**

- CPU and GPU outputs match the quantized reference for all approved fixtures under identical semantics/parameters.
- Overcommit, cache eviction, GPU reset and malformed payloads cause controlled retry/failure without host or device OOM and without cross-tenant cache access.
- Published cold/warm latency, peak VRAM, transfer bytes and throughput demonstrate whether the GPU profile is useful; no minimum speedup is assumed in advance.

#### KRY-032 — [Bulk-Transport] perf: add bounded optional Arrow Flight transfers

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-004, KRY-012, KRY-024

**Description:** Implement an optional Arrow Flight/gRPC bulk service carrying opaque library-native chunks plus approved manifest metadata, default 1 MiB and maximum 4 MiB per chunk. Initial limits are one chunk row per batch, at most 5 MiB encoded and decoded batch/message bytes including at most 64 KiB metadata, an 8 MiB in-flight window per stream and eight concurrent streams per worker; reserve aggregate buffer memory and reject unbounded compression/decompression. Use mTLS authorization, bounded queues, explicitly configured gRPC/Arrow allocation limits, flow control and resumable verified chunk fetch where the format permits it. Artifacts remain durably finalized before a selected result is referenced; direct streaming cannot remove recovery storage or bypass owner/consumer output quarantine before committed release. Benchmark against bounded S3 multipart/range transfer and use Flight only for supported beneficial paths. Do not claim Arrow alone eliminates native decode, TLS, process or GPU copies.

**Acceptance criteria:**

- Multi-megabyte payload tests enforce row/frame/metadata/window/stream caps and bounded aggregate RSS under slow consumers, concurrent streams, cancellation, decompression bombs and deliberately oversized metadata/chunks.
- Changed/truncated/out-of-order chunks and unauthorized tickets fail without exposing partially verified native data to evaluation.
- Benchmark includes bytes copied, allocation peaks, time to first usable data, end-to-end completion and recovery behavior; S3-only execution remains conformant.

#### KRY-033 — [CKKS-Compute] feat: implement an independent bounded OpenFHE profile

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-024, KRY-025

**Description:** Package a C++ OpenFHE engine and distinct owner-side crypto bindings for one fixed CKKS linear or polynomial workload. Pin ring/security parameters, packing layout, scales, modulus chain, depth, bootstrap policy and numerical tolerance. Worker performs evaluation only; private keys remain owner-side. Use approved bounded native serialization and context manifests. This is an independent protocol profile: OpenFHE internal scheme switching does not imply interoperability with TFHE-rs ciphertexts or keys.

**Acceptance criteria:**

- Decrypted results meet a preregistered numerical error bound against the fixed reference, including near-boundary values and maximum supported depth.
- Invalid scales/levels, context mismatch, unsupported depth and oversized serialized inputs fail safely before evaluation.
- Capability forbids CKKS↔TFHE-rs conversion and unsupported integrity claims; worker packaging has no owner private key or generic decryption service.

#### KRY-034 — [CKKS-Policy] feat: gate approximate outputs and owner decryption queries

**Repository:** `kryvola-ml` · **Dependencies:** KRY-014, KRY-021, KRY-033

**Description:** Add CKKS-specific plan validation and owner output policy. Specify approved output slots, masking/sanitization, precision budget, allowable release count, recipient, result provenance and failure feedback. Address malicious evaluator chosen-ciphertext/decryption-oracle risks: an owner must not decrypt arbitrary worker-supplied ciphertexts or expose detailed decryption errors. A signature by an untrusted evaluator alone does not solve this problem; the supported profile must record an independently reviewed mitigation/assumption or remain experimental and fail production admission.

**Acceptance criteria:**

- Planner rejects an insufficient modulus/precision budget, unmasked extra slots, unauthorized result shape and unapproved repeated/adaptive decrypt queries.
- Adversarial output fixtures cannot obtain plaintext or detailed decrypt errors through platform endpoints; owner opens only approved authorized outputs under the documented mitigation.
- Error/accuracy reports and release receipts disclose approximation limits and CKKS-specific malicious-compute limitations; no unsupported production profile is enabled.

#### KRY-035 — [Ray-Resilience] test: qualify memory backpressure and evidence failure recovery

**Repository:** `kryvola-platform` · **Dependencies:** KRY-024, KRY-028, KRY-029

**Description:** Extend the fault/load harness to Ray head/worker loss, bridge partition, stale lease, delayed object finalization, proof timeout, incorrect proof, quota exhaustion, large-payload OOM attempts and cancellation during evidence generation. Exercise CPU baseline and each optional optimized profile that is proposed for release. Publish configurable load profiles with explicit admission/backlog/concurrency bounds and an overload policy; benchmarks measure system saturation rather than hiding failures in latency statistics.

**Acceptance criteria:**

- Ray head loss and ambiguous dispatch recover or terminate safely from Temporal/registry/artifacts without a competing DAG owner or stale release.
- Each declared load envelope has measured p95/p99, error rate, queue age, RSS/VRAM and rejected-request counts, and overload yields bounded backpressure rather than unbounded queues.
- Required invalid/missing evidence, key-exfiltration attempts, revocation and cancellation races cannot produce owner plaintext release; optional profiles have individual pass/fail records.

### M3 — constrained protocol composition and multi-owner profiles

#### KRY-036 — [Composition-Spec] feat: model protocol transitions and trust constraints

**Repository:** `kryvola-spec` · **Dependencies:** KRY-002, KRY-025, KRY-035

**Description:** Extend plan/capability contracts with participant rosters, non-collusion thresholds, per-party artifacts, authorized disclosure, preprocessing/session epochs, conversion edges, numerical bounds and leakage composition. A conversion is an explicit reviewed protocol, never a serialization cast or automatic shared-memory handoff. Make trust topology, model visibility and output privacy constraints machine-checkable before cost optimization. Active-secure MPC gives its stated guarantees to its named participants; it is not automatically transferable public evidence for a nonparticipating consumer, which must trust those participants or require a separate approved proof. Record that the platform cannot manufacture independent trust domains merely by deploying two pods.

**Acceptance criteria:**

- Invalid transitions between incompatible keys, schemes, parties, security models and privacy budgets fail schema/policy validation.
- A plan's composed leakage report includes protocol-specific set sizes, intersections, access patterns, timing/size and recipient disclosures.
- Test vectors show that a cheaper but weaker protocol/conversion is rejected when owner constraints require stronger assumptions.

#### KRY-037 — [Cost-Planner] feat: choose only approved routes using measured total cost

**Repository:** `kryvola-ml` · **Dependencies:** KRY-006, KRY-021, KRY-035, KRY-036

**Description:** Build a constrained planner over approved operator and conversion edges. Use versioned measured estimates for transfer/expansion, key-cache misses, queueing, computation, network rounds, preprocessing, proof generation/verification and owner release. Hard constraints cover trust, memory, precision, latency class and evidence availability before optimizing cost. Record confidence intervals and out-of-distribution rejection; never downgrade trust because a queue is long. Static baseline remains a valid fallback when explicitly policy-allowed.

**Acceptance criteria:**

- Fixture graphs select the cheapest feasible route under known costs and reject all infeasible graphs with a reasoned diagnostic.
- Holdout benchmark workloads report prediction error and route regret against approved single-protocol baselines; no universal speedup is required.
- Stale/missing cost data, unsupported conversion and unavailable required proof return a safe static route or explicit rejection without inventing estimates.

#### KRY-038 — [MPC-Compute] feat: integrate one explicitly scoped SPU protocol

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-036

**Description:** Integrate a pinned SecretFlow SPU protocol for one bounded multi-party workload; prefer a clearly documented three-party replicated-sharing baseline if its threat assumptions meet the intended deployment. Declare actual semi-honest/malicious and honest-majority assumptions from the selected implementation. Each participant runs in an independently administered trust domain with dedicated authenticated session links and per-party artifacts; do not place all shares in one Ray cluster, broker, object-store role or coordinator. Review floating/fixed-point semantics, overflow, precision and reconstruction recipients. Even active-secure execution does not become a publicly verifiable computation proof: an external consumer needs explicit trust in named participants or a separately approved proof relation.

**Acceptance criteria:**

- Multi-party golden and boundary outputs match the plaintext reference within the preregistered fixed-point/error bound.
- A central fabric/Ray/storage identity cannot fetch enough shares to reconstruct protected inputs; deployment roster reflects actual independent administrators.
- Party loss, malformed messages and declared threat-model violations terminate according to the selected protocol; receipts state participant trust and reject attempts to use them as transferable public correctness evidence without a separate proof.

#### KRY-039 — [MPC-Sessions] feat: enforce one-use preprocessing and authorized session epochs

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-005, KRY-017, KRY-019, KRY-036, KRY-038

**Description:** Implement a session coordinator for roster/nonce agreement, per-party consent, preprocessing reservation and consumption, deadlines and abort. Use CAS to reserve each triple/OT/FSS material set for exactly one physical execution/session before protocol traffic begins. Disable automatic Ray retries of side effects; an ambiguous launch/crash burns reserved material and starts a new owner-authorized epoch. Temporal may retry orchestration but must never replay interactive randomness or reconstruct secret shares centrally.

**Acceptance criteria:**

- Concurrent duplicate start requests establish one physical interactive session or abort; no preprocessing ID is consumed by two execution IDs.
- Crashes before/after reservation, mid-round and before completion mark material spent/uncertain and require fresh material/nonce/epoch on restart.
- Stale parties, old roster approvals and post-cancel messages cannot resume a tombstoned session or authorize reconstruction/release.

#### KRY-040 — [PSI-Compute] feat: expose reviewed alignment with explicit leakage

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-036

**Description:** Integrate one reviewed PSI implementation/protocol, such as a pinned SecretFlow PSI mode, with a precisely named adversary model. Add a malicious-secure alternative such as an appropriate reviewed volePSI mode only after separate validation; library name alone is not evidence of malicious security. Specify normalization, duplicates, labels, set/cardinality limits, ordering, intersection recipients and output artifact ownership. PSI is an interactive session, not a broadcast of hashed identifiers through Redpanda.

**Acceptance criteria:**

- Known sets, duplicates, empty/disjoint/full-overlap cases and normalization adversaries produce the specified intersection/multiplicity behavior.
- Oversized inputs, malicious messages and unsupported security requests fail under the declared protocol's guarantees and bounded resources.
- Leakage report names both set sizes and any revealed intersection/cardinality/order; no claim says PSI reveals nothing beyond an intersection unless that exact protocol/profile supports it.

#### KRY-041 — [PSI-MPC] feat: preserve alignment privacy into secret-shared computation

**Repository:** `kryvola-ml` · **Dependencies:** KRY-036, KRY-038, KRY-039, KRY-040

**Description:** Build an explicit PSI-to-MPC alignment pipeline that maps approved entity matches to row order and per-party shares without a central gather of plaintext rows or hidden identifier leakage. Define whether parties learn intersection membership, order and multiplicity; reject a request requiring hidden membership if the selected PSI protocol reveals it. Bind alignment transcript/snapshot, model and roster digests into the downstream plan and session. Test data-domain changes between alignment and evaluation.

**Acceptance criteria:**

- Two independently held datasets produce the expected aligned computation under permutations, duplicate IDs and missing records.
- Fabric/Ray coordinator artifacts do not contain plaintext aligned rows or unapproved intersection identifiers.
- A changed dataset snapshot, alignment mapping, party roster or session epoch invalidates downstream execution approval and receipt binding.

#### KRY-042 — [DP-Release] feat: add reviewed privacy accounting and atomic budget consumption

**Repository:** `kryvola-ml` · **Dependencies:** KRY-017, KRY-022, KRY-036

**Description:** Implement one differential privacy mechanism and accountant using reviewed OpenDP or Opacus APIs appropriate to the workload. Specify neighboring-dataset relation, contribution bounds, clipping, epsilon/delta, composition, randomness custody and authorized release unit. The durable privacy ledger is enforced with coordinator transactions: retrying compute/evidence must not grant extra releases, and a fresh released statistic consumes budget. If noise is added to plaintext in an approved domain, declare that domain; otherwise require a separately reviewed MPC/HE mechanism. Do not send plaintext to ordinary Ray to add DP noise.

**Acceptance criteria:**

- Independent accountant fixtures reproduce the reported budget and reject invalid bounds, depleted budget and unsupported composition.
- Concurrent release/retry/cancel tests consume the specified budget at most once per authorized disclosure and never authorize an additional adaptive release without budget.
- Logs and receipts expose parameters/accounting status without revealing secret noise seeds; a fixed-seed test mode is impossible in production profiles.

#### KRY-043 — [Protocol-Conversion] research: admit only reviewed executable conversion edges

**Repository:** `kryvola-engines` · **Dependencies:** KRY-033, KRY-036, KRY-038

**Description:** Investigate one narrowly scoped conversion with a full security and numerical argument, explicit interaction/owner involvement, supported parameters, key ownership and benchmark. Treat OpenFHE-internal scheme switching, CKKS-to-shares and any TFHE-rs conversion as different protocols; shared RLWE terminology does not establish interoperability. Conversion remains disabled by default until an implementation and independent review bind input/output representations and quantify any decryption, approximation or disclosure. A no-go finding is a valid research outcome, not permission to use plaintext fallback.

**Acceptance criteria:**

- ADR provides implementation evidence or a documented no-go, with explicit library compatibility and trust/leakage assumptions.
- Any admitted edge passes boundary/randomized plaintext-equivalence tests and rejects wrong keys, levels, parameter sets and shapes.
- Planner cannot use the edge without a reviewed capability/profile flag; unsupported conversion requests fail rather than silently decrypt or re-encrypt centrally.

#### KRY-044 — [Private-Training] feat: add a bounded optional SPU training profile

**Repository:** `kryvola-ml` · **Dependencies:** KRY-038, KRY-039, KRY-041, KRY-042

**Description:** Add one JAX/SPU training graph with a fixed optimizer, quantization/fixed-point rules, iteration budget, checkpoint/restart contract and optional approved DP-SGD path. Declare all released metrics, model parameters and checkpoints; private computation alone does not provide output privacy. Keep checkpoints per party/domain and bind them to model, data snapshot and session epoch. Restarting after ambiguity must not reuse consumed protocol randomness or reset a privacy ledger.

**Acceptance criteria:**

- Reproducible training reaches the preregistered accuracy/error envelope against the corresponding plaintext reference under specified seeds/test conditions.
- Checkpoint restore rejects mismatched dataset/roster/epoch and preserves consumed preprocessing and DP budgets.
- Intermediate metrics/checkpoints are disclosed only to approved recipients; final model card states DP status and residual model-inversion/membership risks.

#### KRY-045 — [Multi-Owner-Qualification] test: validate separate trust domains and abort semantics

**Repository:** `kryvola-platform` · **Dependencies:** KRY-037, KRY-039, KRY-041, KRY-042

**Description:** Deploy one approved multi-owner profile across independently administered identities, storage credentials and compute domains. Exercise party crash, coordinator partition, duplicate dispatch, delayed rounds, stale roster, owner revocation and preprocessing exhaustion. Validate observability using public metadata only and document network-round sensitivity. Private training KRY-044 and conversion KRY-043 are separately qualified only if selected for the release.

**Acceptance criteria:**

- Authorized owners complete the approved PSI/MPC slice with the expected output and declared leakage; central identities cannot reconstruct inputs from accessible shares.
- Failure matrix demonstrates safe abort/fresh epoch without randomness reuse or post-revocation output release.
- Qualification record identifies real administrative independence, threat assumptions, capacity/network envelope and optional excluded extensions; no deployment test is presented as proof of non-collusion.

### M4 — independently gated optional extensions

#### KRY-046 — [PIR-Compute] feat: evaluate and package one reviewed retrieval protocol

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-036

**Description:** Evaluate YPIR or another documented single-server PIR implementation for an immutable, public/non-secret table snapshot. Review protocol assumptions, upstream research maturity, database preprocessing/hints, update cost, query size and response bounds. Implement a bounded Engine API adapter only after the selected release passes legal/security review. Bind each query/response to database snapshot and parameters; do not imply PIR alone hides table contents, access frequency or query timing.

**Acceptance criteria:**

- Client obtains the correct record across random indexes and table boundaries; mismatched snapshot and malformed queries fail safely.
- Report measures preprocessing/update time, client state, network bytes, p95 latency, throughput and memory across declared table sizes.
- Profile cites an independently reviewed query-privacy argument and clearly labels research-only status when review or operational support is incomplete.

#### KRY-047 — [PIR-Client] feat: integrate bounded private retrieval with explicit metadata leakage

**Repository:** `kryvola-ml` · **Dependencies:** KRY-015, KRY-036, KRY-046

**Description:** Add a typed PIR client and one feature/embedding lookup example against approved snapshots. Separate cryptographic index privacy from size/timing leakage, repeated-query correlation and application-level response handling. Implement request size limits and policy-controlled batching/padding where justified. Do not represent an absence of query identifiers in logs as proof of PIR security, or turn exact-index PIR into an unreviewed private nearest-neighbor/RAG claim.

**Acceptance criteria:**

- Retrieval fixtures verify returned record integrity/snapshot and produce the correct downstream approved input.
- SDK and server telemetry contain no explicit query index; documentation separately states remaining timing, frequency, snapshot and size leakage.
- Unsupported dynamic tables, vector-search semantics and client-hint assumptions are rejected unless their own profile is approved and benchmarked.

#### KRY-048 — [ABE-Envelope] feat: add optional reviewed attribute-based artifact wrapping

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-007, KRY-011, KRY-012, KRY-014

**Description:** Evaluate Covercrypt or an alternative against actual policy expressiveness, license/patent terms and security review, then add envelope encryption for approved plaintext-bearing owner/recipient artifacts. Encrypt bulk data with an approved AEAD; ABE wraps only a random data-encryption key. Define authority custody, policy/attribute epochs, recipient binding and rewrap/re-encrypt semantics. This extension does not grant platform workers private TFHE keys, imply threshold ABE issuance from secret-sharing backups, or erase plaintext/keys already received by revoked consumers.

**Acceptance criteria:**

- Allowed recipients open approved artifacts and wrong attributes, stale epochs, wrong recipient/context and modified AEAD metadata fail.
- Revocation tests distinguish denial of future key issuance/access from previously cached plaintext/keys; the documented limitation remains visible.
- Master-key custody and recovery tests do not claim threshold issuance unless the selected implementation independently supports and passes that protocol's review.

#### KRY-049 — [Threshold-Custody] research: integrate an independently approved threshold service

**Repository:** `kryvola-engines` · **Dependencies:** KRY-002, KRY-007, KRY-036, KRY-045

**Description:** Select one supported threshold key-generation/decryption profile, for example a reviewed OpenFHE multiparty mode or a separately evaluated upstream Zama KMS integration for TFHE. Do not infer threshold support from single-key TFHE-rs APIs. Review actual quorum/collusion assumptions, authentication, side-channel exposure, DKG/resharing, availability and selective-failure/decryption-oracle behavior. Place committee domains behind an isolated authenticated release gateway enforcing owner-approved result/epoch/recipient policy; no Ray connectivity or generic cloud decrypt RPC. Upstream defaults without internal gRPC authentication or direct side-channel mitigations must be treated as deployment gaps to close, not inherited guarantees.

**Acceptance criteria:**

- Reviewed DKG/threshold tests demonstrate the stated quorum and allowed recovery/rotation behavior; fewer-than-threshold parties and unauthorized release requests cannot decrypt.
- Network and application tests deny Ray, broker, Temporal and platform identities direct share/decryption access; committee private shares never enter common storage or CI artifacts.
- Independent review accepts the gateway, release binding, side-channel assumptions and protocol-specific availability tradeoffs before the capability can be enabled.

#### KRY-050 — [TEE-Attestation] feat: gate an optional confidential hardware execution tier

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-002, KRY-011, KRY-022, KRY-029

**Description:** Implement a hardware-specific attestation verifier and release policy for a selected supported confidential CPU/GPU deployment. Bind nonce freshness, measured image/configuration, workload identity, channel public key and policy version; validate endorsements/revocation according to the actual vendor chain. Secret provisioning is owner-to-approved enclave or independently reviewed key domain only, never to ordinary Ray workers. Declare hardware/firmware/vendor, runtime, side-channel and rollback trust explicitly; attestation is not a cryptographic proof of arbitrary inference correctness.

**Acceptance criteria:**

- Wrong measurement, stale nonce, expired/revoked endorsement and channel-binding substitution prevent provisioning and result release.
- Owner approves the explicit hardware-trust profile; a request prohibiting hardware trust cannot route to the TEE tier.
- Test evidence shows secrets are provisioned only into the approved boundary and identifies unresolved side-channel/rollback limits; unsupported hardware remains disabled.

#### KRY-051 — [ZKML-Engine] research: support a separately scoped owner-generated model proof

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-025, KRY-029

**Description:** Evaluate EZKL, DeepProve or another reviewed zkML stack for a fixed quantized plaintext-inference relation. Keep private inputs/model witnesses inside the owner or independently approved proving domain; zero knowledge for the verifier does not hide witnesses from an outsourced prover. Bind model/program digest, numeric semantics, input commitment and output in the journal. A proof of a separate plaintext run is not evidence that a cloud FHE output encrypts that result without an additional reviewed linkage relation.

**Acceptance criteria:**

- Correct fixed-model proofs verify; wrong model, changed quantization, mismatched input commitment/output and unsupported proof mode fail.
- Measurement includes compiler/setup/proving memory and latency, verifier cost, proof size and any trusted-setup assumptions.
- Capability/report names the exact proved relation and witness trust domain, and refuses to satisfy FHE-evaluation integrity policy without an approved linkage proof.

#### KRY-052 — [GPU-FSS] research: qualify a bounded dealer-assisted protocol

**Repository:** `kryvola-engines` · **Dependencies:** KRY-007, KRY-036, KRY-039, KRY-045

**Description:** Evaluate one SIGMA/Orca-class or comparable GPU FSS implementation as an isolated research track. Pin code/data/model and record exact dealer/preprocessing, non-collusion, online/offline and malicious/semi-honest assumptions. Provision single-use correlated randomness only to the intended parties, with separate dealer identity and no central share reconstruction. Published third-party transformer timings are hypotheses to reproduce, not Kryvola targets or a justification for production deployment.

**Acceptance criteria:**

- A fixed supported workload matches the plaintext numeric reference within its declared bound under the protocol's real assumptions.
- Dealer failure, uncertain launch, duplicate session and GPU reset tests consume/burn preprocessing safely and require fresh epochs.
- Report separates offline setup/preprocessing, online latency, communication, memory and dealer trust; incomplete independent review keeps the feature research-only.

#### KRY-053 — [Extension-Gates] test: publish per-feature support and go-no-go records

**Repository:** `kryvola-platform` · **Dependencies:** KRY-035

**Description:** Create a qualification framework for PIR, ABE, threshold custody, TEE, zkML and GPU FSS. Each selected extension must supply its KRY-046–052 artifacts as applicable, a reviewed threat model, legal disposition, conformance/fault tests, measured envelope, key/witness placement and operational owner. Permit explicit exclusion or deferral without weakening baseline gates. No experimental image may be reachable through production planner capabilities simply because it is deployed.

**Acceptance criteria:**

- A feature without a signed support record is denied production admission and omitted from planner capabilities.
- Enabled extensions have a machine-checkable record tying their issue acceptance evidence to the exact release lock; deferred features have clear reasons and no advertised guarantee.
- Baseline release-set validation passes with every extension disabled; enabling one extension reruns its relevant end-to-end/security gates only.

### M5 — security review, disaster recovery and supported-profile GA

#### KRY-054 — [Compatibility] feat: enforce coordinated contract and crypto upgrade policy

**Repository:** `kryvola-spec` · **Dependencies:** KRY-025, KRY-029, KRY-035

**Description:** Publish a compatibility/security-version matrix for schemas, canonical codecs, native ciphertext formats, parameters, engine images, guests/verifying keys, proof modes and owner packages. Define additive change rules, deprecation windows, cryptographic emergency revocation and migration of pending operations. An upstream upgrade is a reviewed lock change with conformance/benchmark reruns; never accept unknown native formats or proof versions through optimistic decoding. Breaking changes need an ADR and versioned migration.

**Acceptance criteria:**

- Supported old/new release pairs pass fixture/replay tests; unsupported combinations fail with a precise compatibility error before native decoding or release.
- Revoked engine/guest/verifier versions cannot start new work or authorize pending result release according to the documented incident policy.
- Upgrade qualification ties correctness/security/performance evidence to the new lock and preserves recoverability of permitted in-flight operations.

#### KRY-055 — [Production-SRE] deploy: establish capacity isolation observability and SLOs

**Repository:** `kryvola-platform` · **Dependencies:** KRY-023, KRY-035, KRY-054

**Description:** Deploy production-like HA/control-service topology and benchmark-derived resource pools for the supported profiles. Define availability and latency SLOs by execution/evidence class, capacity/admission envelopes, per-tenant quotas, autoscaling inputs, queue-age limits and overload responses. Monitor registry/Temporal reconciliation lag, broker outbox lag, artifact storage errors/pins, Ray resource pressure, proof backlog, owner release errors and invalid-evidence rates. Telemetry contains public identifiers/redacted metadata only.

**Acceptance criteria:**

- Declared load and noisy-neighbor tests satisfy the accepted capacity/error/SLO envelope or produce a reviewed smaller support envelope before release.
- Node/service failover and exhausted CPU/VRAM/storage/proof quotas yield bounded backlog and documented errors without trust downgrade or cross-tenant starvation.
- Alerts fire with tested runbooks for stuck attempts, lost notifications, invalid proofs, memory pressure and release-policy denials; no alert payload contains keys or plaintext.

#### KRY-056 — [Disaster-Recovery] test: restore durable state without resurrecting authorization

**Repository:** `kryvola-platform` · **Dependencies:** KRY-017, KRY-019, KRY-029, KRY-055

**Description:** Define backup/restore and RPO/RTO for PostgreSQL, Temporal history, object artifacts, release/revocation ledger, broker offsets/events, identity/signing material and owner-held backups. Specify a consistent checkpoint or reconciliation/quarantine procedure across systems; Redpanda is not a substitute for registry/history. After restore, rotate/advance deployment authorization epochs, fence old operations, and preserve logical job/disclosure tombstones when application `workflow_epoch` changes through coordinated recovery. Reconcile finalized artifacts, fences and independently retained audit/owner release watermarks. Ambiguous jobs whose external disclosure, revocation, preprocessing or DP-budget effects may be newer than the restored state remain suspended until independent reconciliation; fresh approval alone cannot erase a possibly spent effect. GC must not delete pinned recovery data or revive obsolete release permission.

**Acceptance criteria:**

- A destructive preproduction restore drill recovers a documented checkpoint and measured RPO/RTO; every recovered operation has a resolved or quarantined status.
- Canceled/revoked operations, spent preprocessing, consumed DP budgets and stale release authorizations do not resurrect after older snapshot restore/event replay; stable disclosure identities still deduplicate across recovery epochs.
- Disconnected owner/committee domains or ambiguous effects suspend release until independent audit/owner-watermark reconciliation establishes freshness; orphan cleanup preserves retained audit/recovery references.

#### KRY-057 — [Revocation-Release] feat: harden epoch freshness and authorized output delivery

**Repository:** `kryvola-fabric` · **Dependencies:** KRY-014, KRY-017, KRY-022, KRY-029, KRY-054

**Description:** Finalize cancellation, key-context retirement, policy/verifier revocation, owner consent withdrawal and output delivery semantics. Use transactionally checked current authorization/cancellation/recovery epochs and a durable unique release ledger keyed by stable logical disclosure identity, independently of attempt/workflow epochs; bind delivery to one approved recipient/output/evidence record. Keep committed selected outputs valid after dispatch lease expiry while rejecting stale new finalization. The API commits cancellation tombstone/fence before acknowledging `CANCELLED`; administrative termination uses the same barrier with shielded/reconciled cleanup. Replay protection and idempotency prevent changed-output reuse; they cannot erase a result already legitimately decrypted. Integrate privacy-ledger checks if KRY-042 is selected. Keep offline owner decisions fail closed when freshness cannot be established.

**Acceptance criteria:**

- Deterministic race tests cover cancel versus result commit, revocation versus evidence verification, release versus expiry and concurrent repeated deliveries with no unauthorized outcome.
- Retired keys/policies/verifiers cannot authorize new releases, while already disclosed information is accurately documented as irrevocable.
- Owner agent refuses replayed/stale/other-recipient authorization and accepts a permitted idempotent redelivery of the same result only under the documented policy.

#### KRY-058 — [Security-Audit] test: complete independent supported-profile review

**Repository:** `kryvola-platform` · **Dependencies:** KRY-035, KRY-054, KRY-055, KRY-056, KRY-057

**Description:** Assemble a review package for an independent distributed-systems/cryptography assessment covering approved parameters/relations, canonical formats/native decoders, workflow/registry races, owner decryption policy, key/witness isolation, side channels, protocol assumptions and supply chain. Include fuzzing, dependency/CVE/license checks, sandbox escape/exfiltration attempts, log/core-dump inspection and operator runbooks. Review only selected supported extensions under KRY-053; unselected research code must remain unreachable. GA requires disposition of findings against the exact support claims, not merely a list of triaged issues.

**Acceptance criteria:**

- External report identifies tested release/profile digests; all critical/high findings affecting supported claims are fixed and retested or the affected profile is removed from GA.
- Decoder fuzzing and malicious-worker tests cover oversized/recursive encodings, forged proof modes, tenant/context swaps, chosen decrypt queries and credential exfiltration attempts.
- Residual accepted risks have named owners, rationale and visible support documentation; the report does not upgrade signature-only FHE to malicious-compute correctness.

#### KRY-059 — [Release-Canary] deploy: qualify staged rollout and safe rollback

**Repository:** `kryvola-platform` · **Dependencies:** KRY-053, KRY-054, KRY-055, KRY-056, KRY-057, KRY-058

**Description:** Publish a signed coordinated release set, run a bounded canary with synthetic/consented workloads and expand only after capacity, error, evidence and owner release checks pass. Test rollback of services independently of immutable artifact/crypto formats and schema migration; incompatible pending operations are drained/quarantined rather than decoded by an older engine. An outage may reject work or preserve encrypted artifacts, but must never route through plaintext, weaker proof modes or a weaker trust tier automatically.

**Acceptance criteria:**

- Canary meets accepted SLO/capacity/security thresholds for its observation/load profile and produces a signed gate record with rollback criteria.
- A rehearsed failed upgrade/rollback preserves operation fences, canceled/revoked status, artifact retention and owner release guarantees.
- Production capability registry advertises only audited supported profiles and exact approved versions; research/mock/dev engines and proofs cannot be selected.

#### KRY-060 — [GA-Operations] docs: deliver supported profiles owner recovery and incident playbooks

**Repository:** `kryvola-platform` · **Dependencies:** KRY-055, KRY-056, KRY-058, KRY-059

**Description:** Publish operator/owner onboarding, supported model/parameter/size limits, latency classes, evidence semantics, key custody/backup and loss procedures, cancellation/revocation limits, incident response and upgrade guidance. Include one reproducible public-model TFHE example and only the extensions actually qualified. Name on-call/maintenance owners and criteria for withdrawing a profile after upstream advisories. Document that key loss may make ciphertext unrecoverable, owner compromise defeats owner confidentiality, and already disclosed results cannot be revoked.

**Acceptance criteria:**

- A new operator and owner follow the documented setup to complete the supported slice and independently verify its release/evidence bindings.
- Tabletop drills cover key compromise/loss, invalid proof surge, unavailable owner, broker/Temporal/Ray outage and artifact corruption with measured recovery actions.
- GA checklist links release-set lock, benchmark envelope, audit disposition, DR drill, canary record and owner documentation; no unsupported extension or unmeasured performance claim remains advertised.

## 4. Verification and release policy

Every merged issue supplies its recorded acceptance evidence under the release-set revision. Unit/property tests are appropriate for canonical encodings, state transitions and cryptographic parameter validation; cross-language golden vectors test actual boundaries. Native input decoders, manifests, receipts and proof envelopes require continuous fuzzing under allocation/time limits. Cryptographic correctness tests compare with a preregistered plaintext reference, exact integer semantics for baseline TFHE, or explicit CKKS/MPC error bounds.

The minimum integration fault matrix includes lost Temporal completion, duplicate/reordered Redpanda events, SQL outbox crash windows, Ray head/worker loss, ambiguous dispatch, expired fences, cancellation/result and revocation/release races, wrong/corrupt/oversized artifacts, invalid or wrong-instance proof, proof backlog, worker key exfiltration attempts, quota exhaustion and DR restore. A test passes by demonstrating either approved recovery or a safe terminal failure; availability is never purchased by weakening confidentiality, evidence or disclosure policy.

No gate requires an arbitrary improvement over an unrelated protocol, every primitive to be deployed, global exactly-once execution, universal zero-copy data flow, or unreviewed cross-protocol interoperability. Supported production means that the selected profile's claim, parameter/security review, numerical bound, resource envelope, recovery behavior and operational owner are all concrete and independently assessable.

Technical facts and library choices follow the primary-source references in `kryvola-design-v2.md`. Before locking a dependency, the implementing issue verifies the exact upstream release documentation and license/security notices again. This plan intentionally sets no calendar dates or unverified latest-version numbers; milestone exits depend on evidence, not elapsed time.


## 5. Implementation progress amendments

25 October 2026: the initial repository scaffold is tracked in [foundation progress](progress.md). [ADR 0001](adr/0001-schema-authoring.md) amends schema authoring to Redocly and Effect v4 / TypeScript 7 while retaining Protobuf wire projections. The scaffold does not complete the M0 milestone or mark its research/qualification issues done. All 60 roadmap issues and their gates remain in force.
