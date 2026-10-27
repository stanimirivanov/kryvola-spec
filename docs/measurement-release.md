# Measurement, model and release-candidate preview

M0-PR13 publishes additive Effect-authored contracts in bundle `0.1.0-preview.10`:
`ModelDescriptor`, `MeasurementReport` and `ReleaseCandidate`. Their closed JSON
Schemas are in `generated/profiles/`; `generated/fixtures/profiles/` contains
synthetic, disabled, unqualified format specimens. No measurements, legal review,
ratification or production qualification are claimed by those specimens.

The initial snapshot covers FHE-Q1 only: public models, existing unsigned modular
ADD/MUL semantics and the shared dtype/WRAP precision contract. Workload bindings
include exact model/program/engine/parameter/dataset identities and input/output
shapes. Model descriptors additionally pin preprocessing and plaintext reference
programs, dataset split/count/license and a zero numerical error budget. Other
profiles need explicitly reviewed contracts; changing a profile label cannot
reinterpret this snapshot as CKKS, MPC or private-model inference.

Reports pin software source commits, versions and artifact SHA-256 values, hardware
and driver/runtime inventory, network shaping, concurrency, feature flags and cache
state. Producers must include every toolchain/dependency that changes the measured
result; tfhe-rs, benchmark harness and engine image pins are mandatory. Source commits
use full GitHub Git SHA-1 identifiers; artifact SHA-256 values are build provenance,
not protocol commitments or authorization. Protocol object digests retain their
existing domain-specific meaning. Versions cannot be floating branch/tag aliases.

All counts/quantities are canonical decimal strings; bounded schema checks preserve
uint64 values without JavaScript number rounding. Shapes/concurrency/dataset and
requested sample counts are positive, with at most nine decimal digits. Warmup
samples are excluded from measured sample counts and elapsed time. Each requested
sample has one successful or failed terminal observation; failure-code counts must
sum to failures. Numerical mismatches are separately counted among completed samples
and do not disappear from reports. Adverse/all-failed measurements are valid data,
not grounds to claim qualification.

Latency values are nanoseconds, p50 ≤ p95 ≤ p99 per phase, using nearest-rank
quantiles over successful samples. All-failed runs have null latency and zero
throughput. Elapsed time spans first measured admission through last terminal
observation, including failed requests. Throughput is floor(successes × 10^15 /
elapsed_ns), in microrequests/second. Costs use total USD microunits over that
measured interval; per-completion costs can be derived with explicit zero-success
handling. Resource values are bytes. A COLD/WARM label covers evaluation-key and
program caches together; mixed cache conditions require a future schema extension.
Inactive proof phases have zero timings under evidence policy NONE; other policies
must declare allowed relations and pin the immutable evidence-policy digest.
This does not verify proofs, approve parameters or establish FHE evaluation integrity.

Release candidates pin all five component revisions/artifacts, model/report bytes,
bundle manifest and the same workload/evidence policy as the report. The engines
component denotes the benchmarked engine image; its version, source revision and
SHA-256 must match the report. Schema source revision is separate from a nullable
later ratification revision. A final candidate can reference already committed
source; it must not embed its own future commit hash. Review decisions/revisions
remain assertions until independently authenticated. Legal evidence is required
for a declared REVIEWED_ALLOWED disposition, but neither that label nor passing
validation enables a profile: this schema always requires UNQUALIFIED, disabled,
non-production candidates. Qualified release admission remains later platform work.

`pnpm check:release` checks generation drift and the default synthetic file triplet.
For another triplet, after `pnpm build`, run
`node tools/check-release.mjs <model.json> <measurement.json> <release.json>`.
The gate bounds each file to 128 KiB, decodes strict UTF-8, validates structure and
cross-record semantics, then checks SHA-256 over exact model/report bytes, including
whitespace. It does not download external artifacts, verify their declared hashes,
authenticate review evidence, sign objects or publish a release. The TypeScript
decoders/`validateReleaseCandidate` perform structural/semantic checks only; their
returned raw types are not nominal authorization brands. JSON Schema exports alone
do not enforce cross-field sums, quantile ordering or snapshot consistency.

`pnpm check`/CI verify includes the release file gate and `tests/profiles.test.mjs`;
existing native/canonical/state gates remain independent and required. Heavy
native/canonical conformance runs on CI. Local generation uses existing cached
native tooling solely to refresh provenance. All prior wire/signed formats and
consumer pins are preserved; consumers adopt the new snapshot through later
single-repository PRs. Existing Effect authoring/provenance patterns and the installed
JCS dependency are reused (JCS only for order-insensitive semantic comparison);
no new dependency, wrapper service or signing format is introduced.
