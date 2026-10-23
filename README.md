<p align="right"><strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a></p>

# ai-code-gate

<p align="center">
  <a href="https://github.com/XingMXTeam/ai-code-gate/actions/workflows/ci.yml"><img src="https://github.com/XingMXTeam/ai-code-gate/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node >= 18">
  <img src="https://img.shields.io/badge/dependencies-zero-blue" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license">
</p>

**Deterministic quality gates for AI-generated code.**

AI writes code fast. The hard part is knowing whether what it wrote is safe to
ship. Lint tells you about style; tests tell you about the cases you already
thought of. `ai-code-gate` sits in between, and it is built around four ideas:

1. **Scores, not vibes.** Every project is scored across five dimensions —
   **structure, data, logic, ui, e2e** — by plain, deterministic rules.
   No AI judges the AI.
2. **Named gates, evaluated in order.** Gates are compound conditions over
   dimension scores (`usageRight` needs logic *and* ui). The run
   short-circuits at the first failed gate; later gates report as skipped.
   You always know the single most important thing to fix next.
3. **Honest evidence.** Every score decomposes into named checks with
   messages and file:line evidence. A check that could not run in this
   environment reports as **neutral** — never as a silent pass.
4. **Governance built in.** Thresholds live in a config file that is itself
   protected: an agent cannot quietly rewrite its own acceptance criteria
   (see *Protected zone* below), and a plan can declare an *editable scope*
   that changes are checked against.

## Quick start

```bash
npx ai-code-gate            # score the current project
npx ai-code-gate --json     # machine-readable report for CI
npx ai-code-gate --history .gate-history
                            # append this run to a history directory
                            # and print a trend vs the previous run
npx ai-code-gate --report report.json
                            # also write the JSON report to a path
npx ai-code-gate init       # write a default gate.config.json
npx ai-code-gate init --with-kit
                            # install the full starter kit (see Templates)
```

## Templates

`templates/nextjs-harness/` is a complete starter kit modeled on a real
Next.js project run under an AI harness workflow. `init --with-kit` copies
it into your project (never overwriting existing files):

- `gate.config.json` — thresholds with reasons, the four gates, architecture
  layer rules (`src/lib`, `src/hooks`, `src/components` must not import
  `src/app/**`), route isolation, protected paths, and all inputs wired
- `plan.md` — plan skeleton with an *Editable scope* section and a
  functional-point (FP) list in the format the checks consume
- `design-tokens.json` — token source skeleton (`--color-*`, `--spacing-*`, …)
- `locales/en.json` — i18n resource skeleton
- `e2e-results.json` — the results file your test runner rewrites (the
  simple `{passed, failed}` shape, or a native Jest/Vitest/Playwright
  JSON report — all three are auto-detected)
- `TEMPLATE.md` — a replace-checklist: every template value, where it lives,
  and what to substitute with your own

The kit is a starting shape, not a standard: swap in your directories, your
token source, your plan format locations, then tighten thresholds one at a
time.

Exit codes: `0` pass · `1` a gate failed or a guard blocked · `2` usage error.

Try the bundled examples (same feature, two levels of care):

```bash
npm run demo:bad    # fails at the canRun gate (architecture violations)
npm run demo:good   # passes all four gates
```

Example output (abridged):

```
  structure   74/100  (threshold 85)  FAIL
    [FAIL] import-layer: Low-level lib code must not depend on app-layer modules. (src/lib/format.ts:1)
    [FAIL] cross-route-import: Route "checkout" imports from route "account". (src/app/checkout/page.tsx:1)
  gate canRun       FAIL — structure score 74 < 85
  gate dataReady    SKIPPED — run stopped at "canRun"
  ...
  remediation (by points at stake):
    - low-test-presence: 1 occurrence(s), 60 points
    - import-layer: 1 occurrence(s), 10 points
  VERDICT: FAIL — stopped at gate "canRun".
```

## The gates

Scoring and gating are two separate steps. First, **all five dimensions are
always scored** (structure / data / logic / ui / e2e, each 0–100, starting at
100 with points deducted per failed check). Then the four named gates are
evaluated **in order** against those scores. The first failed gate stops the
run — the remaining gates are reported as `skipped`, and the verdict fails.

| # | Gate | Requires | What it actually means |
|---|---|---|---|
| 1 | `canRun` | structure ≥ 85 | The code compiles (when a compile command is configured), respects the architecture's import layers and route isolation, and stays within file/function size limits. If it cannot run, nothing else matters. |
| 2 | `dataReady` | data ≥ 85 | No hardcoded credentials, no plain `http://` endpoints outside localhost. The data layer is safe to connect. |
| 3 | `usageRight` | logic ≥ 80 **and** ui ≥ 75 | A compound gate: no `debugger`, no `console.log` residue, no TODO pile-ups — **and** the UI keeps design-token discipline (no raw hex sprawl) and accessibility basics (`alt` on images). Usable by a human, not merely runnable. |
| 4 | `featureWorks` | e2e ≥ 60 | A composite of real evidence: an actual test run's pass rate (weight 0.6), istanbul coverage (0.25), and test-file presence (0.15) — renormalized over whichever artifacts you provide. Features are accompanied by verification, not just intention. |

Thresholds above are the defaults; every one of them lives in
`gate.config.json` together with a written `why`, and the gate list itself —
ids, order, and which dimensions each gate requires — is configuration, not
hardcoded. A stricter team raises the numbers; a gate can also pin a
dimension above its default threshold (e.g. `{"id": "releaseReady",
"requires": {"e2e": 90}}`).

Verdict: **PASS only if all four gates pass.** The report still shows every
dimension's score and every failed check after a short-circuit — the gates
decide, the dimensions explain.

## Inputs

Source code alone cannot prove most of what the gates claim. The full input
set is:

| Input | Feeds | Proves |
|---|---|---|
| **Source tree** (the scanned directory) | all dimensions | The code itself: sizes, imports, patterns, usages |
| **`gate.config.json`** | all dimensions | Thresholds (each with a `why`), gate definitions, rules, exemptions, protected paths |
| **Compile command** (optional, configured) | structure | The code actually compiles; unconfigured → the check reports *neutral*, never a silent pass |
| **Plan document** (`inputs.plan`) | logic, scope guard | Functional-point (FP) coverage: every FP id in the plan must be referenced in code/tests; also the plan's declared editable scope |
| **Design-token source** (`inputs.designTokens`) | ui | Every `var(--x)` used in code must exist in the token source (`.json` with `--name` keys, or `.css` with `--var` declarations) |
| **i18n resources** (`inputs.i18n.resources`) | data | Every i18n key called in code exists in the locale resources; storage keys follow a `{page}.{entity}.{field}` namespace shape |
| **Test results** (`inputs.testResults`; legacy name `inputs.e2eResults`) | e2e | A real run's outcome, auto-detected in three formats: `{"passed": n, "failed": n}`, a Jest/Vitest JSON report, or a Playwright JSON report. Without it, the run signal is absent and the report says so |
| **Coverage summary** (`inputs.coverage`) | e2e | An istanbul `coverage-summary.json`; its mean percentage feeds the e2e composite as a supporting signal |
| **UI evidence screenshots** (`inputs.uiEvidenceDir`) | ui | Pass claims backed by screenshots; a PNG under `uiEvidenceMinBytes` (default 8192) is a blank page, not evidence |
| **Git working tree** | verify-zone, scope | Which files changed — for the protected-zone and plan-scope guards |

The rule of thumb: **a dimension is only as strong as its inputs.** With
just a source tree you get structural and pattern checks; each artifact you
add (plan, tokens, resources, results, screenshots) turns one more
"unverified" neutral into a real verdict.

## How the checks read code

Checks never pattern-match raw text. Every file is first reduced to
three position-preserving views — a **code view** (string/template
contents, comments and regex literals blanked to spaces; template
`${...}` expressions kept, because they are code), a **comment view**,
and a **string view** — plus a table of every string literal. Pattern
checks run on the code view, so a sentence inside a string or comment
can no longer fabricate a violation; checks whose subject lives in
literals (URLs, storage keys, i18n keys, hex colors) read the literal
table instead. Function sizes come from delimiter-matched spans, and
imports form a resolved graph (aliases from `tsconfig`/`jsconfig`
`paths`, extension and index probing, `require()` and dynamic
`import()` included) — which is also how import cycles are detected.
For `.vue`/`.svelte` files, the `<script>` blocks are extracted first
with line numbers intact.

## What gets checked

| Dimension | Checks |
|---|---|
| **structure** | Compile command (if configured; neutral otherwise), `any` / `@ts-ignore` suppressions (a suppression counts only when it leads its comment — a prose mention does not), file/function length with file-type-aware split advice, **architecture import rules** over the resolved import graph, **route isolation** for `src/app/<route>/` layouts, **import cycle detection** |
| **data** | Hardcoded credentials, plain `http://` URLs outside localhost (matched in literal contents, so a URL in a comment is not an endpoint), **i18n key completeness** against locale resources, **storage-key namespace** shape |
| **logic** | Forbidden patterns (default: `debugger`), leftover `console.log`, TODO/FIXME pile-ups (counted in comments, where they live), **plan functional-point (FP) coverage** |
| **ui** | `<img>` without `alt`, inline-style sprawl, **raw hex colors outside design-token files**, **design-token validity** (`var(--x)` must exist in the token source — feed it the artifact your build consumes, e.g. the compiled CSS, not a source format it cannot read), **screenshot evidence sanity** (blank-page detection) |
| **e2e** | A composite of up to three signals — **run** pass rate from a real test-results artifact (0.6), **coverage** mean from istanbul (0.25), test-file **presence** (0.15) — weights configurable in `rules.e2e.weights` and renormalized over the signals present; each signal is a named check carrying exactly its share of the deduction |

## Configuration

```json
{
  "compileCommand": "npx tsc --noEmit",
  "dimensions": {
    "structure": { "threshold": 85, "why": "If it does not compile and respect the architecture, later scores are meaningless." }
  },
  "gates": [
    { "id": "canRun",     "requires": { "structure": null } },
    { "id": "dataReady",  "requires": { "data": null } },
    { "id": "usageRight", "requires": { "logic": null, "ui": null } },
    { "id": "featureWorks","requires": { "e2e": null } }
  ],
  "rules": {
    "structure": {
      "maxFileLines": 300,
      "maxFunctionLines": 50,
      "importRules": [
        { "from": "src/lib/**", "to": "src/app/**", "message": "lib must not depend on the app layer." }
      ]
    }
  },
  "exemptions": [
    { "path": "src/legacy/**", "rules": ["file-too-long"], "reason": "frozen legacy module, scheduled for rewrite" }
  ],
  "protectedPaths": ["gate.config.json"]
}
```

Every dimension threshold carries a `why` — a quality bar nobody can explain
is a quality bar nobody will defend. Exemptions require a path, the rule
names, and a reason; an exempted check shows up as *neutral* in the report,
visible but not counted.

Two more top-level settings: `exclude` — globs removed from scoring
entirely (fixtures, generated output living inside scanned directories)
— and `historyDir` — where run history accumulates (next section).

## History and trend

```bash
ai-gate --history .gate-history     # or set "historyDir" in the config
```

Each run appends its full JSON report to the history directory under a
timestamped name — history files are never overwritten — and the text
report gains a **trend** section comparing against the previous run:
per-dimension score deltas, the total delta, and verdict movement
(`FAIL@canRun -> PASS` is called out explicitly). `--report <path>`
additionally writes the current report to a specific path. Quality you
cannot watch move is quality you are guessing about.

## Protected zone

```bash
ai-gate verify-zone
```

If any file listed in `protectedPaths` has uncommitted changes and
`GATE_HUMAN_CONFIRM=yes` is not set, the command blocks. The point: the thing
being judged must not be able to lower its own bar. A human reviews the diff,
then confirms explicitly.

## Plan scope guard

A plan document can declare what a change is allowed to touch:

```markdown
## Editable scope

- `src/app/**`
- `docs/*`
```

```bash
ai-gate scope plan.md
```

Any changed file outside the declared scope blocks the run. Plans without a
scope section are left alone (nothing enforced).

## Using it with AI coding agents

The intended workflow is a loop: the agent writes code, the gate scores it,
the agent works the **remediation** list top-down (it is sorted by points at
stake), re-runs, and stops when the gates clear. Because the report is
deterministic and decomposed into checks, "fix the gate" is a well-posed task
in a way "make the code better" never is.

## Background

This tool grew out of a harness-engineering workflow for AI-assisted
frontend development: prompts and context alone do not make AI-written
code safe to merge - you need a feedback site that exposes errors
deterministically. The longer write-up (in Chinese) is here:
[AI 写代码，最缺的不是 Prompt，而是一个能暴露错误的现场](https://maoxunxing.com/zh-cn/harness-engineering-ai-frontend/)

More tools and writing from the same author: [maoxunxing.com](https://maoxunxing.com/)

## Other languages

- [简体中文](README.zh-CN.md)

## Development

```bash
npm test          # run the test suite
npm run demo:bad
npm run demo:good
npm run gate:self # the gate grades this repository itself
```

This repository gates itself: the root `gate.config.json` runs under
the public defaults (fixtures and templates excluded; the CLI's own
stdout is a registered exemption, because for a CLI, printing *is* the
product), and a test in the suite asserts the self-gate passes — so CI
enforces it. The gate was also calibrated against a real production
project; the write-up — including the two findings that were the
gate's own fault and were fixed — is in
[docs/calibration.md](docs/calibration.md).

## License

MIT

> Note: the examples' `ui-evidence/*.png` screenshots are generated fixtures
> (the good one is a 10 KB file, the bad one a 128-byte blank) and are not
> tracked in git — recreate them with any PNG of the right size to reproduce
> the evidence checks locally.
