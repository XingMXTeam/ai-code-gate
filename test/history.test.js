import { test } from "node:test";
import assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  appendHistory,
  computeTrend,
  formatTrend,
  historyFileName,
  readPreviousReport,
} from "../src/history.js";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "bin", "gate.js");
const goodExample = join(here, "..", "examples", "good");

const fakeReport = (structure, total, passed, at = null) => ({
  dimensions: { structure: { score: structure }, data: { score: 90 } },
  totalScore: total,
  passed,
  shortCircuitedAt: at,
});

test("history appends and never overwrites", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-history-"));
  const when = new Date("2026-01-02T03:04:05.000Z");
  const report = fakeReport(70, 80, false, "canRun");
  const name = appendHistory(dir, report, when);
  assert.equal(name, historyFileName(when));
  assert.equal(appendHistory(dir, fakeReport(99, 99, true), when), null);
  const previous = readPreviousReport(dir);
  assert.equal(previous.totalScore, 80);
  assert.equal(readdirSync(dir).length, 1);
  assert.ok(existsSync(join(dir, name)));
});

test("trend computes per-dimension deltas and verdict changes", () => {
  const trend = computeTrend(
    fakeReport(70, 80, false, "canRun"),
    fakeReport(85, 90, true)
  );
  assert.equal(trend.dimensions.structure.delta, 15);
  assert.equal(trend.dimensions.data.delta, 0);
  assert.equal(trend.total.delta, 10);
  assert.equal(trend.changed, true);
  assert.equal(trend.verdict.before, "FAIL@canRun");
  assert.equal(trend.verdict.after, "PASS");
  const text = formatTrend(trend);
  assert.ok(text.includes("verdict changed"));
  assert.equal(computeTrend(null, fakeReport(1, 1, true)), null);
});

test("CLI --history accumulates runs and prints the trend on the second", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-history-cli-"));
  const run = () =>
    spawnSync("node", [bin, goodExample, "--history", dir], { encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(!first.stdout.includes("trend (vs previous run)"));
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.ok(second.stdout.includes("trend (vs previous run)"));
  assert.ok(second.stdout.includes("verdict unchanged"));
  assert.equal(readdirSync(dir).filter((f) => f.endsWith(".json")).length, 2);
});

test("CLI --report writes the JSON report to a path", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-report-"));
  const out = join(dir, "nested", "report.json");
  const run = spawnSync("node", [bin, goodExample, "--report", out], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const parsed = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(parsed.passed, true);
});
