# README 说明 token 设置到环境变量

<!-- tiller-task:v1 {"version":1,"id":"20261030-readme-token-env-96c","type":"documentation","size":"small","created":"2026-10-30T15:33:09.135Z","base":"da1bb0a0243b4ab7bde2860a5a23987560c719b7","scope":["README.md"],"format":"structured","slug":"readme-token-env-96c"} -->

## 需求

### 使用场景

- 用户按 README 初始化工程时，需要明确知道 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`）应设置到环境变量中，而不是写到配置或命令行参数。
- `--apply` 只需说明会自动完成整个初始化流程，不展开为额外教程。
- 本次仅修正 README 文案，不改变 CLI、受管资源或其他文档。

### 目标

1. README「初始化工程」中的 token 句改为明确说明设置到环境变量中，并保留现有 token 名称与“无需安装其他命令行工具”。
2. 保持 `tiller init . --apply` 仅一句“会自动完成整个初始化流程”，不增加流程细节。
3. 定向回归 CASE-109、CASE-167、CASE-234、CASE-242。

背景：#61 tip `da1bb0a` 已合入短版 `--apply` 一句；#96c 追加要求明确 token 设置位置。

### 业务范围

- 做：只修改 `README.md` 的初始化 token 句，使环境变量设置语义明确。
- 不做：不修改 CLI 行为、测试、`resources/`、`.tiller/usage.md`、token 名称或其他 README 章节；不展开 `--apply` 流程。
- 假设：现有 `--apply` 单句已满足上一条反馈；已授权自动 squash 合入。

### 关键行为

- AC-1：README 初始化说明以“设置到环境变量中”描述 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`），并保留无需安装其他命令行工具
- AC-2：README 的 `--apply` 仍只用一句“会自动完成整个初始化流程”说明，不扩展流程细节
- AC-3：README 仍为面向用户的介绍与快速开始，AI 执行流程和用户关键确认不变
- AC-4：README 仍说明 REST API 与 token、不以平台 CLI 为主路径，本次产品改动仅 README.md

### 异常与边界

- 只允许改动 README 目标句；不得顺带改动 token 名称、API 描述或 `--apply` 句子。
- 任一验收条件或其定向回归失败时不得声明完成。

### 验收条件

- AC-1: README 初始化说明以“设置到环境变量中”描述 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`），并保留无需安装其他命令行工具
- AC-2: README 的 `--apply` 仍只用一句“会自动完成整个初始化流程”说明，不扩展流程细节
- AC-3: README 仍为面向用户的介绍与快速开始，AI 执行流程和用户关键确认不变
- AC-4: README 仍说明 REST API 与 token、不以平台 CLI 为主路径，本次产品改动仅 README.md

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-30T15:33:33.851Z | da1bb0a0243b | — |
| 交付验收 | ChukiChen | 2026-10-30T15:34:10.784Z | 84ae3ae43720 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"1e8ee884cedf785df4f1298b77d5fe0c3b452ad2d326929633bda63e844b6484","commit":"da1bb0a0243b4ab7bde2860a5a23987560c719b7","by":"ChukiChen","quote":"","at":"2026-10-30T15:33:33.851Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"b1f95c9c7ac7b6f4391d6ab42938ca34c7b6543bcd07d85e7f4c3b1fc18e6b10","commit":"84ae3ae43720b76281468ab4d922760676ed162d","by":"ChukiChen","quote":"","at":"2026-10-30T15:34:10.784Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 REST API 与 token$' \u002d\u002dtest-reporter=./.tiller/local/verify-0qvrmX/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-0qvrmX/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"5437fed6b0b1cdc519dcf7257ba86c2ba7d3665a20621179d69937d1c998289f","commit":"84ae3ae43720b76281468ab4d922760676ed162d"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 REST API 与 token
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-token-env-96c/logs/run-2.log
- 提交：84ae3ae43720
- 时间：2026-10-30T15:33:57.763Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-6SkYAM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6SkYAM/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"5437fed6b0b1cdc519dcf7257ba86c2ba7d3665a20621179d69937d1c998289f","commit":"84ae3ae43720b76281468ab4d922760676ed162d"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-token-env-96c/logs/run-3.log
- 提交：84ae3ae43720
- 时间：2026-10-30T15:33:58.443Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' \u002d\u002dtest-reporter=./.tiller/local/verify-jVjNXq/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-jVjNXq/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"5437fed6b0b1cdc519dcf7257ba86c2ba7d3665a20621179d69937d1c998289f","commit":"84ae3ae43720b76281468ab4d922760676ed162d"} -->
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-token-env-96c/logs/run-4.log
- 提交：84ae3ae43720
- 时间：2026-10-30T15:33:59.092Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 README is a user-facing quick start without internal flow detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-e3Isr7/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-e3Isr7/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"5437fed6b0b1cdc519dcf7257ba86c2ba7d3665a20621179d69937d1c998289f","commit":"84ae3ae43720b76281468ab4d922760676ed162d"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-109 README is a user-facing quick start without internal flow detail
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-token-env-96c/logs/run-5.log
- 提交：84ae3ae43720
- 时间：2026-10-30T15:33:59.092Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-167 README keeps the user quick start and removes maintainer detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-ciSXfh/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ciSXfh/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"5437fed6b0b1cdc519dcf7257ba86c2ba7d3665a20621179d69937d1c998289f","commit":"84ae3ae43720b76281468ab4d922760676ed162d"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-167 README keeps the user quick start and removes maintainer detail
- 用例：CASE-167
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-token-env-96c/logs/run-6.log
- 提交：84ae3ae43720
- 时间：2026-10-30T15:34:00.228Z

## 自检

- [x] 需求确认有效
- [x] 该任务无需设计确认
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 165 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 141 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 提交 84ae3ae 不符合提交信息规范：docs(readme): 说明 token 设置到环境变量（模块 readme 不在 specs/modules 中）。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/requirements.md`（“## <能力>” + 目标/边界）；`.tiller/specs/decisions.md`（“## <问题>” + 决定/代价）；`.tiller/context/project.md`（“## 当前状态” + 入口/限制）。纯过程性变更可忽略。
