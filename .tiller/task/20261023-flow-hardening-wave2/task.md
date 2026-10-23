# 流程硬化第二波：过薄文档、日志与其余约定

<!-- tiller-task:v1 {"version":1,"id":"20261023-flow-hardening-wave2","type":"improvement","size":"standard","created":"2026-10-23T14:01:20.948Z","base":"d752cf9e5349c43f3d1d3ad816a571974d06cc12","scope":["src","test","resources",".tiller","README.md","AGENTS.md"],"preExisting":{},"format":"structured","slug":"flow-hardening-wave2","summary":"流程硬化第二波约定","requirementFile":".tiller/local/flow-hardening-wave2-req.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/flow-hardening-wave2-req.md`

# 流程硬化第二波（规划 20261023-flow-hardening 的 P-5～P-7） 在第一波过程卫生与引导之上，把文档过薄、验证日志可读性，以及剩余可观察的中低优先级软约定落成 warning / check 提示。不审用例步骤语义，不做 JUnit DisplayName 全量扫描，不强制日志入库，不认证 confirm 身份。版本保持 0.5.0。 ## 已明确方向 - **P-5 过薄文档**：standard 任务在 check 时，若任务设计正文（方案/取舍/影响）明显空壳，或工程内 `.tiller/specs/decisions.md`、相关模块 `design.md` 仅有标题/样板而无实质条目，给出可定位 warning（默认不因单独过薄阻断 accept，除非与现有 check 严重度策略明确一致且可解释）。 - **P-6 日志与过期提示**：verify 写入 `.tiller/local/logs/` 的内容至少包含命令、退出码、起止摘要或失败摘录，避免仅一行 `$ cmd`；check/resume 对「验证相对当前代码树已过期」给出明确提示（与现有 tree 过期判定衔接，文案可读）。 - **P-7 其余约定**：在不引入鉴权/语义审判的前提下，硬化仍暴露的软约定，至少包括：(1) 当前分支名未包含任务编号时 check 给出明确 warning；(2) 公开 usage/help 中补充过程卫生、过薄文档与日志可读性的简短说明。不做：confirm 身份认证、用例步骤语义比对、JUnit DisplayName 扫描、日志全文强制提交。 ## 本轮不做 - confirm 身份鉴权、用例语义审判、JUnit DisplayName 全量扫描、日志强制入库、设计字数硬 KPI（字符数门禁）、P-1～P-4 已交付项的重复实现。

### 范围

- 做：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md`
- 不做：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md` 以外的文件
- 涉及模块或文件：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md`

### 验收条件

- AC-1: 过薄的任务设计或 decisions/模块设计在 check 中给出可定位 warning
- AC-2: verify 日志含命令与结果摘要；过期验证在 check/resume 有明确提示
- AC-3: 分支名未含任务编号时 check 有明确 warning；usage/help 覆盖本波约定说明
- AC-4: 上述行为有用例与具名测试覆盖，全量 build/lint/typecheck/test/test:package 通过，版本保持 0.5.0

## 设计

### 方案

- 对照规划 `.tiller/plans/20261023-flow-hardening.md` 的 P-5～P-7；本任务不挂 `--item`（多条目合并为一次 standard 交付）。
- **AC-1 / P-5 过薄文档**：check 检测 (1) standard 任务设计「方案/取舍/影响与风险」是否仅有空白或占位；(2) `.tiller/specs/decisions.md` 是否仅有标题/引导而无有效决定条目；(3) 本任务改动涉及模块的 `design.md` 是否明显空壳。命中则 warning，文案指出路径；默认不单凭过薄阻断 accept（除非与现有严重度表一致且可解释）。不做硬字数 KPI。
- **AC-2 / P-6 日志与过期**：verify 写日志时至少记录显示命令、退出码、起止时间或失败摘录（stdout/stderr 截断即可）；禁止仅 `$ cmd` 一行。check/resume 在验证 tree 与当前不符时使用明确「验证已过期」类文案（可复用/加强现有判定）。
- **AC-3 / P-7 其余**：分支名未包含任务 id 时 check warning（已有提示可升格或统一文案）；同步 `resources/usage.md` / help / AGENTS 简述过薄检查、日志可读与分支命名约定。
- 用例从 **CASE-179** 起；测试名含 CASE；静态测试名（勿用模板字符串作唯一名）；全量验证；版本 0.5.0。

### 取舍

- 过薄用 warning 引导补全，避免因文档启发式误杀验收。
- 日志仍不入库；只改善本机可读性。
- P-7 收窄为分支命名与文档说明，不扩散到鉴权与语义审判。

### 影响与风险

- 历史空壳 decisions/设计会被 warning 刷屏，属预期。
- 日志变长可能略增磁盘占用，仍在 `.tiller/local/`。
- 分支命名 warning 对短分支名（如 `feat/flow`）会提示，可忽略或改名。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 用户原话：合并，开始下一轮
- 原话用途：可选附注，不替代已写明的正文
- 提交：d752cf9e5349c43f3d1d3ad816a571974d06cc12
- 对象摘要：ffa44dc2393b6d3ad450ea445be6305a1a19a437ae171164a259fddd8e31b4e7
- 时间：2026-10-23T14:01:21.070Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 用户原话：合并，开始下一轮
- 原话用途：可选附注，不替代已写明的正文
- 提交：d752cf9e5349c43f3d1d3ad816a571974d06cc12
- 对象摘要：b69cb24432f16195b3bb283c128ba9109453a5a423545dd67c6e3dfcbbb028bf
- 时间：2026-10-23T14:01:21.153Z

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
