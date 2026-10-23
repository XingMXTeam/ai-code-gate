import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";
import { extractScriptBlocks } from "../src/scan.js";
import { lineStarts, maskSource } from "../src/mask.js";

function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "gate-mask-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const failedNames = (report) => report.failedReasons.map((r) => r.check);

test("mask views preserve length and line layout", () => {
  const src = "const a = 'x\ny';\n// note\nconst b = 2;\n";
  const view = maskSource(src, "a.ts");
  assert.equal(view.code.length, src.length);
  assert.equal(view.comments.length, src.length);
  assert.equal(view.code.split("\n").length, src.split("\n").length);
  assert.ok(!view.code.includes("note"));
  assert.ok(view.comments.includes("note"));
  assert.equal(lineStarts(view.code).length, 5);
});

test("mentions inside strings and comments do not trigger content rules", () => {
  const dir = tempProject({
    "src/a.ts": [
      'const label = "please console.log the token = \'aaaaaaaaaaaaaaaa\'";',
      "const note = `status: debugger; @ts-ignore; password = \"bbbbbbbbbbbb\"`;",
      "// a prose remark about console.log and the any type",
      "export function ok() { return label + note; }",
      "",
    ].join("\n"),
  });
  const names = failedNames(evaluate(dir, mergeConfig({})));
  for (const rule of ["console-log", "forbidden-pattern", "no-any", "no-ts-suppress", "hardcoded-secret"]) {
    assert.ok(!names.includes(rule), `${rule} must not fire on string/comment mentions`);
  }
});

test("template literal expressions are real code and are checked", () => {
  const dir = tempProject({
    "src/a.ts": "export function render(x) {\n  return `value: ${console.log(x)}`;\n}\n",
  });
  const names = failedNames(evaluate(dir, mergeConfig({})));
  assert.ok(names.includes("console-log"));
});

test("real comment directives and deferred-work markers still fire", () => {
  const dir = tempProject({
    "src/b.ts": [
      "// @ts-ignore",
      "// TODO one",
      "// TODO two",
      "// TODO three",
      "// TODO four",
      "export function b() { return 1; }",
      "",
    ].join("\n"),
  });
  const names = failedNames(evaluate(dir, mergeConfig({})));
  assert.ok(names.includes("no-ts-suppress"));
  assert.ok(names.includes("too-many-todos"));
});

test("a directive mentioned mid-comment is prose, not a suppression", () => {
  const dir = tempProject({
    "src/c.ts": "// note: we removed the @ts-ignore from here last week\nexport function c() { return 1; }\n",
  });
  const names = failedNames(evaluate(dir, mergeConfig({})));
  assert.ok(!names.includes("no-ts-suppress"));
});

test("vue/svelte script extraction keeps script, blanks the rest", () => {
  const sfc = [
    "<template><div>console.log in markup</div></template>",
    "<script setup>",
    'console.log("real");',
    "</script>",
    "",
  ].join("\n");
  const extracted = extractScriptBlocks(sfc);
  assert.equal(extracted.split("\n").length, sfc.split("\n").length);
  assert.ok(!extracted.includes("in markup"));
  assert.ok(extracted.includes('console.log("real")'));

  const dir = tempProject({ "src/App.vue": sfc });
  const report = evaluate(dir, mergeConfig({}));
  const hit = report.dimensions.logic.checks.find((c) => c.name === "console-log");
  assert.ok(hit && hit.message.includes("1 console.log"));
});
