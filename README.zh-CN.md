<p align="right"><a href="./README.md">English</a> · <strong>简体中文</strong></p>

# ai-code-gate

<p align="center">
  <a href="https://github.com/XingMXTeam/ai-code-gate/actions/workflows/ci.yml"><img src="https://github.com/XingMXTeam/ai-code-gate/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node >= 18">
  <img src="https://img.shields.io/badge/dependencies-zero-blue" alt="零依赖">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT 许可证">
</p>

**给 AI 生成代码用的确定性质量门禁。**

AI 写代码很快，难的是判断它写出来的东西能不能上线。Lint 管风格，测试管你已经想到的用例，`ai-code-gate` 在两者之间，围绕四个理念设计：

1. **打分，不靠感觉。** 每个项目从五个维度打分——**structure（结构）、data（数据）、logic（逻辑）、ui（界面）、e2e（端到端）**——全部由确定性规则判定，不让 AI 给 AI 当裁判。
2. **命名关卡，按序评判。** 关卡是维度分数的复合条件（比如 `usageRight` 同时要求 logic *和* ui），按顺序执行，第一关挂科就短路停跑，后面的关卡报 skipped。你永远知道最该先修的那一件事是什么。
3. **证据诚实。** 每个分数都能拆到带说明和 file:line 证据的命名检查项；在当前环境跑不了的检查报 **neutral（未验证）**，绝不冒充通过。
4. **治理内置。** 阈值写在配置文件里，而配置文件本身受保护：被验收的一方不能偷偷降低自己的验收标准（见下文「保护区」）；计划文档还可以声明「可改范围」，改动会被逐一核对。

## 快速开始

```bash
npx ai-code-gate            # 给当前项目打分
npx ai-code-gate --json     # 机器可读的报告，供 CI 使用
npx ai-code-gate init       # 生成默认的 gate.config.json
npx ai-code-gate init --with-kit
                            # 安装完整入门模板包（见「模板」一节）
```

## 模板

`templates/nextjs-harness/` 是一套完整的入门模板，按一个在 AI Harness 工作流下运行的真实 Next.js 项目的形态建模。`init --with-kit` 会把它复制到你的项目里（已有文件永不覆盖）：

- `gate.config.json`——带理由的阈值、四个关卡、架构分层规则（`src/lib`、`src/hooks`、`src/components` 不得 import `src/app/**`）、路由隔离、保护区路径，inputs 全部接好
- `plan.md`——计划骨架，带「可改范围」一节和检查直接消费的功能点（FP）清单格式
- `design-tokens.json`——设计 token 源骨架（`--color-*`、`--spacing-*` 等）
- `locales/en.json`——i18n 资源骨架
- `e2e-results.json`——由你的测试运行器每次改写的 `{passed, failed}` 文件
- `TEMPLATE.md`——替换清单：每个模板值在哪、该换成你自己的什么

模板是起点形态，不是标准答案：换上你的目录、你的 token 源、你的计划位置，再逐个收紧阈值。

退出码：`0` 通过 · `1` 某关未过或守卫拦截 · `2` 用法错误。

试一下自带的两个示例（同一个功能，两种完成度）：

```bash
npm run demo:bad    # 在 canRun 关挂科（架构违规）
npm run demo:good   # 四关全过
```

输出示例（节选）：

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

## 门禁定义

打分和过关是两步。先给**五个维度全量打分**（structure / data / logic / ui / e2e，各 0–100 分，从 100 分起按失败检查扣分）；然后把四个命名关卡**按顺序**拿分数去评判。第一关挂科即停，后面的关卡报 `skipped`，整体判定失败。

| # | 关卡 | 要求 | 实际含义 |
|---|---|---|---|
| 1 | `canRun` | structure ≥ 85 | 代码能编译（配置了编译命令时）、守架构的 import 分层与路由隔离、文件与函数不超限。跑都跑不起来，后面免谈。 |
| 2 | `dataReady` | data ≥ 85 | 没有硬编码凭证、localhost 之外没有明文 `http://` 接口。数据层接得安全。 |
| 3 | `usageRight` | logic ≥ 80 **且** ui ≥ 75 | 复合关：没有 `debugger`、没有 `console.log` 残留、TODO 不堆积——**并且** UI 守设计 token 纪律（不用裸 hex 色值）、满足无障碍底线（图片有 `alt`）。是「能给人用」，不只是「能跑」。 |
| 4 | `featureWorks` | e2e ≥ 60 | 至少一半源码文件（比例可配）有配套测试文件。功能是被验证过的，不只是写完的。 |

以上是默认阈值；每一个都写在 `gate.config.json` 里并附有 `why`（为什么是这个数），关卡本身——id、顺序、每关要求哪些维度——也都是配置，不是写死的。更严格的团队调高数字；关卡也可以把某个维度钉在高于默认的阈值上（例如 `{"id": "releaseReady", "requires": {"e2e": 90}}`）。

判定：**四关全过才 PASS。** 短路之后报告仍会列出每个维度的分数和每条失败检查——关卡负责做决定，维度负责解释为什么。

## 输入

只有源码，证明不了门禁声称的大部分事情。完整的输入集是：

| 输入 | 喂给 | 证明什么 |
|---|---|---|
| **源码树**（被扫描的目录） | 全部维度 | 代码本身：体量、import、模式、用法 |
| **`gate.config.json`** | 全部维度 | 阈值（每条带 `why`）、关卡定义、规则、豁免、保护区 |
| **编译命令**（可选，配置项） | structure | 代码真的能编译；未配置时该检查报 *neutral*，绝不默默算通过 |
| **计划文档**（`inputs.plan`） | logic、范围守卫 | 功能点（FP）覆盖：计划里的每个 FP id 必须在代码/测试中被引用；也提供计划声明的可改范围 |
| **设计 token 源**（`inputs.designTokens`） | ui | 代码里用的每个 `var(--x)` 必须在 token 源中真实存在（`.json` 用 `--name` 键，或声明了 `--var` 的 `.css`） |
| **i18n 资源**（`inputs.i18n.resources`） | data | 代码里调用的每个 i18n key 都在语言资源中存在；storage key 符合 `{page}.{entity}.{field}` 命名空间形态 |
| **E2E 运行结果**（`inputs.e2eResults`） | e2e | 一次真实运行的结局（`{"passed": n, "failed": n}`）。没有它时，e2e 退化为只查测试文件*存在性*，并会明说 |
| **UI 证据截图**（`inputs.uiEvidenceDir`） | ui | 通过结论有截图为据；小于 `uiEvidenceMinBytes`（默认 8192）的 PNG 是空白页，不是证据 |
| **Git 工作区** | verify-zone、scope | 哪些文件被改了——供保护区与计划范围两个守卫核对 |

经验法则：**一个维度只和它的输入一样强。** 只有源码时你得到的是结构与模式检查；每补一份工件（计划、token、资源、运行结果、截图），就多一个「未验证」变成真判定。

## 检查项一览

| 维度 | 检查内容 |
|---|---|
| **structure** | 编译命令（配置了才跑，否则 neutral）、`any` / `@ts-ignore` 压制、文件/函数长度（超限按文件类型给拆分建议）、**架构 import 规则**（配置驱动的分层方向）、`src/app/<route>/` 布局的**路由隔离** |
| **data** | 硬编码凭证、localhost 之外的明文 `http://`、对照语言资源的 **i18n key 完整性**、**storage key 命名空间**形态 |
| **logic** | 禁用模式（默认 `debugger`）、残留 `console.log`、TODO/FIXME 堆积、**计划功能点（FP）覆盖** |
| **ui** | `<img>` 缺 `alt`、内联样式泛滥、**设计 token 文件之外的裸 hex 色值**、**token 有效性**（`var(--x)` 必须在 token 源中存在）、**截图证据真实性**（空白页识别） |
| **e2e** | 提供了运行结果时按**真实结果**（`{passed, failed}`）计分；否则按有配套测试的源码文件占比计分，并标注为仅查存在性 |

## 配置

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

每个维度阈值都带一条 `why`——说不清理由的质量线，没人会去捍卫。豁免必须有路径、规则名和理由；被豁免的检查在报告里以 *neutral* 出现，看得见，只是不计分。

## 保护区

```bash
ai-gate verify-zone
```

只要 `protectedPaths` 里的文件有未提交改动、且没有设置 `GATE_HUMAN_CONFIRM=yes`，命令就拦截。道理很简单：被验收的一方不能自己降低验收标准。人看过 diff，再显式确认放行。

## 计划范围守卫

计划文档可以声明这次改动允许碰哪些地方：

```markdown
## Editable scope

- `src/app/**`
- `docs/*`
```

```bash
ai-gate scope plan.md
```

任何落在声明范围之外的改动都会拦下运行。计划里没有范围一节的，不做任何强制。

## 与 AI 编程 Agent 配合

预期的用法是一个循环：agent 写代码 → 门禁打分 → agent 按 **remediation** 清单从上往下修（清单按分值排序）→ 重跑 → 直到过关。因为报告是确定性的、且拆到了检查项粒度，「把门禁修过」是一个定义明确的任务，而「把代码写好一点」永远不是。

## 开发

```bash
npm test          # 跑测试套件
npm run demo:bad
npm run demo:good
```

## 背景

这个工具源自一套 AI 前端开发的 Harness Engineering（驾驭工程）工作流：
只靠 Prompt 和上下文，AI 写的代码并不敢直接合并——真正缺的是一个能
确定性地暴露错误的反馈现场。完整长文见：
[AI 写代码，最缺的不是 Prompt，而是一个能暴露错误的现场](https://maoxunxing.com/zh-cn/harness-engineering-ai-frontend/)

作者的更多工具与文章：[maoxunxing.com](https://maoxunxing.com/)

## 许可证

MIT

> 注：示例里的 `ui-evidence/*.png` 截图是生成的测试夹具（good 的是 10 KB 文件，bad 的是 128 字节的空白图），未纳入 git 跟踪——在本地用任意合适大小的 PNG 即可复现证据类检查。
