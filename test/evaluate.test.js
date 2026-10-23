import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mergeConfig } from "../src/config.js";
import { evaluate, formatReport } from "../src/evaluate.js";

function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "gate-evaluate-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

test("a configured compile command is actually run and reported", () => {
  const dir = tempProject({ "src/a.ts": "export const a = 1;\n" });
  const okCfg = mergeConfig({ compileCommand: "node --version" });
  const ok = evaluate(dir, okCfg);
  const okCheck = ok.dimensions.structure.checks.find((c) => c.name === "compile");
  assert.equal(okCheck.passed, true);

  const badCfg = mergeConfig({ compileCommand: "node -e \"process.exit(3)\"" });
  const bad = evaluate(dir, badCfg);
  const badCheck = bad.dimensions.structure.checks.find((c) => c.name === "compile");
  assert.equal(badCheck.passed, false);
  assert.equal(bad.passed, false);
});

test("report shape: dimensions, gates, no trend unless one is attached", () => {
  const dir = tempProject({ "src/a.ts": "export const a = 1;\n" });
  const report = evaluate(dir, mergeConfig({}));
  assert.deepEqual(Object.keys(report.dimensions), ["structure", "data", "logic", "ui", "e2e"]);
  assert.equal(report.gates.length, 4);
  assert.equal(report.trend, undefined);
  const text = formatReport(report);
  assert.ok(text.includes("VERDICT:"));
  assert.ok(!text.includes("trend (vs previous run)"));
  report.trend = {
    dimensions: { structure: { before: 1, after: 2, delta: 1 } },
    total: { before: 1, after: 2, delta: 1 },
    verdict: { before: "FAIL@canRun", after: "PASS" },
    changed: true,
  };
  assert.ok(formatReport(report).includes("trend (vs previous run)"));
});
