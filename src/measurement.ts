import { Schema } from "effect";
import { AssuranceProfile, AssuranceRequest } from "./assurance.js";
import { Uint64Decimal } from "./control.js";
import { FheQ1Arithmetic, FheQ1Operator, FheQ1Precision } from "./fhe-q1.js";

const Id = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}(?![\s\S])/u));
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/u));
const Commit = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}(?![\s\S])/u));
const Text = Schema.String.check(Schema.isPattern(/^[^\u0000-\u001f]{1,256}(?![\s\S])/u));
const Positive = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,8}(?![\s\S])/u));
const Version = Schema.String.check(
  Schema.isPattern(/^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:-[a-zA-Z0-9.-]{1,64})?(?![\s\S])/u),
);
const list = <S extends Schema.Top>(s: S, min = 1, max = 32) =>
  Schema.Array(s).check(Schema.isMinLength(min), Schema.isMaxLength(max));
const U64 = Uint64Decimal;
export const ExactSoftwarePin = Schema.Struct({
  name: Id,
  version: Version,
  source_revision: Commit,
  artifact_sha256: Digest,
});
export const WorkloadBinding = Schema.Struct({
  profile_id: AssuranceProfile.fields.profile_id,
  profile_version: AssuranceProfile.fields.profile_version,
  parameter_set_digest: Digest,
  model_digest: Digest,
  program_digest: Digest,
  engine_digest: Digest,
  dataset_snapshot_digest: Digest,
  arithmetic: FheQ1Arithmetic,
  precision: FheQ1Precision,
  operators: list(FheQ1Operator, 1, 2),
  input_shape: list(Positive, 1, 8),
  output_shape: list(Positive, 1, 8),
});
export const ModelDescriptor = Schema.Struct({
  schema_version: Schema.Literal("1"),
  model_version: Version,
  workload: WorkloadBinding,
  dataset_license: Text,
  preprocessing_digest: Digest,
  reference_program_digest: Digest,
  dataset_split: Schema.Literals(["TRAIN", "VALIDATION", "TEST", "SYNTHETIC"]),
  dataset_samples: Positive,
  numerical_error_budget: Schema.Literal("0"),
  model_visibility: Schema.Literal("PUBLIC"),
});
const Quantiles = Schema.Struct({ p50: U64, p95: U64, p99: U64 });
const Latencies = Schema.Struct({
  upload: Quantiles,
  manifest_verify: Quantiles,
  key_load: Quantiles,
  queue: Quantiles,
  transfer: Quantiles,
  decode: Quantiles,
  expand: Quantiles,
  evaluate: Quantiles,
  bootstrap: Quantiles,
  proof_queue: Quantiles,
  prove: Quantiles,
  verify: Quantiles,
  download: Quantiles,
  owner_decrypt: Quantiles,
  end_to_end: Quantiles,
});
export const EvidencePolicy = Schema.Struct({
  policy_digest: Digest,
  policy: AssuranceRequest.fields.evidence_policy,
  relations: list(Schema.Literals(["TFHE_COMPACT_INPUT", "PUBLIC_METADATA_COMMITMENT"]), 0, 2),
});
export const MeasurementReport = Schema.Struct({
  schema_version: Schema.Literal("1"),
  measurement_id: Id,
  origin: Schema.Literals(["SYNTHETIC_FIXTURE", "MEASURED"]),
  workload: WorkloadBinding,
  model_descriptor_sha256: Digest,
  contract_version: Version,
  schema_source_revision: Commit,
  software: list(ExactSoftwarePin),
  features: list(Id, 0),
  evidence: EvidencePolicy,
  hardware: Schema.Struct({
    cpu_model: Text,
    cpu_cores: Positive,
    ram_bytes: U64,
    os_kernel: Id,
    accelerators: list(
      Schema.Struct({
        model: Text,
        memory_bytes: U64,
        driver_version: Version,
        runtime_version: Version,
      }),
      0,
      8,
    ),
  }),
  network: Schema.Struct({
    rtt_ns: U64,
    bandwidth_bytes_per_second: U64,
    loss_parts_per_million: U64,
  }),
  concurrency: Positive,
  cache_state: Schema.Literals(["COLD", "WARM"]),
  warmup_samples: U64,
  requested_samples: Positive,
  successful_samples: U64,
  failed_samples: U64,
  elapsed_ns: U64,
  failures: list(Schema.Struct({ code: Id, count: Positive }), 0),
  latency_ns: Schema.NullOr(Latencies),
  throughput_microrequests_per_second: U64,
  resources: Schema.Struct({
    serialized_bytes: U64,
    expanded_bytes: U64,
    evaluation_key_bytes: U64,
    peak_rss_bytes: U64,
    peak_vram_bytes: U64,
  }),
  numerical_mismatches: U64,
  total_cost_usd_microunits: U64,
});
export type ModelDescriptor = typeof ModelDescriptor.Type;
export type MeasurementReport = typeof MeasurementReport.Type;
const unique = (values: readonly string[]) => {
  if (new Set(values).size !== values.length) throw new Error("DUPLICATE_PROFILE_ENTRY");
};
export function decodeModelDescriptor(input: unknown): ModelDescriptor {
  const value = Schema.decodeUnknownSync(ModelDescriptor, { onExcessProperty: "error" })(input);
  unique(value.workload.operators);
  return value;
}
export function decodeMeasurementReport(input: unknown): MeasurementReport {
  const v = Schema.decodeUnknownSync(MeasurementReport, { onExcessProperty: "error" })(input);
  unique(v.workload.operators);
  unique(v.features);
  unique(v.software.map((p) => p.name));
  unique(v.failures.map((p) => p.code));
  unique(v.evidence.relations);
  const success = BigInt(v.successful_samples),
    failed = BigInt(v.failed_samples);
  if (
    success + failed !== BigInt(v.requested_samples) ||
    v.failures.reduce((n, f) => n + BigInt(f.count), 0n) !== failed ||
    BigInt(v.numerical_mismatches) > success
  )
    throw new Error("SAMPLE_ACCOUNTING");
  if (
    !BigInt(v.elapsed_ns) ||
    !BigInt(v.hardware.ram_bytes) ||
    !BigInt(v.network.bandwidth_bytes_per_second) ||
    BigInt(v.network.loss_parts_per_million) > 1000000n ||
    (!v.hardware.accelerators.length && BigInt(v.resources.peak_vram_bytes) !== 0n) ||
    v.hardware.accelerators.some((a) => !BigInt(a.memory_bytes))
  )
    throw new Error("INVALID_CAPACITY");
  if (
    BigInt(v.throughput_microrequests_per_second) !==
    (success * 1000000000000000n) / BigInt(v.elapsed_ns)
  )
    throw new Error("THROUGHPUT_ACCOUNTING");
  if ((success === 0n) !== (v.latency_ns === null)) throw new Error("LATENCY_POPULATION");
  for (const q of Object.values(v.latency_ns ?? {}))
    if (BigInt(q.p50) > BigInt(q.p95) || BigInt(q.p95) > BigInt(q.p99))
      throw new Error("QUANTILE_ORDER");
  if ((v.evidence.policy === "NONE") !== (v.evidence.relations.length === 0))
    throw new Error("EVIDENCE_POLICY");
  if (
    v.evidence.policy === "NONE" &&
    v.latency_ns &&
    [v.latency_ns.proof_queue, v.latency_ns.prove, v.latency_ns.verify].some((q) => q.p99 !== "0")
  )
    throw new Error("DISABLED_PROOF_TIMING");
  for (const name of ["tfhe-rs", "benchmark-harness", "engine-image"])
    if (!v.software.some((p) => p.name === name)) throw new Error("SOFTWARE_PIN_REQUIRED");
  if (
    v.software.find((p) => p.name === "engine-image")?.artifact_sha256 !== v.workload.engine_digest
  )
    throw new Error("ENGINE_PIN_MISMATCH");
  return v;
}
