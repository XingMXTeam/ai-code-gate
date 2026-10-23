// Deterministic rules. No AI, no network, no heuristics that cannot be
// explained in one sentence. Every rule returns a list of violations:
// { file, line, rule, message, points } — points are deducted from 100.

function linesOf(content) {
  return content.split("\n");
}

function countOccurrences(content, regex) {
  return (content.match(regex) || []).length;
}

// --- structure ------------------------------------------------------------

// Estimate function lengths by brace counting from each function start.
// Deliberately simple: it exists to catch runaway generated functions,
// not to be a parser.
function longFunctions(file, maxLines) {
  const lines = linesOf(file.content);
  const startRe =
    /(function\s+\w+\s*\(|=>\s*\{|^\s+\w+\s*\([^)]*\)\s*\{|class\s+\w+)/;
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
        if (len > maxLines)
          found.push({ line: start + 1, length: len });
        start = -1;
      }
    }
  });
  return found;
}

export function checkStructure(files, rules) {
  const violations = [];
  for (const file of files) {
    const count = linesOf(file.content).length;
    if (count > rules.maxFileLines) {
      violations.push({
        file: file.rel,
        line: rules.maxFileLines + 1,
        rule: "file-too-long",
        message: `File has ${count} lines (limit ${rules.maxFileLines}). Split it before it grows further.`,
        points: 8,
      });
    }
    for (const fn of longFunctions(file, rules.maxFunctionLines)) {
      violations.push({
        file: file.rel,
        line: fn.line,
        rule: "function-too-long",
        message: `Function spans ${fn.length} lines (limit ${rules.maxFunctionLines}). Long generated functions are where bugs hide.`,
        points: 6,
      });
    }
  }
  return violations;
}

// --- logic ----------------------------------------------------------------

export function checkLogic(files, rules) {
  const violations = [];
  const forbidden = (rules.forbiddenPatterns || []).map(
    (p) => new RegExp(p, "g")
  );
  for (const file of files) {
    const todos = countOccurrences(file.content, /\b(TODO|FIXME|HACK)\b/g);
    if (todos > rules.maxTodosPerFile) {
      violations.push({
        file: file.rel,
        line: 1,
        rule: "too-many-todos",
        message: `${todos} TODO/FIXME markers in one file (limit ${rules.maxTodosPerFile}). AI code defers decisions with TODOs — resolve them instead.`,
        points: 4,
      });
    }
    const consoles = countOccurrences(file.content, /console\.log\s*\(/g);
    if (consoles > 0) {
      violations.push({
        file: file.rel,
        line: 1,
        rule: "console-log",
        message: `${consoles} console.log statement(s) left in code. Debug output is not a logging strategy.`,
        points: Math.min(3 * consoles, 12),
      });
    }
    linesOf(file.content).forEach((line, i) => {
      for (const re of forbidden) {
        if (re.test(line)) {
          violations.push({
            file: file.rel,
            line: i + 1,
            rule: "forbidden-pattern",
            message: `Forbidden pattern ${re.source} must not ship.`,
            points: 10,
          });
        }
      }
    });
  }
  return violations;
}

// --- data -----------------------------------------------------------------

export function checkData(files, rules) {
  const violations = [];
  const secretRe = new RegExp(rules.secretPattern, "i");
  for (const file of files) {
    linesOf(file.content).forEach((line, i) => {
      if (secretRe.test(line)) {
        violations.push({
          file: file.rel,
          line: i + 1,
          rule: "hardcoded-secret",
          message:
            "Possible hardcoded credential. Move it to an environment variable — generated code loves inventing plausible-looking keys.",
          points: 15,
        });
      }
      const urls = line.match(/http:\/\/[^\s'")]+/g) || [];
      for (const url of urls) {
        if (
          rules.allowHttpLocalhost &&
          /^http:\/\/(localhost|127\.0\.0\.1)/.test(url)
        )
          continue;
        violations.push({
          file: file.rel,
          line: i + 1,
          rule: "insecure-url",
          message: `Plain http:// URL (${url}). Use https:// outside local development.`,
          points: 5,
        });
      }
    });
  }
  return violations;
}

// --- ui -------------------------------------------------------------------

export function checkUi(files, rules) {
  const violations = [];
  const uiFiles = files.filter((f) => /\.(jsx|tsx)$/.test(f.rel));
  for (const file of uiFiles) {
    const imgs = file.content.match(/<img\b[^>]*>/g) || [];
    for (const tag of imgs) {
      if (!/\balt\s*=/.test(tag)) {
        violations.push({
          file: file.rel,
          line: file.content.slice(0, file.content.indexOf(tag)).split("\n").length,
          rule: "img-missing-alt",
          message: "<img> without an alt attribute. Accessibility is part of the UI contract, not an afterthought.",
          points: 5,
        });
      }
    }
    const styles = countOccurrences(file.content, /style=\{\{/g);
    if (styles > rules.maxInlineStylesPerFile) {
      violations.push({
        file: file.rel,
        line: 1,
        rule: "too-many-inline-styles",
        message: `${styles} inline style objects in one file (limit ${rules.maxInlineStylesPerFile}). Let the design system carry styling; inline styles are how generated UI drifts apart.`,
        points: 4,
      });
    }
  }
  return violations;
}

// --- e2e ------------------------------------------------------------------

export function checkE2e(files, rules, isTestFile) {
  const sources = files.filter((f) => !isTestFile(f.rel));
  const tests = files.filter((f) => isTestFile(f.rel));
  const testBaseNames = new Set(
    tests.map((f) => f.rel.split("/").pop().replace(/\.(test|spec)\./, "."))
  );
  const testDirs = new Set(
    tests.map((f) => f.rel.split("/").pop())
  );
  let covered = 0;
  const uncovered = [];
  for (const src of sources) {
    const base = src.rel.split("/").pop();
    if (testBaseNames.has(base) || testDirs.has(base.replace(/^/, ""))) {
      covered += 1;
    } else uncovered.push(src.rel);
  }
  const ratio = sources.length === 0 ? 1 : covered / sources.length;
  const violations = [];
  if (ratio < rules.targetTestRatio) {
    violations.push({
      file: "(project)",
      line: 1,
      rule: "low-test-coverage-presence",
      message: `Only ${covered}/${sources.length} source files have a sibling test (target ratio ${rules.targetTestRatio}). Uncovered: ${uncovered.slice(0, 5).join(", ")}${uncovered.length > 5 ? ", …" : ""}. Code an AI wrote and nobody tests is a promise, not a result.`,
      points: Math.round(60 * (1 - ratio / rules.targetTestRatio)),
    });
  }
  return violations;
}
