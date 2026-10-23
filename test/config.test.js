import { test } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { globMatch, mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";

const here = dirname(fileURLToPath(import.meta.url));
const badExample = join(here, "..", "examples", "bad");

test("mergeConfig passes through exclude and historyDir", () => {
  const cfg = mergeConfig({ exclude: ["fixtures/**"], historyDir: ".gate-history" });
  assert.deepEqual(cfg.exclude, ["fixtures/**"]);
  assert.equal(cfg.historyDir, ".gate-history");
  const plain = mergeConfig({});
  assert.deepEqual(plain.exclude, []);
  assert.equal(plain.historyDir, null);
  assert.ok(globMatch("fixtures/**", "fixtures/a/b.ts"));
});

test("exclude removes matching files from scoring", () => {
  const full = evaluate(badExample, mergeConfig({}));
  assert.ok(full.failedReasons.some((r) => r.check === "cross-route-import"));
  const excluded = evaluate(badExample, mergeConfig({ exclude: ["src/app/**"] }));
  assert.ok(!excluded.failedReasons.some((r) => r.check === "cross-route-import"));
  assert.ok(excluded.failedReasons.some((r) => r.check === "import-layer"));
  assert.ok(excluded.fileCount < full.fileCount);
});

test("new inputs are accepted by mergeConfig", () => {
  const cfg = mergeConfig({
    inputs: { testResults: "r.json", coverage: "cov/coverage-summary.json" },
  });
  assert.equal(cfg.inputs.testResults, "r.json");
  assert.equal(cfg.inputs.coverage, "cov/coverage-summary.json");
  assert.equal(cfg.inputs.e2eResults, null);
});
