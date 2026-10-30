import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRatification, pins } from "../tools/check-ratification.mjs";

const record = readFileSync(new URL("../docs/m0-ratification.md", import.meta.url), "utf8");
test("frozen ratification record stays blocked and matches the tested candidate", () => {
  assert.equal(checkRatification(record), "BLOCKED_PENDING_SIGNOFFS");
});
test("ratification cannot infer approval or omit a required reviewer", () => {
  for (const text of [
    record.replace("BLOCKED_PENDING_SIGNOFFS", "APPROVED"),
    record.replace("Security reviewer", "Unknown reviewer"),
    record.replace("NOT_NOMINATED", "A reviewer"),
    record.replace(/MISSING\s*\|\s*PENDING/, "MISSING | APPROVED"),
    record.replace(Object.values(pins)[0], "0".repeat(64)),
  ])
    assert.throws(() => checkRatification(text));
});
test("stale candidate bytes and enabled profiles reject independently of prose", () => {
  for (const path of Object.keys(pins)) {
    assert.throws(() =>
      checkRatification(record, (name) =>
        name === path
          ? Buffer.from("changed")
          : readFileSync(new URL(`../${name}`, import.meta.url)),
      ),
    );
  }
});
