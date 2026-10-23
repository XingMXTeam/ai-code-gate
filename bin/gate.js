#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { evaluate, formatReport } from "../src/evaluate.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const command = args.find((a) => !a.startsWith("--")) || ".";

function usage() {
  console.log(`ai-code-gate — deterministic quality gates for AI-generated code

Usage:
  ai-gate [path]           Score the project at [path] (default: current dir)
  ai-gate init [path]      Write a default gate.config.json to [path]
  ai-gate --json [path]    Machine-readable report (for CI)

Exit codes: 0 = all gates pass, 1 = a gate failed, 2 = usage/config error`);
}

if (command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

if (command === "init") {
  const target = resolve(args.filter((a) => !a.startsWith("--"))[1] || ".");
  const file = join(target, "gate.config.json");
  if (existsSync(file)) {
    console.error(`gate.config.json already exists at ${file}`);
    process.exit(2);
  }
  writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  console.log(`Wrote ${file}`);
  process.exit(0);
}

const root = resolve(command);
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

const config = mergeConfig(userConfig);
const report = evaluate(root, config);
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(formatReport(report));
process.exit(report.verdict === "pass" ? 0 : 1);
