#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { evaluate, formatReport } from "../src/evaluate.js";
import { verifyZone } from "../src/zone.js";
import { checkScope } from "../src/scope.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const positional = args.filter((a) => !a.startsWith("--"));
const command = positional[0] || ".";

function usage() {
  console.log(`ai-code-gate — deterministic quality gates for AI-generated code

Usage:
  ai-gate [path]                 Score the project at [path] (default: .)
  ai-gate init [path]            Write a default gate.config.json
  ai-gate verify-zone [path]     Block if protected files changed without
                                 GATE_HUMAN_CONFIRM=yes
  ai-gate scope <plan.md> [path] Block if changes fall outside the plan's
                                 declared editable scope
  ai-gate --json [path]          Machine-readable report (for CI)

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
const report = evaluate(root, loadConfig(root));
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(formatReport(report));
process.exit(report.passed ? 0 : 1);
