# Template: Next.js + harness workflow

This kit models the shape of a production Next.js project that is built
with AI agents under a plan contract: routes under `src/app/`, shared code
in `src/lib` / `src/hooks` / `src/components`, a design-token source, i18n
resources, per-feature plans with functional points, and screenshot
evidence for UI work.

## Install

```bash
npx ai-code-gate init --with-kit   # copies this kit into your project
```

Existing files are never overwritten — delete one first if you want the
template version.

## What to replace

| Template value | Where | Replace with |
|---|---|---|
| `npm run build` | `gate.config.json` → `rules.structure.compileCommand` | Your real build/typecheck command, or remove the field |
| `src/lib/**`, `src/hooks/**`, `src/components/**` | `rules.structure.architectureLayers` | Your layer directories and the import directions between them |
| `src/app` | `rules.structure.routeIsolation.appDir` | Your routes root (delete `routeIsolation` if you have no route tree) |
| `plan.md` | `inputs.plan` | Your plan document; keep the FP list and the "Editable scope" section formats |
| `design-tokens.json` | `inputs.designTokens`, `rules.ui.tokenFiles` | Your token source (`.json` with `--name` keys, or a `.css` file declaring `--vars`) |
| `locales/en.json` | `inputs.i18n.resources` | All your locale resource files |
| `e2e-results.json` | `inputs.e2eResults` | A file your test runner rewrites each run. Three formats are auto-detected: `{"passed": n, "failed": n}`, a Jest/Vitest JSON report, or a Playwright JSON report. The canonical input name is now `inputs.testResults` (`e2eResults` remains as a legacy alias) |
| `coverage/coverage-summary.json` | `inputs.coverage` | An istanbul coverage summary. Set `inputs.coverage` to its path and its mean percentage joins the e2e score (weights: run 0.6 / coverage 0.25 / presence 0.15, renormalized over what is present) |
| `.gate-history/` | `historyDir` (or `--history <dir>`) | Where each run's JSON report is appended (timestamped, never overwritten); the text report then prints a trend vs the previous run |
| `ui-evidence/` | `inputs.uiEvidenceDir` | The folder your screenshot step writes PNGs into |
| thresholds + `why` | `dimensions`, `gates` | Your team's bar. Change the number and the reason together |
| `gate.config.json`, `.github/**` | `protectedPaths` | Files an agent may never edit without a human (`GATE_HUMAN_CONFIRM=yes`) |

Start lenient (the defaults), run the gate for a week, then tighten one
number at a time. A gate everyone bypasses enforces nothing.
