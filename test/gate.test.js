import { test } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergeConfig, globMatch } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";
import { parseEditableScope, matchScope } from "../src/scope.js";

const here = dirname(fileURLToPath(import.meta.url));
const ex = (name) => join(here, "..", "examples", name);

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
  const report = evaluate(ex("bad"), mergeConfig({}));
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
