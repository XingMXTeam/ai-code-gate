// Deterministic checks. Every check returns:
// { name, passed: true | false | null, message, evidence?, points }
// passed === null means "neutral": the check could not be verified in this
// environment. A neutral check deducts nothing — but it is printed, because
// an unverified check must never be silently counted as a pass.

import { globMatch } from "./config.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function linesOf(content) {
  return content.split("\n");
}
function countOccurrences(content, regex) {
  return (content.match(regex) || []).length;
}
function check(name, passed, message, extra = {}) {
  return { name, passed, message, points: 0, ...extra };
}
function violation(name, message, evidence, points) {
  return { name, passed: false, message, evidence, points };
}

// --- shared helpers --------------------------------------------------------

function longFunctions(file, maxLines) {
  const lines = linesOf(file.content);
  const startRe = /(function\s+\w+\s*\(|=>\s*\{|^\s+\w+\s*\([^)]*\)\s*\{|class\s+\w+)/;
  const found = [];
  let depth = 0;
  let start = -1;
  lines.forEach((line, i) => {
    if (start < 0 && startRe.test(line) && line.includes("{")) {
      start = i;
      depth = 0;
    }
    if (start >= 0) {
      depth += countOccurrences(line, /\{/g) - countOccurrences(line, /\}/g);
      if (depth <= 0) {
        const len = i - start + 1;
        if (len > maxLines) found.push({ line: start + 1, length: len });
        start = -1;
      }
    }
  });
  return found;
}

// Fix guidance depends on what kind of file overflowed — a page, a
// component and a service split in different directions.
function splitSuggestion(rel) {
  if (/service\.[tj]sx?$/.test(rel))
    return "Split by domain into several service files, or move types into a types file.";
  if (/components?\//.test(rel))
    return "Extract complex logic into a sibling hook and split sub-views into their own components.";
  if (/(page|index)\.[tj]sx?$/.test(rel))
    return "Move sub-components into a components/ folder and business logic into hooks.";
  return "Split into smaller modules, each with a single responsibility.";
}

function importsOf(file) {
  const found = [];
  linesOf(file.content).forEach((line, i) => {
    const m = line.match(/from\s+['"]([^'"]+)['"]/);
    if (m) found.push({ spec: m[1], line: i + 1 });
  });
  return found;
}

// Resolve an import specifier to a project-relative path (best effort:
// handles @/ alias and relative paths; bare package names return null).
function resolveImport(fromRel, spec) {
  if (spec.startsWith("@/")) return `src/${spec.slice(2)}`;
  if (spec.startsWith(".")) {
    const parts = fromRel.split("/").slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }
  return null;
}

// --- structure --------------------------------------------------------------

export function checkStructure(files, rules, ctx) {
  const checks = [];

  if (ctx.compiled === null) {
    checks.push(
      check("compile", null, "No compileCommand configured — compilation is unverified, not passed. Set compileCommand (e.g. \"npx tsc --noEmit\") to verify.")
    );
  } else {
    checks.push(
      check("compile", ctx.compiled, ctx.compiled ? "Compile command exited 0." : "Compile command failed — nothing else in this dimension matters until this is green.", { points: ctx.compiled ? 0 : 40 })
    );
  }

  for (const file of files) {
    const count = linesOf(file.content).length;
    if (count > rules.maxFileLines) {
      checks.push(
        violation("file-too-long", `File has ${count} lines (limit ${rules.maxFileLines}). ${splitSuggestion(file.rel)}`, `${file.rel}:${rules.maxFileLines + 1}`, 8)
      );
    }
    for (const fn of longFunctions(file, rules.maxFunctionLines)) {
      checks.push(
        violation("function-too-long", `Function spans ${fn.length} lines (limit ${rules.maxFunctionLines}). Long generated functions are where bugs hide.`, `${file.rel}:${fn.line}`, 6)
      );
    }
  }

  // Architecture layer rules (config-driven import directions).
  for (const rule of rules.importRules || []) {
    for (const file of files) {
      if (!globMatch(rule.from, file.rel)) continue;
      for (const imp of importsOf(file)) {
        const resolved = resolveImport(file.rel, imp.spec);
        if (resolved && globMatch(rule.to, resolved)) {
          checks.push(
            violation("import-layer", rule.message, `${file.rel}:${imp.line} imports ${imp.spec}`, 10)
          );
        }
      }
    }
  }

  // Route isolation (Next.js-style): a route may not import a sibling route.
  const cr = rules.crossRoute;
  if (cr && files.some((f) => f.rel.startsWith(`${cr.root}/`))) {
    for (const file of files) {
      const m = file.rel.match(new RegExp(`^${cr.root}/([^/]+)/`));
      if (!m || cr.sharedDirs.includes(m[1])) continue;
      const ownRoute = m[1];
      for (const imp of importsOf(file)) {
        const resolved = resolveImport(file.rel, imp.spec);
        if (!resolved) continue;
        const rm = resolved.match(new RegExp(`^${cr.root}/([^/]+)/`));
        if (rm && !cr.sharedDirs.includes(rm[1]) && rm[1] !== ownRoute) {
          checks.push(
            violation("cross-route-import", `Route "${ownRoute}" imports from route "${rm[1]}". Extract the shared piece into ${cr.sharedDirs.join(", ")}, hooks, or lib.`, `${file.rel}:${imp.line} imports ${imp.spec}`, 10)
          );
        }
      }
    }
  }

  // L1 language layer: the type system is the first harness. `any` and
  // ts-ignore are holes punched in it.
  for (const file of files) {
    const anys = countOccurrences(file.content, /:\s*any\b|as\s+any\b|<\s*any\s*>/g);
    if (anys > 0) {
      checks.push(
        violation("no-any", `${anys} use(s) of \`any\`. Every \`any\` is a place the compiler was told to look away.`, file.rel, Math.min(6 * anys, 18))
      );
    }
    const ignores = countOccurrences(file.content, /@ts-(ignore|nocheck)/g);
    if (ignores > 0) {
      checks.push(
        violation("no-ts-suppress", `${ignores} @ts-ignore/@ts-nocheck suppression(s). Silencing the compiler is not fixing the error.`, file.rel, Math.min(8 * ignores, 16))
      );
    }
  }

  if (!checks.some((c) => c.passed === false))
    checks.push(check("structure-rules", true, "No structural violations found."));
  return checks;
}

// --- data -------------------------------------------------------------------

export function checkData(files, rules, ctx = {}) {
  const checks = [];
  const secretRe = new RegExp(rules.secretPattern, "i");
  for (const file of files) {
    linesOf(file.content).forEach((line, i) => {
      if (secretRe.test(line)) {
        checks.push(
          violation("hardcoded-secret", "Possible hardcoded credential. Move it to an environment variable — generated code loves inventing plausible-looking keys.", `${file.rel}:${i + 1}`, 15)
        );
      }
      const urls = line.match(/http:\/\/[^\s'")]+/g) || [];
      for (const url of urls) {
        if (rules.allowHttpLocalhost && /^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) continue;
        checks.push(
          violation("insecure-url", `Plain http:// URL (${url}). Use https:// outside local development.`, `${file.rel}:${i + 1}`, 5)
        );
      }
    });
  }
  // Storage keys must be namespaced ({page}.{entity}.{field} shape):
  // un-namespaced keys collide across pages and leak across features.
  const storageRe = /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g;
  for (const file of files) {
    for (const m of file.content.matchAll(storageRe)) {
      if (!/^[\w-]+\.[\w-]+\.[\w-]+/.test(m[1])) {
        checks.push(
          violation("storage-key-namespace", `Storage key "${m[1]}" is not namespaced. Use a {page}.{entity}.{field} shape so keys cannot collide across features.`, file.rel, 5)
        );
      }
    }
  }

  // i18n completeness: keys called in code must exist in the resources.
  // Needs the resource files as input — code alone cannot prove this.
  const i18n = ctx.inputs?.i18n;
  if (i18n && Array.isArray(i18n.resources)) {
    try {
      const known = new Set();
      const flatten = (obj, prefix) => {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === "object") flatten(v, key);
          else known.add(key);
        }
      };
      for (const res of i18n.resources) {
        flatten(JSON.parse(readFileSync(join(ctx.root, res), "utf8")), "");
      }
      const callRe = new RegExp(
        i18n.callPattern || "(?:\\bt|\\$t|i18n\\.t)\\(\\s*['\"`]([^'\"`]+)['\"`]",
        "g"
      );
      const called = new Map();
      for (const file of files) {
        for (const m of file.content.matchAll(callRe)) {
          if (!called.has(m[1])) called.set(m[1], file.rel);
        }
      }
      for (const [key, where] of called) {
        if (!known.has(key)) {
          checks.push(
            violation("i18n-missing-key", `i18n key "${key}" is called in code but missing from the resource files. A missing key renders as a raw string in production.`, where, 6)
          );
        }
      }
      if (![...called.keys()].some((k) => !known.has(k)))
        checks.push(check("i18n-complete", true, `All ${called.size} called i18n key(s) exist in the resources.`));
    } catch (err) {
      checks.push(check("i18n-complete", null, `i18n resources could not be loaded (${err.message}) — completeness unverified.`));
    }
  }

  if (!checks.some((c) => c.passed === false))
    checks.push(check("data-rules", true, "No credential or endpoint violations found."));
  return checks;
}

// --- logic ------------------------------------------------------------------

export function checkLogic(files, rules, ctx = {}) {
  const checks = [];
  const forbidden = (rules.forbiddenPatterns || []).map((p) => new RegExp(p, "g"));
  for (const file of files) {
    const todos = countOccurrences(file.content, /\b(TODO|FIXME|HACK)\b/g);
    if (todos > rules.maxTodosPerFile) {
      checks.push(
        violation("too-many-todos", `${todos} TODO/FIXME markers in one file (limit ${rules.maxTodosPerFile}). AI code defers decisions with TODOs — resolve them instead.`, file.rel, 4)
      );
    }
    const consoles = countOccurrences(file.content, /console\.log\s*\(/g);
    if (consoles > 0) {
      checks.push(
        violation("console-log", `${consoles} console.log statement(s) left in code. Debug output is not a logging strategy.`, file.rel, Math.min(3 * consoles, 12))
      );
    }
    linesOf(file.content).forEach((line, i) => {
      for (const re of forbidden) {
        if (re.test(line)) {
          checks.push(
            violation("forbidden-pattern", `Forbidden pattern ${re.source} must not ship.`, `${file.rel}:${i + 1}`, 10)
          );
        }
      }
    });
  }
  // FP coverage: the plan's functional points are the contract. Each FP id
  // in the plan must be referenced somewhere in code or tests — an FP with
  // no reference was planned and silently not built.
  if (ctx.inputs?.plan) {
    try {
      const planText = readFileSync(join(ctx.root, ctx.inputs.plan), "utf8");
      const fpIds = [...new Set([...planText.matchAll(/\bFP-\d+(?:-\d+)?\b/g)].map((m) => m[0]))];
      if (fpIds.length === 0) {
        checks.push(check("fp-coverage", null, "Plan configured but contains no FP ids — coverage unverified."));
      } else {
        const corpus = files.map((f) => f.content).join("\n");
        const missing = fpIds.filter((id) => !corpus.includes(id));
        for (const id of missing) {
          checks.push(
            violation("fp-not-covered", `Plan functional point ${id} is not referenced anywhere in code or tests. Either it was not built, or it is not traceable — both fail the contract.`, ctx.inputs.plan, 8)
          );
        }
        if (missing.length === 0)
          checks.push(check("fp-coverage", true, `All ${fpIds.length} plan functional point(s) are referenced in code/tests.`));
      }
    } catch (err) {
      checks.push(check("fp-coverage", null, `Plan could not be read (${err.message}) — coverage unverified.`));
    }
  }

  if (!checks.some((c) => c.passed === false))
    checks.push(check("logic-rules", true, "No leftover debug output or deferred-work pile-ups found."));
  return checks;
}

// --- ui ---------------------------------------------------------------------

export function checkUi(files, rules, ctx = {}) {
  const checks = [];
  const uiFiles = files.filter((f) => /\.(jsx|tsx|css|scss)$/.test(f.rel));
  for (const file of uiFiles) {
    const imgs = file.content.match(/<img\b[^>]*>/g) || [];
    for (const tag of imgs) {
      if (!/\balt\s*=/.test(tag)) {
        checks.push(
          violation("img-missing-alt", "<img> without an alt attribute. Accessibility is part of the UI contract, not an afterthought.", `${file.rel}:${file.content.slice(0, file.content.indexOf(tag)).split("\n").length}`, 5)
        );
      }
    }
    const styles = countOccurrences(file.content, /style=\{\{/g);
    if (styles > rules.maxInlineStylesPerFile) {
      checks.push(
        violation("too-many-inline-styles", `${styles} inline style objects in one file (limit ${rules.maxInlineStylesPerFile}). Let the design system carry styling; inline styles are how generated UI drifts apart.`, file.rel, 4)
      );
    }
    const isTokenFile = (rules.tokenFilePatterns || []).some((p) => globMatch(p, file.rel));
    if (!isTokenFile) {
      const hexes = countOccurrences(file.content, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
      if (hexes > rules.maxRawHexPerFile) {
        checks.push(
          violation("raw-hex-colors", `${hexes} raw hex colors outside design-token files (limit ${rules.maxRawHexPerFile}). A raw hex looks right and silently forks the palette — use a token.`, file.rel, 4)
        );
      }
    }
  }
  // Design-token validity: var(--x) usages must exist in the token source.
  // Needs the token file as input — a made-up token name compiles fine and
  // silently renders as nothing.
  if (ctx.inputs?.designTokens) {
    try {
      const tokenPath = join(ctx.root, ctx.inputs.designTokens);
      const raw = readFileSync(tokenPath, "utf8");
      const known = new Set();
      if (ctx.inputs.designTokens.endsWith(".css")) {
        for (const m of raw.matchAll(/(--[\w-]+)\s*:/g)) known.add(m[1]);
      } else {
        const parsed = JSON.parse(raw);
        const collect = (node) => {
          if (Array.isArray(node)) node.forEach((v) => (typeof v === "string" ? known.add(v) : collect(v)));
          else if (node && typeof node === "object")
            for (const [k, v] of Object.entries(node)) {
              if (k.startsWith("--")) known.add(k);
              collect(v);
            }
        };
        collect(parsed);
      }
      const reported = new Set();
      for (const file of uiFiles) {
        for (const m of file.content.matchAll(/var\(\s*(--[\w-]+)/g)) {
          if (!known.has(m[1]) && !reported.has(`${file.rel}:${m[1]}`)) {
            reported.add(`${file.rel}:${m[1]}`);
            checks.push(
              violation("unknown-design-token", `var(${m[1]}) is used but not defined in the design-token source. An undefined token renders as an empty value.`, file.rel, 5)
            );
          }
        }
      }
      if (reported.size === 0)
        checks.push(check("token-validity", true, `All var(--*) usages resolve against ${known.size} token(s) in the token source.`));
    } catch (err) {
      checks.push(check("token-validity", null, `Design-token source could not be loaded (${err.message}) — validity unverified.`));
    }
  }

  // Screenshot evidence: a pass claim backed by a near-empty PNG is backed
  // by a blank page. Tiny screenshots are not evidence.
  if (ctx.inputs?.uiEvidenceDir) {
    const dir = join(ctx.root, ctx.inputs.uiEvidenceDir);
    const minBytes = ctx.inputs.uiEvidenceMinBytes ?? 8192;
    if (!existsSync(dir)) {
      checks.push(check("ui-evidence", null, `UI evidence directory ${ctx.inputs.uiEvidenceDir} does not exist — screenshot evidence unverified.`));
    } else {
      const pngs = readdirSync(dir).filter((f) => f.endsWith(".png"));
      if (pngs.length === 0) {
        checks.push(check("ui-evidence", null, "No screenshots in the UI evidence directory — nothing was evidenced."));
      }
      for (const png of pngs) {
        const size = statSync(join(dir, png)).size;
        if (size < minBytes) {
          checks.push(
            violation("blank-screenshot-evidence", `Screenshot ${png} is ${size} bytes (< ${minBytes}). A page that renders compresses larger than this — this is a blank page filed as evidence.`, `${ctx.inputs.uiEvidenceDir}/${png}`, 8)
          );
        }
      }
    }
  }

  if (!checks.some((c) => c.passed === false))
    checks.push(check("ui-rules", true, "No accessibility or design-token violations found."));
  return checks;
}

// --- e2e --------------------------------------------------------------------

export function checkE2e(files, rules, isTestFile, ctx = {}) {
  const checks = [];

  // Real run results beat presence: when a results file is provided, the
  // dimension is scored by what the test run actually did.
  if (ctx.inputs?.e2eResults) {
    try {
      const res = JSON.parse(readFileSync(join(ctx.root, ctx.inputs.e2eResults), "utf8"));
      const passed = Number(res.passed) || 0;
      const failed = Number(res.failed) || 0;
      const total = passed + failed;
      if (total === 0) {
        checks.push(check("e2e-results", null, "E2E results file contains no tests — run unverified."));
      } else if (failed > 0) {
        const rate = passed / total;
        checks.push(
          violation("e2e-failures", `E2E run: ${passed}/${total} passed, ${failed} failed. A red run is a red run, however good the code looks.`, ctx.inputs.e2eResults, Math.max(10, Math.round(60 * (1 - rate))))
        );
      } else {
        checks.push(check("e2e-results", true, `E2E run: all ${total} test(s) passed.`));
      }
      return checks;
    } catch (err) {
      checks.push(check("e2e-results", null, `E2E results could not be loaded (${err.message}) — falling back to test-presence scoring.`));
    }
  } else {
    checks.push(check("e2e-results", null, "No e2eResults input — scoring test presence only, not an actual run. Provide a results file ({passed, failed}) for run-based scoring."));
  }
  const sources = files.filter((f) => !isTestFile(f.rel));
  const tests = files.filter((f) => isTestFile(f.rel));
  const testBaseNames = new Set(
    tests.map((f) => f.rel.split("/").pop().replace(/\.(test|spec)\./, "."))
  );
  let covered = 0;
  const uncovered = [];
  for (const src of sources) {
    const base = src.rel.split("/").pop();
    if (testBaseNames.has(base)) covered += 1;
    else uncovered.push(src.rel);
  }
  const ratio = sources.length === 0 ? 1 : covered / sources.length;
  if (ratio < rules.targetTestRatio) {
    checks.push(
      violation("low-test-presence", `Only ${covered}/${sources.length} source files have a sibling test (target ratio ${rules.targetTestRatio}). Uncovered: ${uncovered.slice(0, 5).join(", ")}${uncovered.length > 5 ? ", …" : ""}.`, "(project)", Math.round(60 * (1 - ratio / rules.targetTestRatio)))
    );
  } else {
    checks.push(check("test-presence", true, `${covered}/${sources.length} source files have a sibling test (ratio ${ratio.toFixed(2)} ≥ ${rules.targetTestRatio}).`));
  }
  return checks;
}

// Apply config exemptions: a failed check whose name matches an exemption
// for its evidence path becomes neutral (visible, but not counted).
export function applyExemptions(dimChecks, exemptions) {
  if (!exemptions || exemptions.length === 0) return dimChecks;
  return dimChecks.map((c) => {
    if (c.passed !== false) return c;
    const path = (c.evidence || "").split(":")[0];
    const hit = exemptions.find(
      (e) =>
        globMatch(e.path, path) &&
        (e.rules.includes("*") || e.rules.includes(c.name))
    );
    if (!hit) return c;
    return {
      ...c,
      passed: null,
      points: 0,
      message: `${c.message} [exempted: ${hit.reason || "no reason given"}]`,
    };
  });
}
