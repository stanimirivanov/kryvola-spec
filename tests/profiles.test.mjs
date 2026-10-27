import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  decodeMeasurementReport,
  decodeModelDescriptor,
  decodeReleaseCandidate,
  validateReleaseCandidate,
} from "../dist/index.js";
import { checkReleaseFiles } from "../tools/check-release.mjs";
import { profileFixtureFiles } from "../tools/profile-fixtures.mjs";

const read = (name) => JSON.parse(profileFixtureFiles().get(`${name}.json`));

test("synthetic profile snapshot round-trips, remains disabled, and exports closed schemas", () => {
  const model = read("model"),
    report = read("measurement"),
    release = read("release");
  assert.deepEqual(decodeModelDescriptor(model), model);
  assert.deepEqual(decodeMeasurementReport(report), report);
  assert.deepEqual(validateReleaseCandidate(model, report, release), release);
  assert.equal(release.production_ready, false);
  assert.equal(release.profile_enabled, false);
  assert.equal(release.ratification_revision, null);
  assert.equal(report.origin, "SYNTHETIC_FIXTURE");
  for (const name of ["ModelDescriptor", "MeasurementReport", "ReleaseCandidate"]) {
    const schema = JSON.parse(
      readFileSync(new URL(`../generated/profiles/${name}.schema.json`, import.meta.url)),
    );
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.length > 5);
  }
});
test("missing or unsupported model semantics are rejected", () => {
  for (const change of [
    (m) => delete m.dataset_license,
    (m) => (m.workload.input_shape = []),
    (m) => (m.workload.output_shape = ["0"]),
    (m) => (m.workload.profile_id = "FHE-A1"),
    (m) => (m.workload.precision.overflow = "REJECT"),
    (m) => (m.model_visibility = "PRIVATE"),
    (m) => (m.workload.operators = ["ADD", "ADD"]),
    (m) => (m.private_key = "forbidden"),
  ]) {
    const model = read("model");
    change(model);
    assert.throws(() => decodeModelDescriptor(model));
  }
});
test("sample accounting capacity evidence pins and quantile populations fail closed", () => {
  for (const change of [
    (r) => (r.failed_samples = "0"),
    (r) => (r.failures[0].count = "2"),
    (r) => (r.numerical_mismatches = "3"),
    (r) => (r.throughput_microrequests_per_second = "2000001"),
    (r) => (r.latency_ns.evaluate.p95 = "9"),
    (r) => (r.elapsed_ns = "0"),
    (r) => (r.hardware.ram_bytes = "0"),
    (r) => (r.resources.peak_vram_bytes = "1"),
    (r) => (r.latency_ns.prove = { p50: "1", p95: "1", p99: "1" }),
    (r) => (r.network.loss_parts_per_million = "1000001"),
    (r) => (r.software[0].version = "latest"),
    (r) => (r.software[0].source_revision = "main"),
    (r) => r.software.pop(),
    (r) => (r.software[2].artifact_sha256 = "c".repeat(64)),
    (r) => (r.features = ["duplicate", "duplicate"]),
    (r) => (r.evidence.policy = "REQUIRED_BEFORE_RELEASE"),
    (r) => (r.evidence.relations = ["PUBLIC_METADATA_COMMITMENT"]),
    (r) => (r.latency_ns = null),
    (r) => (r.requested_samples = "0"),
    (r) => (r.elapsed_ns = "18446744073709551616"),
    (r) => (r.hardware.inline_secret = "forbidden"),
  ]) {
    const report = read("measurement");
    change(report);
    assert.throws(() => decodeMeasurementReport(report));
  }
  const allFailed = read("measurement");
  Object.assign(allFailed, {
    successful_samples: "0",
    failed_samples: "3",
    failures: [{ code: "FAILED", count: "3" }],
    latency_ns: null,
    throughput_microrequests_per_second: "0",
  });
  assert.deepEqual(decodeMeasurementReport(allFailed), allFailed);
});
test("mixed snapshots and invented approvals cannot become qualified releases", () => {
  for (const change of [
    (r) => (r.workload.precision.dtype = "uint16"),
    (r) => (r.evidence.policy_digest = "c".repeat(64)),
    (r) => (r.model_descriptor_sha256 = "c".repeat(64)),
    (r) => (r.schema_source_revision = "c".repeat(40)),
    (r) => (r.production_ready = true),
    (r) => (r.profile_enabled = true),
    (r) => (r.qualification = "QUALIFIED"),
    (r) => (r.ratification_revision = r.schema_source_revision),
    (r) => (r.legal.disposition = "REVIEWED_ALLOWED"),
    (r) => delete r.components.ml,
    (r) => (r.components.fabric.name = "kryvola-ml"),
    (r) => (r.components.spec.version = "0.0.0-other"),
    (r) => (r.components.engines.version = "1.0.0-other"),
    (r) => (r.components.engines.source_revision = "c".repeat(40)),
    (r) => (r.components.engines.artifact_sha256 = "c".repeat(64)),
  ]) {
    const release = read("release");
    change(release);
    assert.throws(() => validateReleaseCandidate(read("model"), read("measurement"), release));
  }
  const model = read("model");
  model.workload.precision = Object.fromEntries(Object.entries(model.workload.precision).reverse());
  assert.deepEqual(
    validateReleaseCandidate(model, read("measurement"), read("release")),
    read("release"),
  );
  const ratified = read("release");
  ratified.ratification_revision = "c".repeat(40);
  assert.equal(decodeReleaseCandidate(ratified).production_ready, false); // A declared revision is not authenticated approval.
});
test("release file gate checks exact bytes including whitespace and rejects unbounded or invalid UTF-8", () => {
  const folder = mkdtempSync(join(tmpdir(), "kryvola-release-"));
  const paths = ["model", "measurement", "release"].map((name) => join(folder, `${name}.json`));
  const files = profileFixtureFiles();
  try {
    for (const [name, bytes] of files) writeFileSync(join(folder, name), bytes);
    assert.equal(checkReleaseFiles(paths).qualification, "UNQUALIFIED");
    writeFileSync(paths[0], `${files.get("model.json")}\n`);
    assert.throws(() => checkReleaseFiles(paths), /Model file digest/);
    writeFileSync(paths[0], files.get("model.json"));
    writeFileSync(paths[1], `${files.get("measurement.json")}\n`);
    assert.throws(() => checkReleaseFiles(paths), /Measurement file digest/);
    writeFileSync(paths[1], files.get("measurement.json"));
    writeFileSync(paths[0], Buffer.from([0xff]));
    assert.throws(() => checkReleaseFiles(paths));
    writeFileSync(paths[0], " ".repeat(131073));
    assert.throws(() => checkReleaseFiles(paths), /128 KiB/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
