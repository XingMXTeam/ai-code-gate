# ai-code-gate

**Deterministic quality gates for AI-generated code.**

AI writes code fast. The hard part is knowing whether what it wrote is safe to
ship. Lint tells you about style; tests tell you about the cases you already
thought of. `ai-code-gate` sits in between: it scores a project across five
dimensions — **structure, data, logic, ui, e2e** — and fails fast at the first
gate that does not clear its threshold, so you fix the cheapest problem first
instead of drowning in a wall of warnings.

No AI is involved in the judging. Every check is a plain, explainable rule.

## Quick start

```bash
npx ai-code-gate            # score the current project
npx ai-code-gate --json     # machine-readable report for CI
npx ai-code-gate init       # write a default gate.config.json
```

Exit codes: `0` all gates pass · `1` a gate failed · `2` usage/config error.

Example output:

```
ai-code-gate — scanned 2 file(s) in ./examples/bad

  structure  100/100  (threshold 85)  PASS
  data        80/100  (threshold 85)  FAIL
    - src/api.ts:2 [hardcoded-secret] Possible hardcoded credential. Move it to an environment variable.
    - src/api.ts:3 [insecure-url] Plain http:// URL. Use https:// outside local development.
  logic      skipped (earlier gate failed)
  ui         skipped (earlier gate failed)
  e2e        skipped (earlier gate failed)

VERDICT: FAIL — stopped at the "data" gate. Fix these before anything else.
```

Try it on the bundled examples:

```bash
npm run demo:bad    # fails at the data gate
npm run demo:good   # the same feature, written to pass
```

## What gets checked

| Dimension | Checks |
|---|---|
| **structure** | File length limit, function length limit |
| **data** | Hardcoded credentials, plain `http://` URLs outside localhost |
| **logic** | `debugger` and other forbidden patterns, leftover `console.log`, TODO/FIXME pile-ups |
| **ui** | `<img>` without `alt`, inline-style sprawl in JSX/TSX |
| **e2e** | Share of source files that have a sibling test file |

Scores start at 100 per dimension; each violation deducts points. Dimensions
are evaluated in gate order and the run **short-circuits** at the first
failure — later dimensions report as `skipped`.

## Configuration

Run `ai-gate init` to get a `gate.config.json`, then tune:

```json
{
  "compileCommand": "npx tsc --noEmit",
  "gateOrder": ["structure", "data", "logic", "ui", "e2e"],
  "thresholds": { "structure": 85, "data": 85, "logic": 80, "ui": 75, "e2e": 60 },
  "rules": {
    "structure": { "maxFileLines": 300, "maxFunctionLines": 50 },
    "logic": { "maxTodosPerFile": 3, "forbiddenPatterns": ["\\bdebugger\\b"] },
    "e2e": { "targetTestRatio": 0.5 }
  }
}
```

`compileCommand` is an optional pre-gate: if your code does not compile,
nothing else matters and the run stops there.

## Using it with AI coding agents

The intended workflow is a loop: the agent writes code, the gate scores it,
the agent fixes what the gate flagged, repeat until green. Because the report
is deterministic and ordered by gate, an agent (or a human) always knows the
single most important thing to fix next.

```bash
# in CI, or as the last step of an agent session
npx ai-code-gate --json > gate-report.json
```

## 中文说明

`ai-code-gate` 是一个给 AI 生成代码用的确定性验收门禁：从 structure / data /
logic / ui / e2e 五个维度打分，按门禁顺序逐关检查，任何一关低于阈值立即
短路并给出违规清单。规则全部可配（`gate.config.json`），无任何 AI 参与判定，
适合接进 Claude Code 等智能体工作流的最后一步，或作为 CI 的一道关卡。

## Development

```bash
npm test          # run the test suite
npm run demo:bad  # see a failing report
npm run demo:good # see a passing report
```

## License

MIT
