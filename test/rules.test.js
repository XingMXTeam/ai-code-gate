import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";

// "http:" and the rest are joined at runtime so this test file does not
// itself carry a plain-http literal for the gate to find.
const HTTP = "http:" + "//api.example.com/v1";

function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "gate-rules-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

test("stylesheet hex colors count in code position, not in comments", () => {
  const dir = tempProject({
    "src/a.css": [
      "/* palette draft: #aaaaaa #bbbbbb #cccccc */",
      ".a { color: #ffffff; background: #000000; border-color: #111111; outline-color: #222222; }",
      "",
    ].join("\n"),
  });
  const cfg = mergeConfig({ extensions: [".css"] });
  const report = evaluate(dir, cfg);
  const hit = report.dimensions.ui.checks.find((c) => c.name === "raw-hex-colors");
  assert.ok(hit, "raw hex check fires on the stylesheet");
  assert.ok(hit.message.includes("4 raw hex colors"), hit.message);
});

test("insecure URLs are found in literal contents with true line numbers", () => {
  const dir = tempProject({
    "src/a.ts": `const fine = 1;\nconst endpoint = "${HTTP}";\nexport const x = endpoint;\n`,
  });
  const report = evaluate(dir, mergeConfig({}));
  const hit = report.dimensions.data.checks.find((c) => c.name === "insecure-url");
  assert.ok(hit);
  assert.equal(hit.evidence, "src/a.ts:2");
});

test("a URL mentioned in a comment is not an endpoint", () => {
  const dir = tempProject({
    "src/a.ts": `// docs used to live at ${HTTP} before the move\nexport const a = 1;\n`,
  });
  const report = evaluate(dir, mergeConfig({}));
  assert.ok(!report.failedReasons.some((r) => r.check === "insecure-url"));
});
