import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { canonicalBytes, decodeCanonical, signaturePreimage } from "../dist/canonical.js";
import { decodeRuntime, RUNTIME_SCHEMAS } from "../dist/runtime.js";
import * as projection from "../tools/projection.mjs";
import { sha256 } from "../tools/provenance.mjs";

const digest = "a".repeat(64);
const version = { schema_version: "1" };
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const decode = (name, value) => decodeRuntime(name, encode(value));

test("upload admission is bounded and excludes credentials and bytes", () => {
  const request = { ...version, tenant_scope: "tenant-1", byte_length: 1073741824 };
  assert.deepEqual(decode("CreateUploadRequest", request), request);
  for (const extra of [{ ciphertext: "abc" }, { credentials: "abc" }, { byte_length: 1073741825 }])
    assert.throws(() => decode("CreateUploadRequest", { ...request, ...extra }));
  assert.throws(() => decodeRuntime("CreateUploadRequest", new Uint8Array(65537)), /64 KiB/);
});

test("pending cancellation has no committed fence", () => {
  const pending = { ...version, outcome: "CANCELLATION_PENDING" };
  const committed = { ...version, outcome: "CANCELLED", fence: "2" };
  assert.deepEqual(decode("CancelOperationResponse", pending), pending);
  assert.deepEqual(decode("CancelOperationResponse", committed), committed);
  assert.throws(() => decode("CancelOperationResponse", { ...pending, fence: "2" }));
  assert.throws(() => decode("CancelOperationResponse", { ...version, outcome: "CANCELLED" }));
});

test("expired attempt and idempotency conflict are distinct error codes", () => {
  for (const code of ["ATTEMPT_EXPIRED", "IDEMPOTENCY_CONFLICT"])
    assert.deepEqual(decode("RuntimeError", { ...version, code }), { ...version, code });
});

test("result selection accepts a digest and rejects nested bulk data", () => {
  const attempt = {
    ...version,
    tenant_scope: "t",
    operation_id: "op",
    workflow_epoch: "1",
    attempt_epoch: "1",
    fence: "2",
  };
  const request = { ...version, attempt, execution_id: "exec", output_manifest_digest: digest };
  assert.deepEqual(decode("SelectResultRequest", request), request);
  assert.throws(() =>
    decode("SelectResultRequest", { ...request, attempt: { ...attempt, key: "x" } }),
  );
});

test("all runtime contracts are generated outside existing wire projections", () => {
  for (const name of Object.keys(RUNTIME_SCHEMAS)) {
    const schema = JSON.parse(
      readFileSync(new URL(`../generated/runtime/${name}.schema.json`, import.meta.url), "utf8"),
    );
    assert.ok(schema.$schema);
  }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const components = () => JSON.parse(read("openapi/runtime.schemas.json")).components.schemas;

test("OpenAPI owns HTTP bodies and the decoder is a checked projection", () => {
  const api = read("openapi/runtime.yaml");
  assert.doesNotMatch(api, /generated\/runtime\//);
  assert.match(api, /runtime\.schemas\.json#\/components\/schemas\//);
  assert.equal(projection.renderRuntime(components()), read("src/runtime.ts"));
});

test("all runtime wire schemas retain the pre-ownership bytes", () => {
  const baseline = JSON.parse(read("tests/fixtures/runtime-baseline.json"));
  // Additive contracts may join this frozen subset; no existing schema may drift or disappear.
  for (const [file, hash] of Object.entries(baseline)) {
    const name = file.replace(".schema.json", "");
    assert.ok(Object.hasOwn(RUNTIME_SCHEMAS, name), name);
    const bytes = read(`generated/runtime/${file}`);
    assert.equal(sha256(bytes), hash, name);
    assert.deepEqual(projection.toJsonSchema(RUNTIME_SCHEMAS[name]), JSON.parse(bytes), name);
  }
});

test("OpenAPI changes drive decoding and unsupported constructs fail closed", async () => {
  const schemas = components();
  schemas.CreateUploadRequest.properties.byte_length.maximum = 1;
  const source = projection
    .renderRuntime(schemas)
    .replaceAll('"effect"', JSON.stringify(import.meta.resolve("effect")))
    .replaceAll(
      '"./control.js"',
      JSON.stringify(new URL("../dist/control.js", import.meta.url).href),
    );
  const declarations = source
    .slice(0, source.indexOf("const utf8 ="))
    .replace('import { assertControlBytes } from "./transport.js";', "");
  const { RUNTIME_SCHEMAS: changed } = await import(
    `data:text/javascript,${encodeURIComponent(declarations)}`
  );
  const request = { ...version, tenant_scope: "t", byte_length: 2 };
  assert.deepEqual(decode("CreateUploadRequest", request), request);
  assert.throws(() => Schema.decodeUnknownSync(changed.CreateUploadRequest)(request));
  for (const mutate of [
    (s) => {
      s.CreateUploadRequest.properties.byte_length.multipleOf = 2;
    },
    (s) => {
      s.CreateUploadRequest.additionalProperties = true;
    },
    (s) => {
      s.CreateUploadRequest.required.pop();
    },
    (s) => {
      s.CreateUploadRequest.properties.byte_length = { $ref: "https://untrusted.invalid/schema" };
    },
    (s) => {
      s.CreateUploadRequest = { $ref: "#/components/schemas/CreateUploadRequest" };
    },
  ]) {
    const invalid = components();
    mutate(invalid);
    assert.throws(() => projection.renderRuntime(invalid));
  }
});

const attempt = {
  ...version,
  tenant_scope: "t",
  operation_id: "op",
  workflow_epoch: "1",
  attempt_epoch: "2",
  fence: "3",
};
const additions = {
  AbortUploadRequest: { ...version, attempt },
  CancelOperationRequest: {
    ...version,
    tenant_scope: "t",
    operation_id: "op",
    idempotency_key: "cancel-1",
  },
  RegisterExecutionRequest: {
    ...version,
    attempt,
    execution_id: "exec",
    plan_digest: digest,
    policy_digest: digest,
  },
  FenceRecoveryRequest: { ...version, tenant_scope: "t", operation_id: "op", workflow_epoch: "1" },
  RecoveryFenceResponse: {
    ...version,
    outcome: "RECOVERY_FENCED",
    fence: "4",
    successor_epoch: "2",
  },
};

test("missing execution-control boundaries have strict reference-only contracts", () => {
  for (const [name, value] of Object.entries(additions)) {
    assert.deepEqual(decode(name, value), value);
    for (const field of Object.keys(value)) {
      const incomplete = { ...value };
      delete incomplete[field];
      assert.throws(() => decode(name, incomplete), `${name}.${field}`);
    }
    for (const extra of [
      { credentials: "secret" },
      { ciphertext: "bulk" },
      { authority: "administrator" },
    ])
      assert.throws(() => decode(name, { ...value, ...extra }));
    assert.throws(() => decodeRuntime(name, new Uint8Array([255])));
    assert.throws(() => decodeRuntime(name, new Uint8Array(65537)), /64 KiB/);
  }
  for (const bad of ["-1", "01", "18446744073709551616", "1\\n", 1]) {
    assert.throws(() =>
      decode("AbortUploadRequest", {
        ...additions.AbortUploadRequest,
        attempt: { ...attempt, fence: bad },
      }),
    );
    assert.throws(() =>
      decode("FenceRecoveryRequest", { ...additions.FenceRecoveryRequest, workflow_epoch: bad }),
    );
    assert.throws(() =>
      decode("RecoveryFenceResponse", { ...additions.RecoveryFenceResponse, successor_epoch: bad }),
    );
  }
  for (const extra of [{ fence: "4" }, { successor_epoch: "2" }])
    assert.throws(() =>
      decode("FenceRecoveryRequest", { ...additions.FenceRecoveryRequest, ...extra }),
    );
  const maximum = "18446744073709551615";
  assert.equal(
    decode("AbortUploadRequest", {
      ...additions.AbortUploadRequest,
      attempt: { ...attempt, fence: maximum },
    }).attempt.fence,
    maximum,
  );
  const registered = additions.RegisterExecutionRequest;
  for (const extra of [
    { execution_id: "bad/id" },
    { plan_digest: "bad" },
    { policy_digest: "A".repeat(64) },
    { attempt: { ...attempt, credentials: "secret" } },
  ])
    assert.throws(() => decode("RegisterExecutionRequest", { ...registered, ...extra }));
  assert.throws(() =>
    decode("RecoveryFenceResponse", { ...additions.RecoveryFenceResponse, outcome: "RECOVERED" }),
  );
});

const errorsByStatus = {
  403: ["RuntimeForbiddenError", ["FORBIDDEN"]],
  404: ["RuntimeNotFoundError", ["NOT_FOUND"]],
  409: ["RuntimeConflictError", ["ATTEMPT_EXPIRED", "STALE_FENCE", "IDEMPOTENCY_CONFLICT"]],
  503: ["RuntimeUnavailableError", ["UNAVAILABLE"]],
};
test("new runtime routes bind resolved schemas and distinct authenticated authorities", () => {
  const api = JSON.parse(
    execFileSync(
      fileURLToPath(new URL("../node_modules/.bin/redocly", import.meta.url)),
      ["bundle", "runtime@v1", "--ext", "json", "--dereferenced"],
      { timeout: 15000, maxBuffer: 2 << 20 },
    ),
  );
  const normalize = (value) =>
    JSON.parse(JSON.stringify(value, (key, v) => (key === "$schema" ? undefined : v)));
  for (const [path, name, authority] of [
    ["/v1/uploads/{upload_id}/abort", "AbortUploadRequest", "COMPUTE_WRITE"],
    ["/v1/executions/register", "RegisterExecutionRequest", "EXECUTION_REGISTER"],
    ["/v1/executions/receipt", "PersistExecutionReceiptRequest", "EXECUTION_RECEIPT_WRITE"],
    ["/v1/admin/operations/cancel", "CancelOperationRequest", "ADMIN_CANCEL"],
    ["/v1/admin/operations/fence-recovery", "FenceRecoveryRequest", "ADMIN_RECOVERY"],
  ]) {
    const operation = api.paths[path]?.post;
    assert.ok(operation, path);
    assert.equal(operation["x-kryvola-purpose"], authority);
    assert.deepEqual(operation.security ?? api.security, [{ workload: [] }]);
    assert.deepEqual(
      normalize(operation.requestBody.content["application/json"].schema),
      normalize(projection.toJsonSchema(RUNTIME_SCHEMAS[name])),
    );
    assert.ok(operation.responses["400"]);
    assert.ok(operation.responses.default);
    if (authority !== "ADMIN_CANCEL")
      for (const status of ["403", "404", "409", "503"])
        assert.deepEqual(
          normalize(operation.responses[status].content["application/json"].schema),
          normalize(projection.toJsonSchema(RUNTIME_SCHEMAS[errorsByStatus[status][0]])),
        );
  }
  for (const [path, limit] of [
    ["/v1/compute-inputs/manifest", 65536],
    ["/v1/compute-inputs/parts/{part_index}", 4194304],
  ]) {
    const operation = api.paths[path]?.post;
    assert.ok(operation, path);
    assert.equal(operation["x-kryvola-purpose"], "COMPUTE_READ");
    assert.deepEqual(operation.security, [{ workload: [], computeReadGrant: [] }]);
    assert.deepEqual(
      normalize(operation.requestBody.content["application/json"].schema),
      normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.ReadComputeInputRequest)),
    );
    const response = operation.responses["200"];
    assert.equal(response.content["application/octet-stream"].schema.format, "binary");
    assert.equal(response.headers["Content-Length"].required, true);
    assert.equal(response.headers["Content-Length"].schema.maximum, limit);
    assert.equal(response.headers["Cache-Control"].schema.const, "no-store");
    assert.ok(operation.responses["400"]);
    for (const status of ["403", "404", "409", "503"]) {
      assert.deepEqual(
        normalize(operation.responses[status].content["application/json"].schema),
        normalize(projection.toJsonSchema(RUNTIME_SCHEMAS[errorsByStatus[status][0]])),
      );
    }
  }
  for (const [path, limit, statuses] of [
    ["/v1/released-outputs/manifest", 65536, ["403", "503"]],
    ["/v1/released-outputs/parts/{part_index}", 4194304, ["403", "404", "503"]],
  ]) {
    const operation = api.paths[path]?.post;
    assert.ok(operation, path);
    assert.equal(operation["x-kryvola-purpose"], "CONSUMER_READ");
    assert.deepEqual(operation.security, [{ workload: [], consumerReadGrant: [] }]);
    assert.deepEqual(
      normalize(operation.requestBody.content["application/json"].schema),
      normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.ReadReleasedOutputRequest)),
    );
    const response = operation.responses["200"];
    assert.equal(response.content["application/octet-stream"].schema.format, "binary");
    assert.equal(response.headers["Content-Length"].required, true);
    assert.equal(response.headers["Content-Length"].schema.maximum, limit);
    assert.equal(response.headers["Cache-Control"].required, true);
    assert.equal(response.headers["Cache-Control"].schema.const, "no-store");
    assert.ok(operation.responses["400"]);
    assert.deepEqual(Object.keys(operation.responses).sort(), [
      "200",
      "400",
      ...statuses,
      "default",
    ]);
    for (const status of statuses) {
      assert.deepEqual(
        normalize(operation.responses[status].content["application/json"].schema),
        normalize(projection.toJsonSchema(RUNTIME_SCHEMAS[errorsByStatus[status][0]])),
      );
    }
    if (limit === 4194304) {
      const [index] = operation.parameters;
      assert.equal(index.name, "part_index");
      assert.equal(index.in, "path");
      assert.equal(index.required, true);
      assert.equal(index.schema.minimum, 0);
      assert.equal(index.schema.maximum, 1023);
    }
  }
  assert.equal(api.components.securitySchemes.consumerReadGrant.scheme, "bearer");
  for (const [method, path, purpose, request, status] of [
    ["post", "/v1/key-contexts", "KEY_CONTEXT_REGISTER", "RegisterKeyContextRequest", "200"],
    ["post", "/v1/input-uploads", "INPUT_UPLOAD_RESERVE", "CreateInputUploadRequest", "201"],
    ["put", "/v1/input-uploads/{upload_id}/parts/{part_index}", "INPUT_UPLOAD_PART", null, "204"],
    ["put", "/v1/input-uploads/{upload_id}/manifest", "INPUT_UPLOAD_MANIFEST", null, "204"],
    [
      "post",
      "/v1/input-uploads/{upload_id}/finalize",
      "INPUT_UPLOAD_FINALIZE",
      "FinalizeUploadRequest",
      "200",
    ],
    [
      "post",
      "/v1/compute-approvals",
      "COMPUTE_APPROVAL_REGISTER",
      "RegisterComputeApprovalRequest",
      "200",
    ],
    [
      "post",
      "/v1/operations/admit",
      "APPROVED_OPERATION_ADMIT",
      "AdmitApprovedOperationRequest",
      "200",
    ],
  ]) {
    const operation = api.paths[path]?.[method];
    assert.ok(operation, path);
    assert.equal(operation["x-kryvola-purpose"], purpose);
    assert.deepEqual(operation.security, [{ workload: [], ownerSubmissionGrant: [] }]);
    assert.equal(operation.requestBody.required, true);
    if (request) {
      assert.deepEqual(
        normalize(operation.requestBody.content["application/json"].schema),
        normalize(projection.toJsonSchema(RUNTIME_SCHEMAS[request])),
      );
    } else {
      assert.deepEqual(Object.keys(operation.requestBody.content), ["application/octet-stream"]);
      assert.equal(
        operation.requestBody.content["application/octet-stream"].schema.format,
        "binary",
      );
    }
    for (const code of [status, "400", "403", "409", "429", "503"]) {
      assert.ok(operation.responses[code], code);
    }
    assert.deepEqual(
      normalize(operation.responses["429"].content["application/json"].schema),
      normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.RuntimeError)),
    );
  }
  assert.equal(api.components.securitySchemes.ownerSubmissionGrant.scheme, "bearer");
  const issueGrant = api.paths["/v1/executions/output-grants"].post;
  assert.equal(issueGrant["x-kryvola-purpose"], "EXECUTION_OUTPUT_GRANT");
  assert.deepEqual(issueGrant.security, [{ workload: [], outputGrantAuthority: [] }]);
  assert.equal(api.components.securitySchemes.outputGrantAuthority.scheme, "bearer");
  assert.deepEqual(
    normalize(issueGrant.requestBody.content["application/json"].schema),
    normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.IssueOutputGrantRequest)),
  );
  const grantResponse = issueGrant.responses["200"];
  assert.deepEqual(
    normalize(grantResponse.content["application/json"].schema),
    normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.IssueOutputGrantResponse)),
  );
  const grantHeader = grantResponse.headers["Kryvola-Output-Grant"];
  assert.equal(grantHeader.required, true);
  const grantPattern = new RegExp(grantHeader.schema.pattern, "u");
  assert.ok(grantPattern.test("a".repeat(64)));
  for (const invalid of ["a".repeat(63), "A".repeat(64), `${"a".repeat(64)}\n`]) {
    assert.equal(grantPattern.test(invalid), false);
  }
  assert.equal(grantResponse.headers["Cache-Control"].required, true);
  assert.equal(grantResponse.headers["Cache-Control"].schema.const, "no-store");
  for (const status of ["400", "403", "404", "409", "413", "429", "503", "default"]) {
    assert.ok(issueGrant.responses[status].content["application/json"]);
    assert.equal(issueGrant.responses[status].headers?.["Kryvola-Output-Grant"], undefined);
  }
  const receipt = api.paths["/v1/executions/receipt"].post.responses;
  assert.deepEqual(
    normalize(receipt["200"].content["application/json"].schema),
    normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.PersistExecutionReceiptResponse)),
  );
  assert.ok(receipt["413"]);
  const uploadId = api.paths["/v1/uploads/{upload_id}/abort"].post.parameters[0];
  assert.equal(uploadId.name, "upload_id");
  assert.equal(uploadId.required, true);
  assert.equal(
    uploadId.schema.pattern,
    projection.toJsonSchema(RUNTIME_SCHEMAS.CreateUploadResponse).properties.upload_id.pattern,
  );
  const cancel = api.paths["/v1/admin/operations/cancel"].post.responses;
  assert.deepEqual(cancel, api.paths["/v1/operations/cancel"].post.responses);
  const recovery = api.paths["/v1/admin/operations/fence-recovery"].post.responses;
  assert.deepEqual(
    normalize(recovery["200"].content["application/json"].schema),
    normalize(projection.toJsonSchema(RUNTIME_SCHEMAS.RecoveryFenceResponse)),
  );
  assert.equal(api.paths["/v1/uploads/{upload_id}/abort"].post.responses["204"].content, undefined);
  assert.equal(api.paths["/v1/executions/register"].post.responses["204"].content, undefined);
});

test("new HTTP error statuses constrain their existing wire codes", () => {
  for (const [name, codes] of Object.values(errorsByStatus)) {
    for (const code of codes)
      assert.deepEqual(decode(name, { ...version, code }), { ...version, code });
    assert.throws(() => decode(name, { ...version, code: "INVALID_REQUEST" }));
    assert.throws(() => decode(name, { code: codes[0] }));
    assert.throws(() => decode(name, { ...version, code: codes[0], credentials: "secret" }));
  }
});

test("compute-input requests bind an exact attempt and manifest without credentials or bulk", () => {
  const attempt = {
    ...version,
    tenant_scope: "tenant-1",
    operation_id: "operation-1",
    workflow_epoch: "3",
    attempt_epoch: "4",
    fence: "5",
  };
  const input = { ...version, attempt, manifest_digest: digest };
  assert.deepEqual(decode("ReadComputeInputRequest", input), input);
  for (const patch of [
    { manifest_digest: digest.toUpperCase() },
    { attempt: undefined },
    { attempt: { ...attempt, fence: 5 } },
    { attempt: { ...attempt, credential: "secret" } },
    { purpose: "EVIDENCE_READ" },
    { token: "secret" },
    { ciphertext: "inline" },
    { part_index: 0 },
  ]) {
    assert.throws(() => decode("ReadComputeInputRequest", { ...input, ...patch }));
  }
  assert.throws(() => decodeRuntime("ReadComputeInputRequest", new Uint8Array(65537)), /64 KiB/);
  const schema = JSON.parse(read("generated/runtime/ReadComputeInputRequest.schema.json"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.attempt.additionalProperties, false);
});

test("signed execution receipts use the canonical v3 fixture and a bounded runtime envelope", () => {
  const corpus = JSON.parse(read("fixtures/canonical/approval-receipt-v3.json"));
  const receipt = corpus.objects.find((object) => object.kind === "receipt");
  const attempt = {
    ...version,
    tenant_scope: receipt.value.tenant_scope,
    operation_id: receipt.value.operation_id,
    workflow_epoch: receipt.value.workflow_epoch,
    attempt_epoch: receipt.value.attempt_epoch,
    fence: receipt.value.fence,
  };
  const request = {
    ...version,
    attempt,
    execution_id: receipt.value.execution_id,
    output_upload_id: "upload-1",
    receipt_base64url: Buffer.from(receipt.canonical_hex, "hex").toString("base64url"),
    signature_base64url: Buffer.from(canonicalBytes("signature", receipt.envelope, "3")).toString(
      "base64url",
    ),
  };
  assert.deepEqual(decode("PersistExecutionReceiptRequest", request), request);
  const payload = Buffer.from(request.receipt_base64url, "base64url");
  const envelope = decodeCanonical(
    "signature",
    Buffer.from(request.signature_base64url, "base64url"),
    "3",
  );
  const { signature, ...header } = envelope;
  assert.equal(header.payload_kind, "receipt");
  const key = createPublicKey({
    key: Buffer.from(`302a300506032b6570032100${corpus.public_key_hex}`, "hex"),
    format: "der",
    type: "spki",
  });
  assert.ok(
    verify(null, signaturePreimage(header, payload, "3"), key, Buffer.from(signature, "base64url")),
  );

  for (const invalid of [
    { execution_id: undefined },
    { output_upload_id: "../path" },
    { attempt: { ...attempt, fence: 5 } },
    { receipt_base64url: "" },
    { receipt_base64url: "A".repeat(43692) },
    { signature_base64url: "A".repeat(2732) },
    { signature_base64url: "YWJj\n" },
    { signature_base64url: "YQ==" },
    { signer_key: "caller-supplied" },
    { receipt_digest: digest },
  ]) {
    assert.throws(() => decode("PersistExecutionReceiptRequest", { ...request, ...invalid }));
  }
  assert.throws(
    () => decodeRuntime("PersistExecutionReceiptRequest", new Uint8Array(65537)),
    /64 KiB/,
  );
  const response = { ...version, receipt_digest: receipt.digest };
  assert.deepEqual(decode("PersistExecutionReceiptResponse", response), response);
  assert.throws(() => decode("PersistExecutionReceiptResponse", { ...response, output_refs: [] }));
});

test("output grant issuance binds one exact execution, digest and upload action", () => {
  const attempt = {
    ...version,
    tenant_scope: "tenant-1",
    operation_id: "operation-1",
    workflow_epoch: "3",
    attempt_epoch: "4",
    fence: "5",
  };
  const common = { ...version, attempt, execution_id: "execution-1", manifest_digest: digest };
  const request = { ...common, target: { action: "RESERVE" } };
  assert.deepEqual(decode("IssueOutputGrantRequest", request), request);
  for (const target of [
    { action: "PUT_PART", upload_id: "upload-1", part_index: 0 },
    { action: "PUT_PART", upload_id: "upload-1", part_index: 1023 },
    ...["PUT_MANIFEST", "FINALIZE", "ABORT"].map((action) => ({ action, upload_id: "upload-1" })),
  ]) {
    const body = { ...common, target };
    assert.deepEqual(decode("IssueOutputGrantRequest", body), body);
  }
  for (const target of [
    { action: "RESERVE", upload_id: "upload-1" },
    { action: "PUT_PART", upload_id: "upload-1" },
    { action: "PUT_PART", upload_id: "upload-1", part_index: 1024 },
    { action: "PUT_PART", upload_id: "upload-1", part_index: "0" },
    { action: "FINALIZE", upload_id: "../path" },
    { action: "ABORT", upload_id: "upload-1", part_index: 0 },
    { action: "COMPUTE_READ" },
  ]) {
    assert.throws(() => decode("IssueOutputGrantRequest", { ...common, target }));
  }
  for (const patch of [
    { execution_id: undefined },
    { manifest_digest: digest.toUpperCase() },
    { attempt: { ...attempt, fence: 5 } },
    { token: "secret" },
    { purpose: "COMPUTE_WRITE" },
  ]) {
    assert.throws(() => decode("IssueOutputGrantRequest", { ...request, ...patch }));
  }
  assert.throws(() => decodeRuntime("IssueOutputGrantRequest", new Uint8Array(65537)), /64 KiB/);
  const response = { ...version, expires_unix_ms: "10" };
  assert.deepEqual(decode("IssueOutputGrantResponse", response), response);
  assert.throws(() => decode("IssueOutputGrantResponse", { ...response, grant: "secret" }));
});

test("consumer reads carry exact disclosure context without attempt authority or bulk", () => {
  const input = {
    ...version,
    tenant_scope: "tenant-1",
    disclosure_id: "b".repeat(64),
    recipient: "owner-1",
    output_manifest_digest: digest,
  };
  assert.deepEqual(decode("ReadReleasedOutputRequest", input), input);
  for (const patch of [
    { disclosure_id: undefined },
    { disclosure_id: "b".repeat(63) },
    { recipient: "" },
    { recipient: "a".repeat(129) },
    { output_manifest_digest: digest.toUpperCase() },
    { tenant_scope: "tenant-1\n" },
    { attempt: {} },
    { purpose: "EVIDENCE_READ" },
    { part_index: 0 },
    { token: "secret" },
    { ciphertext: "inline" },
    { storage_url: "https://example.invalid" },
  ]) {
    assert.throws(() => decode("ReadReleasedOutputRequest", { ...input, ...patch }));
  }
  assert.throws(() => decode("AuthorizeArtifactRequest", { ...input, purpose: "CONSUMER_READ" }));
  assert.throws(() => decodeRuntime("ReadReleasedOutputRequest", new Uint8Array(65537)), /64 KiB/);
});

test("approved admission accepts only exact immutable references", () => {
  const operation = JSON.parse(read("generated/fixtures/control.json"));
  const input = {
    ...version,
    operation: operation.Operation,
    approval_digest: digest,
    evaluation_key_manifest_digest: "b".repeat(64),
    input_manifest_digests: ["c".repeat(64)],
  };
  assert.deepEqual(decode("AdmitApprovedOperationRequest", input), input);
  for (const patch of [
    { approval_digest: undefined },
    { evaluation_key_manifest_digest: undefined },
    { input_manifest_digests: [] },
    { input_manifest_digests: [digest.toUpperCase()] },
    { ciphertext: "inline" },
    { token: "secret" },
    { signed_approval: {} },
  ]) {
    assert.throws(() => decode("AdmitApprovedOperationRequest", { ...input, ...patch }));
  }
});

test("owner metadata registration and reservation are closed and bounded", () => {
  const { KeyContextRef: keyContext, PlanRef: plan } = JSON.parse(
    read("generated/fixtures/control.json"),
  );
  const registration = { ...version, key_context_ref: keyContext, key_context_base64url: "e30" };
  const upload = {
    ...version,
    key_context_ref: keyContext,
    idempotency_key: "input-1",
    artifact_kind: "CIPHERTEXT",
    manifest_digest: digest,
    byte_length: 4,
  };
  const approval = {
    ...version,
    plan_ref: plan,
    approval_digest: digest,
    plan_base64url: "e30",
    consent_base64url: "e30",
    approval_base64url: "e30",
    signature_base64url: "e30",
  };
  for (const [name, body, cases] of [
    [
      "RegisterKeyContextRequest",
      registration,
      [
        { key_context_base64url: "e30=" },
        { key_context_base64url: "a".repeat(21847) },
        { key_context_ref: { ...keyContext, key_epoch: 1 } },
      ],
    ],
    [
      "CreateInputUploadRequest",
      upload,
      [
        { artifact_kind: "PRIVATE_KEY" },
        { byte_length: 0 },
        { byte_length: 1073741825 },
        { idempotency_key: undefined },
        { manifest_digest: digest.toUpperCase() },
      ],
    ],
    [
      "RegisterComputeApprovalRequest",
      approval,
      [
        { plan_base64url: undefined },
        { consent_base64url: "e30=" },
        { approval_base64url: "a".repeat(10924) },
        { signature_base64url: "a".repeat(2732) },
      ],
    ],
  ]) {
    assert.deepEqual(decode(name, body), body);
    for (const patch of [
      ...cases,
      { attempt: {} },
      { credential: "secret" },
      { ciphertext: "bulk" },
    ]) {
      assert.throws(() => decode(name, { ...body, ...patch }));
    }
    assert.throws(() => decodeRuntime(name, new Uint8Array(65537)), /64 KiB/);
  }
});
