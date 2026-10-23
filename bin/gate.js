#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { evaluate, formatReport } from "../src/evaluate.js";
import { verifyZone } from "../src/zone.js";
import { checkScope } from "../src/scope.js";
import {
  appendHistory,
  computeTrend,
  readPreviousReport,
} from "../src/history.js";

const rawArgs = process.argv.slice(2);
const VALUE_FLAGS = ["--history", "--report"];
const flagValues = {};
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (VALUE_FLAGS.includes(rawArgs[i])) {
    flagValues[rawArgs[i]] = rawArgs[i + 1];
    i++;
  } else {
    args.push(rawArgs[i]);
  }
}
const json = args.includes("--json");
const positional = args.filter((a) => !a.startsWith("--"));
const command = positional[0] || ".";

function usage() {
  console.log(`ai-code-gate — deterministic quality gates for AI-generated code

Usage:
  ai-gate [path]                 Score the project at [path] (default: .)
  ai-gate init [path] [--with-kit]
                                 Write a default gate.config.json.
                                 --with-kit also installs the template kit
                                 (plan.md, design-tokens.json, locales/,
                                 e2e-results.json, ui-evidence/, TEMPLATE.md)
  ai-gate verify-zone [path]     Block if protected files changed without
                                 GATE_HUMAN_CONFIRM=yes
  ai-gate scope <plan.md> [path] Block if changes fall outside the plan's
                                 declared editable scope
  ai-gate --json [path]          Machine-readable report (for CI)
  ai-gate --history <dir> [path] Append the JSON report to a history
                                 directory and print a trend vs the
                                 previous run (or set "historyDir" in
                                 gate.config.json)
  ai-gate --report <path> [path] Also write the JSON report to <path>

Exit codes: 0 = pass, 1 = blocked/failed, 2 = usage/config error`);
}

if (command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

function loadConfig(root) {
  const configPath = join(root, "gate.config.json");
  let userConfig = {};
  if (existsSync(configPath)) {
    try {
      userConfig = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (err) {
      console.error(`Cannot parse ${configPath}: ${err.message}`);
      process.exit(2);
    }
  }
  return mergeConfig(userConfig);
}

if (command === "init") {
  const target = resolve(positional[1] || ".");
  if (args.includes("--with-kit")) {
    const kitDir = join(
      dirname(new URL(import.meta.url).pathname),
      "..",
      "templates",
      "nextjs-harness"
    );
    const kitFiles = [
      "gate.config.json",
      "plan.md",
      "design-tokens.json",
      "locales/en.json",
      "e2e-results.json",
      "ui-evidence/.gitkeep",
      "TEMPLATE.md",
    ];
    let copied = 0;
    for (const rel of kitFiles) {
      const dest = join(target, rel);
      if (existsSync(dest)) {
        console.log(`kept existing ${rel}`);
        continue;
      }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(join(kitDir, rel)));
      console.log(`wrote ${rel}`);
      copied++;
    }
    console.log(
      copied > 0
        ? "\nKit installed. Open TEMPLATE.md and replace every path, glob and threshold with your own."
        : "\nNothing copied — all kit files already exist."
    );
    process.exit(0);
  }
  const file = join(target, "gate.config.json");
  if (existsSync(file)) {
    console.error(`gate.config.json already exists at ${file}`);
    process.exit(2);
  }
  writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  console.log(`Wrote ${file}`);
  process.exit(0);
}

if (command === "verify-zone") {
  const root = resolve(positional[1] || ".");
  const result = verifyZone(root, loadConfig(root));
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok)
    console.log(`verify-zone: OK${result.touched.length ? ` — ${result.touched.join(", ")} (confirmed)` : " — no protected files touched"}`);
  else {
    console.error(`verify-zone: BLOCKED — ${result.reason}`);
    for (const f of result.touched) console.error(`  - ${f}`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (command === "scope") {
  const plan = positional[1];
  if (!plan) {
    console.error("usage: ai-gate scope <plan.md> [path]");
    process.exit(2);
  }
  const root = resolve(positional[2] || ".");
  const result = checkScope(root, resolve(plan));
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`scope: OK${result.note ? ` — ${result.note}` : ""}`);
  else {
    console.error(`scope: BLOCKED — ${result.reason || "changes outside scope"}`);
    for (const f of result.outside) console.error(`  - ${f}`);
  }
  process.exit(result.ok ? 0 : 1);
}

const root = resolve(command);
const config = loadConfig(root);
const report = evaluate(root, config);

// History: compare against the previous run first, then append this
// one (immutable, timestamped, never overwritten).
const historyDir = flagValues["--history"] || config.historyDir;
if (historyDir) {
  const dir = resolve(root, historyDir);
  const trend = computeTrend(readPreviousReport(dir), report);
  if (trend) report.trend = trend;
  appendHistory(dir, report);
}
if (flagValues["--report"]) {
  const reportPath = resolve(flagValues["--report"]);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
}
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(formatReport(report));
process.exit(report.passed ? 0 : 1);
