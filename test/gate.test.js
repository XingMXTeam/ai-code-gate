import { test } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";

const here = dirname(fileURLToPath(import.meta.url));
const ex = (name) => join(here, "..", "examples", name);

test("good example passes all gates", () => {
  const report = evaluate(ex("good"), mergeConfig({}));
  assert.equal(report.verdict, "pass", JSON.stringify(report.dimensions, null, 2));
});

test("bad example fails and short-circuits", () => {
  const report = evaluate(ex("bad"), mergeConfig({}));
  assert.equal(report.verdict, "fail");
  const skipped = report.dimensions.filter((d) => d.status === "skipped");
  assert.ok(skipped.length > 0, "later gates should be skipped after a failure");
});

test("bad example is caught for a hardcoded secret", () => {
  const report = evaluate(ex("bad"), mergeConfig({}));
  const all = report.dimensions.flatMap((d) => d.violations);
  assert.ok(all.some((v) => v.rule === "hardcoded-secret"));
});
