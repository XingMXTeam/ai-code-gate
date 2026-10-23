import { execSync } from "node:child_process";
import { collectFiles, isTestFile } from "./scan.js";
import {
  checkStructure,
  checkLogic,
  checkData,
  checkUi,
  checkE2e,
} from "./rules.js";

const CHECKS = {
  structure: (files, cfg) => checkStructure(files, cfg.rules.structure),
  logic: (files, cfg) => checkLogic(files, cfg.rules.logic),
  data: (files, cfg) => checkData(files, cfg.rules.data),
  ui: (files, cfg) => checkUi(files, cfg.rules.ui),
  e2e: (files, cfg) => checkE2e(files, cfg.rules.e2e, isTestFile),
};

// Run the gates in order. The first dimension that scores below its
// threshold fails the run and every later dimension is reported as
// "skipped" — the same fail-fast logic a CI pipeline should use.
export function evaluate(root, config) {
  const files = collectFiles(root, config);
  const report = {
    root,
    fileCount: files.length,
    compiled: null,
    dimensions: [],
    verdict: "pass",
    failedGate: null,
  };

  if (config.compileCommand) {
    try {
      execSync(config.compileCommand, { cwd: root, stdio: "pipe" });
      report.compiled = true;
    } catch {
      report.compiled = false;
      report.verdict = "fail";
      report.failedGate = "compile";
      return report;
    }
  }

  let shortCircuited = false;
  for (const dim of config.gateOrder) {
    if (shortCircuited) {
      report.dimensions.push({
        name: dim,
        score: null,
        threshold: config.thresholds[dim],
        status: "skipped",
        violations: [],
      });
      continue;
    }
    const violations = CHECKS[dim](files, config);
    const deducted = violations.reduce((sum, v) => sum + v.points, 0);
    const score = Math.max(0, 100 - deducted);
    const status = score >= config.thresholds[dim] ? "pass" : "fail";
    report.dimensions.push({
      name: dim,
      score,
      threshold: config.thresholds[dim],
      status,
      violations,
    });
    if (status === "fail") {
      report.verdict = "fail";
      report.failedGate = dim;
      shortCircuited = true;
    }
  }
  return report;
}

export function formatReport(report) {
  const out = [];
  out.push(`ai-code-gate — scanned ${report.fileCount} file(s) in ${report.root}`);
  if (report.compiled !== null)
    out.push(`compile pre-gate: ${report.compiled ? "ok" : "FAILED"}`);
  out.push("");
  for (const dim of report.dimensions) {
    if (dim.status === "skipped") {
      out.push(`  ${dim.name.padEnd(10)} skipped (earlier gate failed)`);
      continue;
    }
    const mark = dim.status === "pass" ? "PASS" : "FAIL";
    out.push(
      `  ${dim.name.padEnd(10)} ${String(dim.score).padStart(3)}/100  (threshold ${dim.threshold})  ${mark}`
    );
    for (const v of dim.violations) {
      out.push(`    - ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
  }
  out.push("");
  out.push(
    report.verdict === "pass"
      ? "VERDICT: PASS — all gates cleared."
      : `VERDICT: FAIL — stopped at the "${report.failedGate}" gate. Fix these before anything else.`
  );
  return out.join("\n");
}
