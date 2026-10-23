# Changelog

## 0.5.0 — 2026-10-23

**Analysis accuracy.** Checks no longer read raw text. Every file is
first reduced to position-preserving masked views (code / comments /
string contents) plus a literal table, so patterns cannot fire on
words inside strings or comments anymore — and checks whose subject
lives in literals (URLs, storage keys, i18n keys) read the literals
directly.

- **Masked code views** (`src/mask.js`): string/template contents,
  comments and regex literals blanked to spaces with identical line
  layout; template `${...}` expressions remain code. TODO markers are
  counted on the comment view; `@ts-ignore` counts only when it leads
  its comment (a prose mention is not a suppression).
- **Precise function spans**: delimiter-matched bodies for function
  declarations, arrow functions and method shorthand, replacing the
  brace-counting estimate.
- **A real import graph**: static, side-effect, re-export, `require()`
  and dynamic `import()` edges; extension and directory-index
  resolution; `tsconfig.json` / `jsconfig.json` `paths` aliases
  (JSONC-tolerant parsing); **import cycle detection** is a new
  structure check. Layer rules and route isolation run on resolved
  candidates.
- **`.vue` / `.svelte`**: `<script>` blocks are extracted (positions
  preserved) and analyzed; the extensions join the defaults.

**Real artifacts.** The e2e dimension is now a transparent composite
of up to three signals — run (0.6), coverage (0.25), presence (0.15),
weights configurable and renormalized over the signals present:

- `inputs.testResults` (the legacy `inputs.e2eResults` name still
  works) auto-detects three formats: `{passed, failed}`, Jest/Vitest
  JSON, and Playwright JSON reports.
- `inputs.coverage` reads an istanbul `coverage-summary.json`.
- Each signal is a named check carrying its weighted share of the
  deduction, so the score still decomposes. Missing inputs stay
  neutral, as always.

**Self-bootstrap & calibration.** The repository now grades itself:
a root `gate.config.json` (public defaults; `examples/`, `assets/`,
`templates/` excluded; the CLI's own stdout registered as an
exemption), an enforced self-gate test in the suite, and an
`npm run gate:self` script. `src/rules.js` was split into per-dimension
modules under `src/rules/`. A full calibration run against a real
Next.js project is written up in `docs/calibration.md` — two findings
were provably the gate's fault and were fixed (token-source format,
cross-route root files); the rest were real.

**History.** `inputs`-independent run history: config `historyDir` or
`--history <dir>` appends every run's JSON report (timestamped, never
overwritten) and prints a **trend** section against the previous run —
per-dimension deltas, total delta, and verdict changes called out.
`--report <path>` writes the JSON report to a specific path.

**Config.** New: `exclude` (globs removed from scoring),
`inputs.testResults`, `inputs.coverage`, `historyDir`,
`rules.e2e.weights`.

Test suite: 13 → 44 tests, all passing.

## 0.4.0

Starter kit: `init --with-kit` installs the `templates/nextjs-harness`
template (config, plan skeleton, token source, locales, results file,
replace checklist). README badges and CI workflow.

## 0.3.0

Input-driven checks: plan functional-point coverage, design-token
validity, i18n key completeness, storage-key namespaces, e2e run
results, screenshot evidence sanity, language-layer rules (`any`,
`@ts-ignore`).

## 0.2.0

Named compound gates with short-circuit evaluation, check-level
evidence with a neutral state, architecture import rules and route
isolation, design-token discipline, protected zone (`verify-zone`) and
plan-scope guard (`scope`).

## 0.1.0

Initial release: deterministic quality gates for AI-generated code —
five scored dimensions, per-check deductions, text and JSON reports.
