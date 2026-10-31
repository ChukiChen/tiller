# README 开篇只加“轻量的”

<!-- tiller-task:v1 {"version":1,"id":"20261031-readme-lite-100b","type":"documentation","size":"small","created":"2026-10-31T00:35:53.905Z","base":"0e31ec93df62530bd70b9f0d5fd5991c26e24091","scope":["README.md"],"format":"structured","slug":"readme-lite-100b","summary":"README 开篇只补充“轻量的”，其余内容不变"} -->

## 需求

### 使用场景

- 场景：README 开篇第一句在“标准工作流与 CLI”前加“轻量的”；不要长版，其余全文不动。

### 目标

短目标：README 开篇第一句在“标准工作流与 CLI”前加“轻量的”；不要长版，其余全文不动。

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“README 开篇第一句在“标准工作流与 CLI”前加“轻量的”；不要长版，其余全文不动。”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：README 开篇第一句在“标准工作流与 CLI”前加“轻量的”，整句为：tiller 是一套面向 AI 协作开发的轻量的标准工作流与 CLI。它帮助你和 AI 一起完成需求、设计、实现、测试与合入，并把目标、范围、验收条件与验证结果留成可追溯的记录。你负责确认目标与交付，AI 按约定推进具体工作。
- AC-2：README.md 除开篇第一句增加“轻量的”外，其余全文与 main 基线一致；不新增“不绑平台、不装插件”等长句。
- AC-3：CASE-109、CASE-167、CASE-234、CASE-242 的既有测试全部通过。

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-1: README 开篇第一句在“标准工作流与 CLI”前加“轻量的”，整句为：tiller 是一套面向 AI 协作开发的轻量的标准工作流与 CLI。它帮助你和 AI 一起完成需求、设计、实现、测试与合入，并把目标、范围、验收条件与验证结果留成可追溯的记录。你负责确认目标与交付，AI 按约定推进具体工作。
- AC-2: README.md 除开篇第一句增加“轻量的”外，其余全文与 main 基线一致；不新增“不绑平台、不装插件”等长句。
- AC-3: CASE-109、CASE-167、CASE-234、CASE-242 的既有测试全部通过。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-31T00:35:59.651Z | 0e31ec93df62 | 不要长版；用短版。自动合入。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"ee0f4ea5eaffd565ec1a5f5036658d575e7237732a03e76548987c05c88d95fa","commit":"0e31ec93df62530bd70b9f0d5fd5991c26e24091","by":"boon yu","quote":"不要长版；用短版。自动合入。","at":"2026-10-31T00:35:59.651Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-WoRgV5/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-WoRgV5/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-2.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:40.976Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-WoRgV5/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-WoRgV5/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-2.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:40.976Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 README is a user-facing quick start without internal flow detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-ZbjIis/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ZbjIis/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-109 README is a user-facing quick start without internal flow detail
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-3.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:41.626Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 README is a user-facing quick start without internal flow detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-ZbjIis/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ZbjIis/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-109 README is a user-facing quick start without internal flow detail
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-3.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:41.626Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' \u002d\u002dtest-reporter=./.tiller/local/verify-db4fsW/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-db4fsW/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-5.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:42.224Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' \u002d\u002dtest-reporter=./.tiller/local/verify-db4fsW/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-db4fsW/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-5.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:42.224Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-167 README keeps the user quick start and removes maintainer detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-iPodzH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-iPodzH/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-167 README keeps the user quick start and removes maintainer detail
- 用例：CASE-167
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-7.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:42.917Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-167 README keeps the user quick start and removes maintainer detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-iPodzH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-iPodzH/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-167 README keeps the user quick start and removes maintainer detail
- 用例：CASE-167
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-7.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:42.917Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 REST API 与 token$' \u002d\u002dtest-reporter=./.tiller/local/verify-dYeJ5t/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-dYeJ5t/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 REST API 与 token
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-9.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:43.583Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 REST API 与 token$' \u002d\u002dtest-reporter=./.tiller/local/verify-dYeJ5t/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-dYeJ5t/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"6e14189f5e11aee1b0109c2e0ae0998f6cd33a0620b674ecbccb27c8fcdf23e4","commit":"048fc2d6d3789fc2d73a7b4b9fc21f6ed77d0d1d"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 REST API 与 token
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-readme-lite-100b/logs/run-9.log
- 提交：048fc2d6d378
- 时间：2026-10-31T00:36:43.583Z

## 自检

交付前运行 check；验收后运行 accept。
