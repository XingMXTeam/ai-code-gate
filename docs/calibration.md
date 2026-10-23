# Calibration notes: the gate against a real project

Toy examples prove a gate *can* fire. They say nothing about whether
its verdicts mean anything on a real codebase. This document records a
calibration run against a real production-shaped project, what the
gate got wrong, what it got right, and which differences turned out to
be conventions rather than errors.

**The project** (anonymized): a Next.js 14 + TypeScript admin
application, ~120 scanned source files, App Router routes under
`src/app`, shared code in `src/lib` / `src/hooks`, design tokens
managed with Style Dictionary (source JSON compiled to a CSS artifact),
a standalone Playwright e2e suite, and its own house standards
(functions ≤ 100 lines, files ≤ 300 lines, enforced by its own lint).

**The method**: one fixed configuration, three runs — the previous
release (v0.4.0), this release (v0.5.0) with the identical
configuration, and v0.5.0 with a *calibrated* configuration (the
project's own documented conventions expressed as gate config). No
default threshold was changed at any point; where the gate itself was
wrong, the gate was fixed.

## Scores

| Run | Files | Total | structure | data | logic | ui | e2e |
|---|---|---|---|---|---|---|---|
| v0.4.0, initial config | 123 | 22 | 0 | 55 | 16 | 0 | 41 |
| v0.5.0, same config | 123 | 20 | 0 | 45 | 16 | 0 | 41 |
| v0.5.0, calibrated config | 121 | 53 | 0 | 45 | 100 | 80 | 41 |

The middle run barely moves — deliberately. v0.5.0 changed *how*
verdicts are derived (masked code views, resolved import graph), not
what the bars are. The movement that does exist is diagnostic:

- `unknown-design-token`: 212 → 210 (two "usages" were inside string
  literals that are not token references at all).
- `storage-key-namespace`: 9 → 11 (literal-table extraction finds
  keys the old line regex missed).
- `no-any` points drop: occurrences inside strings no longer count.
- Two `cross-route-import` findings and one `import-cycle` finding
  appear that the old import extraction could not see at all.

## Provably wrong — and fixed

**1. The token input pointed at the wrong artifact.**
The initial config fed `inputs.designTokens` the Style Dictionary
*source* JSON, whose keys are nested group names (`color.brand1-1`),
not `--vars` — so all 210 real `var(--x)` usages reported as unknown.
The compiled CSS artifact defines 163 variables and covers **every**
used one (40 distinct). Pointing the input at the generated CSS takes
the count to exactly 0. Lesson, now reflected in the README: feed the
gate the artifact your build actually consumes.

**2. Cross-route false positives on root-level files.**
The new route matcher treated files sitting directly in the routes
root as routes themselves, flagging a root layout for importing its
own global stylesheet. Root-level files belong to no route; the
matcher now requires a directory segment (or an extension-less
candidate). The bundled bad example's genuine cross-route violation
is still caught (covered by tests).

## True positives — the gate was right

- **An import cycle**: a hooks module → lib service → lib *types*
  module → back to the hooks module. A types file closing a loop into
  a hook is a real architecture smell, invisible to the v0.4.0 import
  extraction and printed with its full path by the new graph.
- **Size, by the project's own bar**: even at the project's own
  100-line function limit (the calibrated config), 9 functions exceed
  it — page components of 161–174 lines among them — plus one
  783-line script file against a 300-line file limit the project sets
  for itself.
- **`any`**: 7 occurrences across 2 files.
- **Inline styles**: 5 view files with 6–17 inline style objects,
  against the project's CSS-Modules convention.
- **Storage keys**: consistently namespaced — but in the project's
  own shapes (two-segment dot keys, slash keys, concatenated suffix
  fragments), not the gate's default `{page}.{entity}.{field}`
  convention. Recorded as a convention difference, below.

## Convention differences — defaults deliberately unchanged

- **Function limit**: gate default 50 vs the project's 100 → 33
  findings vs 9. A stricter default is the right starting point for
  generated code; a team with a documented house standard sets
  `rules.structure.maxFunctionLines` (as the calibrated config does).
- **`console.log` in tooling**: all 10 occurrences sit in CLI/lint
  scripts, where stdout *is* the interface. The exemptions mechanism
  exists for exactly this; the calibrated config uses it, and logic
  goes 16 → 100 without touching a rule.
- **Static prototype pages**: the project excludes them from its own
  size lint; the calibrated config excludes them via the new
  `exclude` globs (121 files instead of 123).
- **Test presence**: 1/105 files have a sibling test, because this
  project verifies with a standalone Playwright suite and a
  typecheck/build pipeline rather than co-located unit tests. The
  presence signal measures what it measures; the intended wiring for
  such projects is `inputs.testResults` pointed at a real Playwright
  JSON report, where the run signal (weight 0.6) dominates the
  composite. Presence alone scoring 41 here is honest, not broken.

## Bottom line

After calibration the project still fails `canRun` — on findings that
are real by its own standards. That is the outcome a calibration
should produce: the false alarms are gone, the remaining red is a
work list. A gate that passes everything it is shown is not
calibrated; it is decorative.

Regression safety after the calibration fixes: the bundled good
example still passes all gates, the bad example still fails at
`canRun`, the self-gate on this repository passes, and the full test
suite (44 tests) is green.
