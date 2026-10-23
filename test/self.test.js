import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// Self-bootstrap: the gate must pass on its own repository, graded by
// the repo's own gate.config.json under the public default thresholds.
// This runs in the normal test suite, so CI enforces it too.
test("the gate passes on its own repository", () => {
  const cfg = mergeConfig(
    JSON.parse(readFileSync(join(repoRoot, "gate.config.json"), "utf8"))
  );
  const report = evaluate(repoRoot, cfg);
  assert.equal(
    report.passed,
    true,
    `self-gate failed: ${JSON.stringify(report.remediation, null, 2)}`
  );
  assert.equal(report.shortCircuitedAt, null);
});
