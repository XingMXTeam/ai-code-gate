<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="ai-code-gate logo">
</p>

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
- `e2e-results.json` — the `{passed, failed}` file your test runner rewrites
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
| 4 | `featureWorks` | e2e ≥ 60 | At least half of the source files (configurable ratio) have a sibling test file. The features are accompanied by verification, not just intention. |

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
| **E2E results** (`inputs.e2eResults`) | e2e | A real run's outcome (`{"passed": n, "failed": n}`). Without it, e2e falls back to test-file *presence* and says so |
| **UI evidence screenshots** (`inputs.uiEvidenceDir`) | ui | Pass claims backed by screenshots; a PNG under `uiEvidenceMinBytes` (default 8192) is a blank page, not evidence |
| **Git working tree** | verify-zone, scope | Which files changed — for the protected-zone and plan-scope guards |

The rule of thumb: **a dimension is only as strong as its inputs.** With
just a source tree you get structural and pattern checks; each artifact you
add (plan, tokens, resources, results, screenshots) turns one more
"unverified" neutral into a real verdict.

## What gets checked

| Dimension | Checks |
|---|---|
| **structure** | Compile command (if configured; neutral otherwise), `any` / `@ts-ignore` suppressions, file/function length with file-type-aware split advice, **architecture import rules** (config-driven layer directions), **route isolation** for `src/app/<route>/` layouts |
| **data** | Hardcoded credentials, plain `http://` URLs outside localhost, **i18n key completeness** against locale resources, **storage-key namespace** shape |
| **logic** | Forbidden patterns (default: `debugger`), leftover `console.log`, TODO/FIXME pile-ups, **plan functional-point (FP) coverage** |
| **ui** | `<img>` without `alt`, inline-style sprawl, **raw hex colors outside design-token files**, **design-token validity** (`var(--x)` must exist in the token source), **screenshot evidence sanity** (blank-page detection) |
| **e2e** | **Real run results** (`{passed, failed}`) when provided; otherwise the share of source files with a sibling test, labeled as presence-only |

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

## 中文说明

`ai-code-gate` 是给 AI 生成代码用的确定性验收门禁：五个维度打分
（structure / data / logic / ui / e2e），四个命名关卡按序短路。
**门禁定义（默认阈值）**：`canRun` = structure ≥ 85（能编译、架构分层
不破、文件函数不超限）；`dataReady` = data ≥ 85（无硬编码凭证、无明文
http）；`usageRight` = logic ≥ 80 **且** ui ≥ 75（无调试残留、守 token
纪律、img 有 alt）；`featureWorks` = e2e ≥ 60（过半源码文件有测试陪伴）。
维度永远全量打分，关卡按序评、首挂即停，后面的关卡报 skipped；四个
关卡全过才算 PASS。阈值与关卡定义都在配置文件里、每条带 why。每个分数都能拆到带证据的命名检查项；跑不了的
检查报 neutral，绝不冒充通过。附带两项治理机制：**保护区**（改门禁配置
需要人确认，`verify-zone`）与**计划范围守卫**（改动不得超出计划声明的
可改范围，`scope`）。规则与阈值全部可配，判定过程无 AI 参与。

## Development

```bash
npm test          # run the test suite
npm run demo:bad
npm run demo:good
```

## License

MIT

> Note: the examples' `ui-evidence/*.png` screenshots are generated fixtures
> (the good one is a 10 KB file, the bad one a 128-byte blank) and are not
> tracked in git — recreate them with any PNG of the right size to reproduce
> the evidence checks locally.
