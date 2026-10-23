import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mergeConfig } from "../src/config.js";
import { collectFiles, isTestFile } from "../src/scan.js";

function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "gate-scan-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

test("collectFiles honors ignore, exclude and extensions", () => {
  const dir = tempProject({
    "src/a.ts": "export const a = 1;\n",
    "src/b.md": "# not code\n",
    "node_modules/pkg/c.js": "module.exports = {};\n",
    "fixtures/d.ts": "export const d = 1;\n",
  });
  const cfg = mergeConfig({ exclude: ["fixtures/**"] });
  const rels = collectFiles(dir, cfg).map((f) => f.rel);
  assert.deepEqual(rels, ["src/a.ts"]);
});

test("collectFiles extracts vue script blocks with positions intact", () => {
  const dir = tempProject({
    "src/App.vue": "<template><p>hi</p></template>\n<script>\nexport const a = 1;\n</script>\n",
  });
  const files = collectFiles(dir, mergeConfig({}));
  assert.equal(files.length, 1);
  assert.ok(files[0].content.includes("export const a = 1;"));
  assert.ok(!files[0].content.includes("<p>hi</p>"));
  assert.equal(files[0].content.split("\n").length, 5);
});

test("isTestFile recognizes test naming conventions", () => {
  assert.equal(isTestFile("src/a.test.ts"), true);
  assert.equal(isTestFile("src/a.spec.ts"), true);
  assert.equal(isTestFile("tests/a.ts"), true);
  assert.equal(isTestFile("src/__tests__/a.ts"), true);
  assert.equal(isTestFile("src/a.ts"), false);
  assert.equal(isTestFile("src/contest.ts"), false);
});
