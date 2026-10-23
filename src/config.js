// Default configuration for ai-code-gate.
// Every value here can be overridden in a project's gate.config.json.

export const DEFAULT_CONFIG = {
  // File extensions treated as source code.
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],

  // Directories never scanned.
  ignore: ["node_modules", ".git", "dist", "build", "coverage", ".next"],

  // Optional pre-gate: a shell command that must exit 0 before scoring starts
  // (e.g. "npm run build" or "npx tsc --noEmit"). Null disables it.
  compileCommand: null,

  // Gates run in this order. The first gate below its threshold stops the run
  // and all later gates are reported as "skipped" — fail fast, fix the
  // cheapest problem first.
  gateOrder: ["structure", "data", "logic", "ui", "e2e"],

  thresholds: {
    structure: 85,
    data: 85,
    logic: 80,
    ui: 75,
    e2e: 60,
  },

  rules: {
    structure: {
      maxFileLines: 300, // a single file longer than this is a violation
      maxFunctionLines: 50, // a single function longer than this is a violation
    },
    logic: {
      maxTodosPerFile: 3, // TODO / FIXME / HACK markers tolerated per file
      forbiddenPatterns: ["\\bdebugger\\b"], // regexes that must never appear
    },
    data: {
      // string literals that look like credentials assigned in code
      secretPattern:
        "(api[_-]?key|secret|password|token)\\s*[:=]\\s*['\"][^'\"]{8,}['\"]",
      allowHttpLocalhost: true, // http://localhost and http://127.0.0.1 are fine
    },
    ui: {
      maxInlineStylesPerFile: 5, // style={{ ... }} occurrences tolerated per JSX file
    },
    e2e: {
      // Share of source files that must have a sibling test file
      // (foo.ts -> foo.test.ts / foo.spec.ts in the same folder, or a test
      // with the same base name anywhere under a tests/ or __tests__/ folder).
      targetTestRatio: 0.5,
    },
  },
};

export function mergeConfig(userConfig = {}) {
  const merged = structuredClone(DEFAULT_CONFIG);
  if (userConfig.extensions) merged.extensions = userConfig.extensions;
  if (userConfig.ignore) merged.ignore = userConfig.ignore;
  if (userConfig.compileCommand !== undefined)
    merged.compileCommand = userConfig.compileCommand;
  if (userConfig.gateOrder) merged.gateOrder = userConfig.gateOrder;
  if (userConfig.thresholds)
    Object.assign(merged.thresholds, userConfig.thresholds);
  if (userConfig.rules) {
    for (const dim of Object.keys(userConfig.rules)) {
      merged.rules[dim] = { ...merged.rules[dim], ...userConfig.rules[dim] };
    }
  }
  return merged;
}
