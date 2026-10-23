import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";
import { parseCoverage, parseTestResults } from "../src/artifacts.js";

function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "gate-artifacts-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

test("test-results formats are auto-detected", () => {
  assert.deepEqual(parseTestResults({ passed: 3, failed: 1 }), {
    format: "simple", passed: 3, failed: 1, total: 4,
  });
  assert.deepEqual(
    parseTestResults({ numPassedTests: 8, numFailedTests: 2, numTotalTests: 10 }),
    { format: "jest", passed: 8, failed: 2, total: 10 }
  );
  assert.deepEqual(
    parseTestResults({ stats: { expected: 5, unexpected: 1, skipped: 2 }, suites: [] }),
    { format: "playwright", passed: 5, failed: 1, total: 6 }
  );
  const walked = parseTestResults({
    suites: [
      { specs: [{ ok: true }, { ok: false }], suites: [{ specs: [{ ok: true }] }] },
    ],
  });
  assert.deepEqual(walked, { format: "playwright", passed: 2, failed: 1, total: 3 });
  assert.equal(parseTestResults({ hello: "world" }), null);
});

test("istanbul coverage summaries parse to a mean", () => {
  const cov = parseCoverage({
    total: {
      lines: { pct: 80 },
      statements: { pct: 90 },
      functions: { pct: 70 },
      branches: { pct: 60 },
    },
  });
  assert.equal(cov.mean, 75);
  assert.equal(cov.branches, 60);
  assert.equal(parseCoverage({ total: {} }), null);
  assert.equal(parseCoverage(null), null);
});

test("e2e score is a transparent composite of run, coverage, presence", () => {
  const dir = tempProject({
    "src/a.ts": "export const a = 1;\n",
    "results/jest.json": JSON.stringify({ numPassedTests: 8, numFailedTests: 2, numTotalTests: 10 }),
    "coverage/coverage-summary.json": JSON.stringify({
      total: {
        lines: { pct: 80 },
        statements: { pct: 80 },
        functions: { pct: 80 },
        branches: { pct: 80 },
      },
    }),
  });
  const cfg = mergeConfig({
    inputs: { testResults: "results/jest.json", coverage: "coverage/coverage-summary.json" },
  });
  const report = evaluate(dir, cfg);
  // run 80 (weight .6 -> 12), coverage 80 (.25 -> 5), presence 40 (.15 -> 9)
  assert.equal(report.dimensions.e2e.score, 74);
  const names = report.dimensions.e2e.checks.map((c) => c.name);
  assert.ok(names.includes("e2e-failures"));
  assert.ok(names.includes("e2e-coverage"));
  assert.ok(names.includes("low-test-presence"));
  const run = report.dimensions.e2e.checks.find((c) => c.name === "e2e-failures");
  assert.ok(run.message.includes("jest"));
});

test("the legacy e2eResults input name still works", () => {
  const dir = tempProject({
    "src/a.ts": "export const a = 1;\n",
    "src/a.test.ts": "export const t = 1;\n",
    "e2e.json": JSON.stringify({ passed: 4, failed: 0 }),
  });
  const cfg = mergeConfig({ inputs: { e2eResults: "e2e.json" } });
  const report = evaluate(dir, cfg);
  const res = report.dimensions.e2e.checks.find((c) => c.name === "e2e-results");
  assert.equal(res.passed, true);
  assert.equal(report.dimensions.e2e.score, 100);
});
