# 文档写全 GitHub/GitLab CLI 名称

<!-- tiller-task:v1 {"version":1,"id":"20261026-docs-cli-names","type":"feature","size":"small","created":"2026-10-26T06:44:15.798Z","base":"bcc0e5115d8006c6c1cd595dfd93f28726b8d997","scope":["src","test","resources",".tiller","README.md","scripts"],"format":"structured","summary":"github/gitlab 命令名与 README 以 AI 执行为主","requirementFile":".tiller/local/20261026-docs-cli-names-req.md"} -->

## 需求

### 面向谁与问题

最终使用 tiller 的人。两处困惑：（1）`gh`/`glab` 缩写看不懂，要求文案与实际调用都用 `github`/`gitlab`；（2）README 快速开始像在教人手敲 tiller pr/merge/close，应改成 AI 按约定执行、用户关键确认。

### 目标

运行时与用户可见命令名统一为 github/gitlab（官方仍为 gh/glab，由 tiller 包装/解析）；README「用 AI 开发一个功能」写成 AI 执行工作流、用户确认；版本 0.5.0。

需求来源：`.tiller/local/20261026-docs-cli-names-req.md`

### 业务范围

- 做：README 快速开始改写；受管 usage/core/delivery（及镜像）；init/merge/pr 用户消息与可复制命令；运行时工具解析/包装使 argv0 为 github/gitlab；CASE-242 起与测试。
- 不做：不重新打包官方 CLI；不自动合入；不把 README 写成完整 CLI 手册。版本升至 0.5.0 属本任务交付。
- 假设与待确认：官方安装名仍为 gh/glab；tiller 负责映射。

### 关键行为

1. README：AI 执行 start/verify/pr/merge/close；用户确认；网页合入后 AI close；不把这些写成人类必手敲主路径。
2. 文档与 CLI 文案示例为 `github …` / `gitlab …`。
3. merge/init 实际调用命令名为 github 或 gitlab（经包装/解析）。

### 异常与边界

- PATH 优先 github/gitlab；否则包装/解析到 gh/glab。
- 两者都无：明确报错。

### 验收条件

- AC-1: README「开发一个功能」以 AI 执行 tiller 为主、用户确认；pr/merge/close 不写成人类手敲教程；网页合入→AI close；介绍+快速开始；无裸 gh/glab
- AC-2: resources/usage 与必要 delivery/core 受管文档用户可见 CLI 名称用 github/gitlab（或 GitHub CLI/GitLab CLI）
- AC-3: CLI 用户可见提示/错误/可复制命令使用 github/gitlab 措辞
- AC-4: 运行时 spawn 命令名为 github/gitlab（包装或解析到官方 gh/glab）；CASE-242 起与测试；全量门禁；版本 0.5.0

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T07:09:14.765Z | 7c241a9d7f7b | — |
| 交付验收 | boon yu | 2026-10-26T07:11:08.704Z | 1db7dd8ceaa6 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"05e20afd5f2c221e2610dc48f3d5c8f7429bca94375ca4982b1b01658ed32497","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41","by":"boon yu","quote":"","at":"2026-10-26T07:09:14.765Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"128779d6f4d5837955714c215e2fe794ebc64450ecaaab2810324e4df5eac77d","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce","by":"boon yu","quote":"","at":"2026-10-26T07:11:08.704Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名$' \u002d\u002dtest-reporter=./.tiller/local/verify-o7vRi7/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-o7vRi7/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-1.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:31.414Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名$' \u002d\u002dtest-reporter=./.tiller/local/verify-6NiXtZ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6NiXtZ/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-2.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:35.222Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致$' \u002d\u002dtest-reporter=./.tiller/local/verify-ZVnNrX/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ZVnNrX/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致
- 用例：CASE-243
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-3.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:35.738Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致$' \u002d\u002dtest-reporter=./.tiller/local/verify-ZVnNrX/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ZVnNrX/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致
- 用例：CASE-243
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-3.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:35.738Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-244 PATH 仅有官方短名时仍以 github/gitlab 调用并成功$' \u002d\u002dtest-reporter=./.tiller/local/verify-OUvZYt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-OUvZYt/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-244 PATH 仅有官方短名时仍以 github/gitlab 调用并成功
- 用例：CASE-244
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-5.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:36.294Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 文档 CLI 名称任务保持 0\\.5\\.0 并通过质量门禁$' \u002d\u002dtest-reporter=./.tiller/local/verify-iqqzrr/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-iqqzrr/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-245 文档 CLI 名称任务保持 0.5.0 并通过质量门禁
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-6.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:40.652Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-DRLpfB/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-DRLpfB/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"70e6d9dd052ad94be7c4d0c8454a42c3c3d5c034582c85e02b0624e9b254c3bb","commit":"7c241a9d7f7b92745a6a5347c586ecde6385bf41"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-7.log
- 提交：7c241a9d7f7b
- 时间：2026-10-26T07:08:40.652Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名$' \u002d\u002dtest-reporter=./.tiller/local/verify-Z7GYfg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Z7GYfg/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e0979982d534914c35bfb6be4ef8bf9ae2aa4bf91b537757427aca4aff7ce3b4","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-8.log
- 提交：1db7dd8ceaa6
- 时间：2026-10-26T07:10:58.257Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致$' \u002d\u002dtest-reporter=./.tiller/local/verify-as67lg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-as67lg/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e0979982d534914c35bfb6be4ef8bf9ae2aa4bf91b537757427aca4aff7ce3b4","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致
- 用例：CASE-243
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-9.log
- 提交：1db7dd8ceaa6
- 时间：2026-10-26T07:10:58.790Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致$' \u002d\u002dtest-reporter=./.tiller/local/verify-as67lg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-as67lg/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e0979982d534914c35bfb6be4ef8bf9ae2aa4bf91b537757427aca4aff7ce3b4","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致
- 用例：CASE-243
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-9.log
- 提交：1db7dd8ceaa6
- 时间：2026-10-26T07:10:58.790Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-244 PATH 仅有官方短名时仍以 github/gitlab 调用并成功$' \u002d\u002dtest-reporter=./.tiller/local/verify-lPwmJM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-lPwmJM/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e0979982d534914c35bfb6be4ef8bf9ae2aa4bf91b537757427aca4aff7ce3b4","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-244 PATH 仅有官方短名时仍以 github/gitlab 调用并成功
- 用例：CASE-244
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-11.log
- 提交：1db7dd8ceaa6
- 时间：2026-10-26T07:10:59.372Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 文档 CLI 名称任务保持 0\\.5\\.0 并通过质量门禁$' \u002d\u002dtest-reporter=./.tiller/local/verify-1CopwH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-1CopwH/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e0979982d534914c35bfb6be4ef8bf9ae2aa4bf91b537757427aca4aff7ce3b4","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-245 文档 CLI 名称任务保持 0.5.0 并通过质量门禁
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-12.log
- 提交：1db7dd8ceaa6
- 时间：2026-10-26T07:11:03.792Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-FZgVYc/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-FZgVYc/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"e0979982d534914c35bfb6be4ef8bf9ae2aa4bf91b537757427aca4aff7ce3b4","commit":"1db7dd8ceaa632a7c5f6d87bd8e8cfa238f871ce"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-docs-cli-names/logs/run-13.log
- 提交：1db7dd8ceaa6
- 时间：2026-10-26T07:11:03.792Z

## 自检

- [x] 需求确认有效
- [x] 该任务无需设计确认
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 64 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 30 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 109 条用例及经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/modules/initialization/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/initialization/design.md`（“## <方案>” + 取舍与影响）；`.tiller/specs/modules/standards/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/standards/design.md`（“## <方案>” + 取舍与影响）。纯过程性变更可忽略。
