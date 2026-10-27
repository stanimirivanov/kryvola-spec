import { CONTRACT_VERSION } from "../dist/index.js";
import { sha256 } from "./provenance.mjs";

// Synthetic format specimens only; no benchmark, legal review or qualification occurred.
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
export function profileFixtureFiles() {
  const revision = "a".repeat(40),
    digest = "b".repeat(64);
  const pin = (name, version = "0.0.0-synthetic") => ({
    name,
    version,
    source_revision: revision,
    artifact_sha256: digest,
  });
  const workload = {
    profile_id: "FHE-Q1",
    profile_version: "1",
    parameter_set_digest: digest,
    model_digest: digest,
    program_digest: digest,
    engine_digest: digest,
    dataset_snapshot_digest: digest,
    arithmetic: "EXACT_MODULAR",
    precision: { dtype: "uint8", fractional_bits: "0", overflow: "WRAP" },
    operators: ["ADD"],
    input_shape: ["2"],
    output_shape: ["2"],
  };
  const model = {
    schema_version: "1",
    model_version: "0.0.0-synthetic",
    workload,
    dataset_license: "SYNTHETIC-NO-DATASET",
    dataset_split: "SYNTHETIC",
    dataset_samples: "3",
    preprocessing_digest: digest,
    reference_program_digest: digest,
    numerical_error_budget: "0",
    model_visibility: "PUBLIC",
  };
  const modelBytes = json(model);
  const evidence = { policy_digest: digest, policy: "NONE", relations: [] };
  const quantiles = { p50: "10", p95: "30", p99: "30" };
  const phases = [
    "upload",
    "manifest_verify",
    "key_load",
    "queue",
    "transfer",
    "decode",
    "expand",
    "evaluate",
    "bootstrap",
    "download",
    "owner_decrypt",
    "end_to_end",
  ];
  const report = {
    schema_version: "1",
    measurement_id: "synthetic-report",
    origin: "SYNTHETIC_FIXTURE",
    workload,
    model_descriptor_sha256: sha256(modelBytes),
    contract_version: CONTRACT_VERSION,
    schema_source_revision: revision,
    software: [pin("tfhe-rs"), pin("benchmark-harness"), pin("engine-image")],
    features: ["synthetic"],
    evidence,
    hardware: {
      cpu_model: "synthetic CPU",
      cpu_cores: "2",
      ram_bytes: "1073741824",
      os_kernel: "synthetic-kernel",
      accelerators: [],
    },
    network: {
      rtt_ns: "1000000",
      bandwidth_bytes_per_second: "125000000",
      loss_parts_per_million: "0",
    },
    concurrency: "1",
    cache_state: "COLD",
    warmup_samples: "0",
    requested_samples: "3",
    successful_samples: "2",
    failed_samples: "1",
    elapsed_ns: "1000000000",
    failures: [{ code: "SYNTHETIC_FAILURE", count: "1" }],
    latency_ns: {
      ...Object.fromEntries(phases.map((name) => [name, quantiles])),
      ...Object.fromEntries(
        ["proof_queue", "prove", "verify"].map((name) => [name, { p50: "0", p95: "0", p99: "0" }]),
      ),
    },
    throughput_microrequests_per_second: "2000000",
    resources: {
      serialized_bytes: "100",
      expanded_bytes: "200",
      evaluation_key_bytes: "300",
      peak_rss_bytes: "1000",
      peak_vram_bytes: "0",
    },
    numerical_mismatches: "0",
    total_cost_usd_microunits: "0",
  };
  const reportBytes = json(report);
  const release = {
    schema_version: "1",
    stage: "M0_CONTRACT_CANDIDATE",
    production_ready: false,
    profile_enabled: false,
    qualification: "UNQUALIFIED",
    schema_source_revision: revision,
    ratification_revision: null,
    contract_version: CONTRACT_VERSION,
    bundle_manifest_sha256: digest,
    workload,
    evidence,
    model_descriptor_sha256: sha256(modelBytes),
    measurement_report_sha256: sha256(reportBytes),
    components: {
      spec: pin("kryvola-spec", CONTRACT_VERSION),
      ...Object.fromEntries(
        ["fabric", "engines", "ml", "platform"].map((name) => [name, pin(`kryvola-${name}`)]),
      ),
    },
    legal: {
      disposition: "UNRESOLVED",
      intended_use: "Synthetic contract conformance only",
      evidence_sha256: [],
    },
  };
  return new Map([
    ["model.json", modelBytes],
    ["measurement.json", reportBytes],
    ["release.json", json(release)],
  ]);
}
