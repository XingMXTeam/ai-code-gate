// ai-code-gate configuration.
//
// The model: five scored dimensions, and named gates on top of them.
// A gate is a compound condition over dimension scores ("usageRight" needs
// logic AND ui). Gates run in order and the run short-circuits at the first
// failed gate — dimensions are always all scored, but later gates are
// reported as skipped, mirroring how a delivery pipeline behaves.

export const DEFAULT_CONFIG = {
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  ignore: ["node_modules", ".git", "dist", "build", "coverage", ".next"],

  // Optional pre-check: a shell command that must exit 0. When it is not
  // configured, the compile check reports as "neutral" instead of passing
  // silently — an unverified check must never look verified.
  compileCommand: null,

  dimensions: {
    structure: {
      threshold: 85,
      why: "If the code does not compile and does not respect the architecture, every later score is meaningless.",
    },
    data: {
      threshold: 85,
      why: "Credentials and endpoints are where generated code is most confidently wrong.",
    },
    logic: {
      threshold: 80,
      why: "Leftover debug output and deferred TODOs are unfinished work pretending to be done.",
    },
    ui: {
      threshold: 75,
      why: "Cosmetic drift is tolerable; a broken design-token discipline is not.",
    },
    e2e: {
      threshold: 60,
      why: "Untested generated code is a promise, not a result. The bar starts modest and should rise over time.",
    },
  },

  // Named gates, evaluated in order. `requires` maps a dimension to the
  // minimum score it must reach (default: that dimension's threshold).
  gates: [
    { id: "canRun", requires: { structure: null } },
    { id: "dataReady", requires: { data: null } },
    { id: "usageRight", requires: { logic: null, ui: null } },
    { id: "featureWorks", requires: { e2e: null } },
  ],

  rules: {
    structure: {
      maxFileLines: 300,
      maxFunctionLines: 50,
      // Architecture layer rules. `from`/`to` are path globs over
      // project-relative paths; an import whose resolved path matches `to`
      // from a file matching `from` is a violation. Empty = disabled.
      importRules: [
        {
          from: "src/lib/**",
          to: "src/app/**",
          message: "Low-level lib code must not depend on app-layer modules. Move the shared piece down, not the dependency up.",
        },
        {
          from: "src/hooks/**",
          to: "src/app/**",
          message: "Global hooks must not depend on app-layer modules.",
        },
      ],
      // Next.js-style route isolation: files under src/app/<route>/ may not
      // import from a sibling route; shared dirs are exempt.
      crossRoute: {
        root: "src/app",
        sharedDirs: ["api", "_components"],
      },
    },
    logic: {
      maxTodosPerFile: 3,
      forbiddenPatterns: ["\\bdebugger\\b"],
    },
    data: {
      secretPattern:
        "(api[_-]?key|secret|password|token)\\s*[:=]\\s*['\"][^'\"]{8,}['\"]",
      allowHttpLocalhost: true,
    },
    ui: {
      maxInlineStylesPerFile: 5,
      // Raw hex colors outside design-token files break the token system:
      // the value looks right and silently forks the palette.
      maxRawHexPerFile: 3,
      tokenFilePatterns: ["**/tokens/**", "**/theme/**", "**/*.tokens.*"],
    },
    e2e: {
      targetTestRatio: 0.5,
    },
  },

  // Explicit, reviewable exceptions: { path (glob), rules: [names] or ["*"],
  // reason }. An exemption without a reason is just a hole.
  exemptions: [],

  // Files an automated agent must not change without a human confirmation
  // (see `ai-gate verify-zone`). Typically: this config, the gate itself,
  // CI definitions.
  protectedPaths: ["gate.config.json"],
};

export function mergeConfig(userConfig = {}) {
  const merged = structuredClone(DEFAULT_CONFIG);
  if (userConfig.extensions) merged.extensions = userConfig.extensions;
  if (userConfig.ignore) merged.ignore = userConfig.ignore;
  if (userConfig.compileCommand !== undefined)
    merged.compileCommand = userConfig.compileCommand;
  if (userConfig.gates) merged.gates = userConfig.gates;
  if (userConfig.exemptions) merged.exemptions = userConfig.exemptions;
  if (userConfig.protectedPaths) merged.protectedPaths = userConfig.protectedPaths;
  if (userConfig.dimensions) {
    for (const [dim, entry] of Object.entries(userConfig.dimensions)) {
      if (typeof entry === "number") merged.dimensions[dim].threshold = entry;
      else Object.assign(merged.dimensions[dim], entry);
    }
  }
  if (userConfig.rules) {
    for (const dim of Object.keys(userConfig.rules)) {
      merged.rules[dim] = { ...merged.rules[dim], ...userConfig.rules[dim] };
    }
  }
  return merged;
}

// Minimal glob: `**` spans directories, `*` spans one segment.
export function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "[^/]*")
    .replace(//g, "(.*/)?")
    .replace(//g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function globMatch(glob, path) {
  return globToRegExp(glob).test(path);
}
