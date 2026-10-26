import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Schema } from "effect";
import { ENGINE_SCHEMAS, engineFixtures, validateExecuteRequest } from "../dist/engine.js";
import { ArtifactRef, CONTROL_SCHEMAS, decodeArtifactRef } from "../dist/index.js";
import { assertControlBytes } from "../dist/transport.js";

const vectors = JSON.parse(readFileSync(new URL("../bindings/vectors.json", import.meta.url)));
const schemas = { ArtifactRef, ...CONTROL_SCHEMAS, ...ENGINE_SCHEMAS };
test("native golden logical values satisfy the authoritative Effect contracts", () => {
  assert.deepEqual(
    [...new Set(vectors.map(({ type }) => type))].sort(),
    Object.keys(schemas).sort(),
  );
  for (const { type, value, wire } of vectors) {
    Schema.decodeUnknownSync(schemas[type], { onExcessProperty: "error" })(value);
    assert.match(wire, /^(?:[0-9a-f]{2})+$/);
    assertControlBytes(Buffer.from(wire, "hex"));
    if (type === "ExecuteRequest") validateExecuteRequest(value, engineFixtures.capabilities, "0");
    if (type === "ArtifactRef") decodeArtifactRef(value);
  }
  assert.ok(vectors.some(({ wire }) => wire.length / 2 === 65536));
  assert.ok(
    vectors.some(({ type, value }) => type === "Attempt" && value.fence === "18446744073709551615"),
  );
});
