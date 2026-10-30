# README 开篇与 token 文案润色

<!-- tiller-task:v1 {"version":1,"id":"20261030-readme-polish-96d","type":"documentation","size":"small","created":"2026-10-30T15:35:32.817Z","base":"755d71700f61ce50878844461f2cf54272716bc2","scope":["README.md"],"format":"structured","slug":"readme-polish-96d","summary":"润色 README 开篇，并确认 token 环境变量与 --apply 文案"} -->

## 需求

### 使用场景

- 用户阅读 README 开篇与初始化说明时，应看到不限定存储媒介的“可追溯的记录”，并明确 token 设置到环境变量中。
- `tiller init . --apply` 仍保持一句说明，不展开为额外教程。
- 本次只润色 README 文案，不改变 CLI、测试、受管资源或其他文档。

### 目标

1. README 开篇改为把目标、范围、验收条件与验证结果“留成可追溯的记录”，去掉对 Git 记录的限定。
2. 保留并核对 token 设置到环境变量的说明，以及 `--apply` 的单句说明。
3. 定向回归 CASE-109、CASE-167、CASE-234、CASE-242。

背景：tip `755d717` 已包含 `--apply` 与 token 环境变量文案；本次实际代码差异仅开篇一句，但不重复改写已经正确的两处。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

- 做：只修改 `README.md`，润色开篇的“可追溯的记录”表述。
- 不做：不修改 CLI 行为、测试、`resources/`、`.tiller/usage.md`、token 名称、token 句、`--apply` 句或其他 README 章节。
- 假设：tip 已有 token 环境变量与 `--apply` 单句文案且符合要求；本次已授权自动 squash 合入。

### 关键行为

- AC-1：README 开篇写目标、范围、验收条件与验证结果留成可追溯的记录，不再限定为 Git 记录
- AC-2：README 说明把 GITHUB_TOKEN（或 GH_TOKEN）或 GITLAB_TOKEN（或 GL_TOKEN）设置到环境变量中，并保留无需安装其他命令行工具
- AC-3：README 保持 tiller init . --apply 仅一句会自动完成整个初始化流程
- AC-4：README 仍为面向用户的介绍与快速开始，且产品改动仅 README.md

### 异常与边界

- 仅允许改动 README 开篇目标句；token 句与 `--apply` 句保持现状。
- 任一验收条件或定向回归失败时不得声明完成。

### 验收条件

- AC-1: README 开篇写目标、范围、验收条件与验证结果留成可追溯的记录，不再限定为 Git 记录
- AC-2: README 说明把 GITHUB_TOKEN（或 GH_TOKEN）或 GITLAB_TOKEN（或 GL_TOKEN）设置到环境变量中，并保留无需安装其他命令行工具
- AC-3: README 保持 tiller init . --apply 仅一句会自动完成整个初始化流程
- AC-4: README 仍为面向用户的介绍与快速开始，且产品改动仅 README.md

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-30T15:35:44.153Z | 755d71700f61 | — |
| 交付验收 | ChukiChen | 2026-10-30T15:36:31.192Z | 7d92a5b4697c | 改完自动合并，不必再问。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"4d447bd8a0af415d590adaae7ee4684677749b3596cf9d502050d54880fddbbe","commit":"755d71700f61ce50878844461f2cf54272716bc2","by":"ChukiChen","quote":"","at":"2026-10-30T15:35:44.153Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"edcb4fe5dbf2a33eaf87ada610d2536ca2a80374b4d14e6f410715627a2d8023","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699","by":"ChukiChen","quote":"改完自动合并，不必再问。","at":"2026-10-30T15:36:31.192Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-LYBj0L/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-LYBj0L/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"62807cb7afd1076a2c7daa8f24d0c09e308006ada94ebe013fce4f286ebc00e7","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-polish-96d/logs/run-2.log
- 提交：7d92a5b4697c
- 时间：2026-10-30T15:36:14.131Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-LYBj0L/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-LYBj0L/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"62807cb7afd1076a2c7daa8f24d0c09e308006ada94ebe013fce4f286ebc00e7","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-polish-96d/logs/run-2.log
- 提交：7d92a5b4697c
- 时间：2026-10-30T15:36:14.131Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 REST API 与 token$' \u002d\u002dtest-reporter=./.tiller/local/verify-lBarbu/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-lBarbu/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"62807cb7afd1076a2c7daa8f24d0c09e308006ada94ebe013fce4f286ebc00e7","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 REST API 与 token
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-polish-96d/logs/run-3.log
- 提交：7d92a5b4697c
- 时间：2026-10-30T15:36:14.843Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' \u002d\u002dtest-reporter=./.tiller/local/verify-CyA2xC/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-CyA2xC/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"62807cb7afd1076a2c7daa8f24d0c09e308006ada94ebe013fce4f286ebc00e7","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699"} -->
- 条件：AC-4
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-polish-96d/logs/run-4.log
- 提交：7d92a5b4697c
- 时间：2026-10-30T15:36:15.470Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 README is a user-facing quick start without internal flow detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-0auhUs/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-0auhUs/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"62807cb7afd1076a2c7daa8f24d0c09e308006ada94ebe013fce4f286ebc00e7","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-109 README is a user-facing quick start without internal flow detail
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-polish-96d/logs/run-5.log
- 提交：7d92a5b4697c
- 时间：2026-10-30T15:36:15.470Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-167 README keeps the user quick start and removes maintainer detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-H8Ji4c/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-H8Ji4c/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"62807cb7afd1076a2c7daa8f24d0c09e308006ada94ebe013fce4f286ebc00e7","commit":"7d92a5b4697c8255ac1d57ea1acc3e2bf2710699"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-167 README keeps the user quick start and removes maintainer detail
- 用例：CASE-167
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-readme-polish-96d/logs/run-6.log
- 提交：7d92a5b4697c
- 时间：2026-10-30T15:36:16.604Z

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
- 提交 7d92a5b 不符合提交信息规范：docs(readme): 润色开篇的可追溯记录 [20261030-readme-polish-96d]（模块 readme 不在 specs/modules 中）。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/requirements.md`（“## <能力>” + 目标/边界）；`.tiller/specs/decisions.md`（“## <问题>” + 决定/代价）；`.tiller/context/project.md`（“## 当前状态” + 入口/限制）。纯过程性变更可忽略。
