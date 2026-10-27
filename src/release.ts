import canonicalize from "canonicalize";
import { Schema } from "effect";
import {
  decodeMeasurementReport,
  decodeModelDescriptor,
  ExactSoftwarePin,
  MeasurementReport,
  ModelDescriptor,
  WorkloadBinding,
} from "./measurement.js";

const Digest = ExactSoftwarePin.fields.artifact_sha256;
// Semantic equality only; not a new signed/canonical format.
const sameProfileRecord = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
export const ReleaseCandidate = Schema.Struct({
  schema_version: Schema.Literal("1"),
  stage: Schema.Literal("M0_CONTRACT_CANDIDATE"),
  production_ready: Schema.Literal(false),
  profile_enabled: Schema.Literal(false),
  qualification: Schema.Literal("UNQUALIFIED"),
  schema_source_revision: ExactSoftwarePin.fields.source_revision,
  ratification_revision: Schema.NullOr(ExactSoftwarePin.fields.source_revision),
  contract_version: ExactSoftwarePin.fields.version,
  bundle_manifest_sha256: Digest,
  workload: WorkloadBinding,
  evidence: MeasurementReport.fields.evidence,
  model_descriptor_sha256: Digest,
  measurement_report_sha256: Digest,
  components: Schema.Struct({
    spec: ExactSoftwarePin,
    fabric: ExactSoftwarePin,
    engines: ExactSoftwarePin,
    ml: ExactSoftwarePin,
    platform: ExactSoftwarePin,
  }),
  legal: Schema.Struct({
    disposition: Schema.Literals(["UNRESOLVED", "BLOCKED", "REVIEWED_ALLOWED"]),
    intended_use: ModelDescriptor.fields.dataset_license,
    evidence_sha256: Schema.Array(Digest).check(Schema.isMaxLength(8)),
  }),
});
export type ReleaseCandidate = typeof ReleaseCandidate.Type;
export function decodeReleaseCandidate(input: unknown): ReleaseCandidate {
  const v = Schema.decodeUnknownSync(ReleaseCandidate, { onExcessProperty: "error" })(input);
  if (v.ratification_revision === v.schema_source_revision)
    throw new Error("SEPARATE_RATIFICATION_REVISION");
  if (
    v.components.spec.source_revision !== v.schema_source_revision ||
    v.components.spec.version !== v.contract_version
  )
    throw new Error("SPEC_PIN_MISMATCH");
  for (const [name, pin] of Object.entries(v.components))
    if (pin.name !== `kryvola-${name}`) throw new Error("COMPONENT_IDENTITY");
  if (v.components.engines.artifact_sha256 !== v.workload.engine_digest)
    throw new Error("ENGINE_PIN_MISMATCH");
  if (
    new Set(v.workload.operators).size !== v.workload.operators.length ||
    new Set(v.evidence.relations).size !== v.evidence.relations.length ||
    (v.evidence.policy === "NONE") !== (v.evidence.relations.length === 0)
  )
    throw new Error("INVALID_RELEASE_PROFILE");
  if (
    new Set(v.legal.evidence_sha256).size !== v.legal.evidence_sha256.length ||
    (v.legal.disposition === "REVIEWED_ALLOWED" && !v.legal.evidence_sha256.length)
  )
    throw new Error("LEGAL_EVIDENCE_REQUIRED");
  return v;
}
/** Cross-record consistency only; callers separately hash exact files and authenticate reviews. */
export function validateReleaseCandidate(
  modelInput: unknown,
  measurementInput: unknown,
  releaseInput: unknown,
): ReleaseCandidate {
  const model = decodeModelDescriptor(modelInput),
    report = decodeMeasurementReport(measurementInput),
    release = decodeReleaseCandidate(releaseInput);
  if (
    !sameProfileRecord(model.workload, report.workload) ||
    !sameProfileRecord(model.workload, release.workload) ||
    !sameProfileRecord(report.evidence, release.evidence)
  )
    throw new Error("MIXED_PROFILE");
  if (
    report.contract_version !== release.contract_version ||
    report.schema_source_revision !== release.schema_source_revision ||
    report.model_descriptor_sha256 !== release.model_descriptor_sha256
  )
    throw new Error("SNAPSHOT_MISMATCH");
  const engine = report.software.find((pin) => pin.name === "engine-image");
  if (
    engine?.version !== release.components.engines.version ||
    engine.source_revision !== release.components.engines.source_revision
  )
    throw new Error("ENGINE_BUILD_MISMATCH");
  return release;
}
