import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mergeConfig } from "../src/config.js";
import { evaluate } from "../src/evaluate.js";
import { lineStarts, maskSource } from "../src/mask.js";
import {
  extractImports,
  loadAliases,
  parseJsonc,
  resolveToFile,
  specifierCandidates,
} from "../src/imports.js";

function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "gate-imports-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

function viewOf(source) {
  const v = maskSource(source, "a.ts");
  v.lineStarts = lineStarts(v.code);
  return v;
}

test("all five import forms enter the graph", () => {
  const src = [
    'import def from "./a";',
    'import "./side";',
    'export { x } from "./b";',
    'const r = require("./c");',
    'const p = import("./d");',
    "",
  ].join("\n");
  const imports = extractImports(viewOf(src));
  assert.deepEqual(imports.map((i) => i.spec), ["./a", "./side", "./b", "./c", "./d"]);
  assert.deepEqual(imports.map((i) => i.kind), ["static", "static", "export", "require", "dynamic"]);
});

test("resolution probes extensions and directory indexes", () => {
  const fileSet = new Set(["src/lib/util.ts", "src/lib/index.ts", "src/a/b.tsx"]);
  const exts = [".js", ".ts", ".tsx"];
  assert.equal(resolveToFile(["src/lib/util"], fileSet, exts), "src/lib/util.ts");
  assert.equal(resolveToFile(["src/lib"], fileSet, exts), "src/lib/index.ts");
  assert.equal(resolveToFile(["src/a/b.tsx"], fileSet, exts), "src/a/b.tsx");
  assert.equal(resolveToFile(["src/nope"], fileSet, exts), null);
  assert.deepEqual(specifierCandidates("src/x.ts", "react", []), []);
});

test("tsconfig paths are read through JSONC comments and trailing commas", () => {
  const dir = tempProject({
    "tsconfig.json": [
      "{",
      "  // path aliases for the app",
      '  "compilerOptions": {',
      '    "paths": { "@lib/*": ["src/lib/*"], },',
      "  },",
      "}",
      "",
    ].join("\n"),
  });
  const aliases = loadAliases(dir);
  assert.deepEqual(aliases, [{ pattern: "@lib/*", targets: ["src/lib/*"] }]);
  assert.deepEqual(specifierCandidates("src/features/f.ts", "@lib/util", aliases), ["src/lib/util"]);
  assert.deepEqual(parseJsonc('{ "a": 1, }'), { a: 1 });
});

test("an aliased import is checked against layer rules", () => {
  const dir = tempProject({
    "tsconfig.json": '{ "compilerOptions": { "paths": { "@lib/*": ["src/lib/*"] } } }',
    "src/features/f.ts": 'import { u } from "@lib/util";\nexport const y = u;\n',
    "src/lib/util.ts": "export const u = 1;\n",
  });
  const cfg = mergeConfig({
    rules: {
      structure: {
        crossRoute: null,
        importRules: [
          { from: "src/features/**", to: "src/lib/**", message: "features must not import lib directly" },
        ],
      },
    },
  });
  const report = evaluate(dir, cfg);
  assert.ok(report.failedReasons.some((r) => r.check === "import-layer"));
});

test("import cycles are reported", () => {
  const dir = tempProject({
    "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
    "src/b.ts": 'import { a } from "./a";\nexport const b = a;\n',
  });
  const report = evaluate(dir, mergeConfig({}));
  assert.ok(report.failedReasons.some((r) => r.check === "import-cycle"));
});
