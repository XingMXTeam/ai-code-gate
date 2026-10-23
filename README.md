# ai-code-gate

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
```

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

## What gets checked

| Dimension | Checks |
|---|---|
| **structure** | Compile command (if configured; neutral otherwise), file/function length with file-type-aware split advice, **architecture import rules** (config-driven layer directions), **route isolation** for `src/app/<route>/` layouts |
| **data** | Hardcoded credentials, plain `http://` URLs outside localhost |
| **logic** | Forbidden patterns (default: `debugger`), leftover `console.log`, TODO/FIXME pile-ups |
| **ui** | `<img>` without `alt`, inline-style sprawl, **raw hex colors outside design-token files** |
| **e2e** | Share of source files that have a sibling test file |

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
（structure / data / logic / ui / e2e），四个命名关卡按序短路
（canRun / dataReady / usageRight / featureWorks，其中 usageRight 是
logic 与 ui 的复合条件）。每个分数都能拆到带证据的命名检查项；跑不了的
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
