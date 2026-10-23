import { test } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergeConfig, globMatch } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";
import { parseEditableScope, matchScope } from "../src/scope.js";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const ex = (name) => join(here, "..", "examples", name);
// Load each example's own gate.config.json, the same way the CLI does.
const cfgFor = (name) =>
  mergeConfig(JSON.parse(readFileSync(join(ex(name), "gate.config.json"), "utf8")));

test("good example passes all gates", () => {
  const report = evaluate(ex("good"), mergeConfig({}));
  assert.equal(report.passed, true, JSON.stringify(report.gates, null, 2));
  assert.equal(report.shortCircuitedAt, null);
});

test("bad example fails at the first gate and short-circuits", () => {
  const report = evaluate(ex("bad"), mergeConfig({}));
  assert.equal(report.passed, false);
  assert.equal(report.shortCircuitedAt, "canRun");
  const skipped = report.gates.filter((g) => g.status === "skipped");
  assert.equal(skipped.length, 3);
});

test("bad example is caught for a hardcoded secret", () => {
  const report = evaluate(ex("bad"), mergeConfig({}));
  assert.ok(report.failedReasons.some((r) => r.check === "hardcoded-secret"));
});

test("bad example violates architecture layer rules", () => {
  const report = evaluate(ex("bad"), cfgFor("bad"));
  const names = report.failedReasons.map((r) => r.check);
  assert.ok(names.includes("import-layer"));
  assert.ok(names.includes("cross-route-import"));
});

test("unconfigured compile is neutral, never a silent pass", () => {
  const report = evaluate(ex("good"), mergeConfig({}));
  assert.ok(report.notCovered.some((n) => n.includes("compile")));
  const compile = report.dimensions.structure.checks.find((c) => c.name === "compile");
  assert.equal(compile.passed, null);
});

test("glob matching spans directories only with **", () => {
  assert.equal(globMatch("src/app/**", "src/app/checkout/pricing"), true);
  assert.equal(globMatch("src/lib/**", "src/lib/format.ts"), true);
  assert.equal(globMatch("src/*/x.ts", "src/a/b/x.ts"), false);
  assert.equal(globMatch("**/tokens/**", "src/tokens/colors.ts"), true);
  assert.equal(globMatch("gate.config.json", "gate.config.json"), true);
});

test("editable scope parsing and matching", () => {
  const md = "# Plan\n\n## 可改范围\n\n- `src/app/**`\n- `docs/*`\n\n## Other\n- `nope/**`\n";
  const scope = parseEditableScope(md);
  assert.deepEqual(scope, ["src/app/**", "docs/*"]);
  assert.equal(matchScope("src/app/a/b.ts", "src/app/**"), true);
  assert.equal(matchScope("docs/a/b.md", "docs/*"), false);
  assert.equal(matchScope("docs/a.md", "docs/*"), true);
  assert.equal(parseEditableScope("# no scope here"), null);
});

test("exemptions neutralize a failed check with a reason", () => {
  const cfg = mergeConfig({
    exemptions: [
      { path: "src/api.ts", rules: ["hardcoded-secret"], reason: "fixture data" },
    ],
  });
  const report = evaluate(ex("bad"), cfg);
  const secret = report.dimensions.data.checks.find((c) => c.name === "hardcoded-secret");
  assert.equal(secret.passed, null);
  assert.ok(secret.message.includes("exempted"));
});

test("input-driven checks: plan, tokens, i18n, storage, evidence", () => {
  const report = evaluate(ex("bad"), cfgFor("bad"));
  const names = report.failedReasons.map((r) => r.check);
  for (const expected of [
    "fp-not-covered",
    "unknown-design-token",
    "i18n-missing-key",
    "storage-key-namespace",
    "no-any",
    "blank-screenshot-evidence",
  ]) {
    assert.ok(names.includes(expected), `expected ${expected} in ${names.join(",")}`);
  }
});

test("e2e is scored from real run results when provided", () => {
  const bad = evaluate(ex("bad"), cfgFor("bad"));
  assert.ok(bad.failedReasons.some((r) => r.check === "e2e-failures"));
  const good = evaluate(ex("good"), cfgFor("good"));
  const e2eCheck = good.dimensions.e2e.checks.find((c) => c.name === "e2e-results");
  assert.equal(e2eCheck.passed, true);
  assert.equal(good.dimensions.e2e.score, 100);
});

test("template kit config loads and init --with-kit installs it", () => {
  const kitDir = join(here, "..", "templates", "nextjs-harness");
  const cfg = mergeConfig(
    JSON.parse(readFileSync(join(kitDir, "gate.config.json"), "utf8"))
  );
  assert.equal(cfg.gates.length, 4);
  assert.ok(cfg.inputs.plan && cfg.inputs.designTokens && cfg.inputs.e2eResults);

  const tmp = mkdtempSync(join(tmpdir(), "gate-kit-"));
  const bin = join(here, "..", "bin", "gate.js");
  const run = spawnSync("node", [bin, "init", tmp, "--with-kit"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  for (const rel of ["gate.config.json", "plan.md", "design-tokens.json", "locales/en.json", "TEMPLATE.md"]) {
    assert.ok(existsSync(join(tmp, rel)), `kit file ${rel} installed`);
  }
  // A kit-installed empty project evaluates without crashing (inputs are
  // skeletons: e2e results are 0/0 = neutral, not a crash).
  const report = evaluate(tmp, cfg);
  assert.ok(report.dimensions.e2e);
});
