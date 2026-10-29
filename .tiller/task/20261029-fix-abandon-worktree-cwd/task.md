# 修复 abandon 在 worktree cwd 清理失败假成功

<!-- tiller-task:v1 {"version":1,"id":"20261029-fix-abandon-worktree-cwd","type":"bugfix","size":"standard","created":"2026-10-29T10:47:14.780Z","base":"54250ad578daecdcf6713d6eee75e08870fef8fe","scope":["src","test",".tiller/specs",".tiller/cases",".tiller/context"],"format":"structured","slug":"abandon-worktree-cwd","summary":"worktree cwd 下 abandon 先切出并传播清理失败"} -->

## 需求

### 使用场景

- 场景：从任务 worktree 内执行 close --abandon 时先切出 cwd，并在本地清理失败时非零退出，不再假报已放弃。

### 目标

需求来源：`.tiller/specs/modules/workflow/surefire-abandon.md`

从任务 worktree 内执行 close --abandon 时先切出 cwd，并在本地清理失败时非零退出，不再假报已放弃。

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“从任务 worktree 内执行 close --abandon 时先切出 cwd，并在本地清理失败时非零退出，不再假报已放弃。”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-3：在任务 worktree（含其子目录）执行 accepted close --abandon 时，删除前将 cwd 切出待删目录；成功后任务 worktree、.tiller/local/<id>/、存在的本地与远端任务分支均消失，仍不写 primary task.md/CASE 且不产生提交
- AC-4：abandon 任一本地清理项失败（含 Windows EBUSY 有界短重试耗尽）时返回非零退出与 ok:false，错误码为 TASK_CLEANUP_FAILED，且不得返回已放弃成功结果

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-3: 在任务 worktree（含其子目录）执行 accepted close --abandon 时，删除前将 cwd 切出待删目录；成功后任务 worktree、.tiller/local/<id>/、存在的本地与远端任务分支均消失，仍不写 primary task.md/CASE 且不产生提交
- AC-4: abandon 任一本地清理项失败（含 Windows EBUSY 有界短重试耗尽）时返回非零退出与 ok:false，错误码为 TASK_CLEANUP_FAILED，且不得返回已放弃成功结果

## 设计

### 方案

需求来源：`.tiller/specs/modules/workflow/surefire-abandon.md`

设计来源：`.tiller/specs/modules/workflow/surefire-abandon-design.md`

在 `cleanupTaskWorktrees` 删除前识别 cwd 是否位于任务 worktree 或 `.tiller/local/<id>/`，命中则先切到 primary。worktree 的 Git 拆除和目录删除共用有界短重试；本机删除或本地分支删除失败汇总为 `TASK_CLEANUP_FAILED`，由 `closeFlow` 非零返回，不生成放弃成功结果。

### 失败处理

缺失项继续幂等处理，非致命远端告警保持 warning。cwd 切换失败、worktree/任务目录删除失败或本地分支删除失败时保留仍存在的本机事实，返回 `TASK_CLEANUP_FAILED`，不报告“已放弃”。

### 取舍

不忽略 EBUSY 继续当成功，也不重新引入 persistAbandonedTask；失败后由用户解除占用并重试，避免假清理。

### 影响与风险

影响 `src/task-worktrees.ts`、`src/flow.ts`、`src/branch-cleanup.ts`、workflow specs、CASE 与测试。Linux/mac 成功路径保持兼容；Windows 通过先切出 cwd 和短重试缓解 EBUSY，测试覆盖 cwd 成功清理与失败传播。

### 验证入口

运行 `test/task-worktrees.test.mjs` 中引用 CASE-317、CASE-322 与新增失败传播用例的具名测试；再执行 `npm test`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-29T10:48:50.510Z | 54250ad578da | — |
| 设计 | ChukiChen | 2026-10-29T10:48:53.129Z | 5f1dcefe4d22 | — |
| 交付验收 | ChukiChen | 2026-10-29T11:11:20.864Z | 45af97305dbb | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"1738c681f899bdf80ce077230edf4b4533d5f50e5a35eab543e2636a12ca89d7","commit":"54250ad578daecdcf6713d6eee75e08870fef8fe","by":"ChukiChen","quote":"","at":"2026-10-29T10:48:50.510Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"57366517d70ee07d9d47dc14e0f56fedc734bd6a8f3e8bef965df32c905aa5e3","commit":"5f1dcefe4d228afc316f19a190895514ce1c66ac","by":"ChukiChen","quote":"","at":"2026-10-29T10:48:53.129Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"f6d624670e1cc28ac46b8c4657932d5c4f74611f0f97fcb6ca2d332f23065631","commit":"45af97305dbb54f1f659e9230dec3704e55de237","by":"ChukiChen","quote":"","at":"2026-10-29T11:11:20.864Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-355 abandon 本机清理失败返回 TASK_CLEANUP_FAILED 且不假成功$' \u002d\u002dtest-reporter=./.tiller/local/verify-cQEEJ4/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-cQEEJ4/report.jsonl test/task-worktrees.test.mjs","exitCode":1,"tree":"b70b1cb26d75b1c11c35b056012b9d440bfb8e9f5b7e8fda8493b50118ddda8d","commit":"45af97305dbb54f1f659e9230dec3704e55de237"} -->
- 条件：AC-4
- 测试：test/task-worktrees.test.mjs::CASE-355 abandon 本机清理失败返回 TASK_CLEANUP_FAILED 且不假成功
- 用例：CASE-355
- 结果：failed
- 来源：executed
- 核实：已核实
- 预期：失败先行
- 基线提交：54250ad578daecdcf6713d6eee75e08870fef8fe
- 日志：.tiller/local/20261029-fix-abandon-worktree-cwd/logs/run-2.log
- 提交：45af97305dbb
- 时间：2026-10-29T11:10:54.387Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 accepted abandon from a worktree subdirectory cleans worktree, local task facts and branch$' \u002d\u002dtest-reporter=./.tiller/local/verify-Dec9Pz/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Dec9Pz/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"b70b1cb26d75b1c11c35b056012b9d440bfb8e9f5b7e8fda8493b50118ddda8d","commit":"45af97305dbb54f1f659e9230dec3704e55de237"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-317 accepted abandon from a worktree subdirectory cleans worktree, local task facts and branch
- 用例：CASE-317
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-worktree-cwd/logs/run-3.log
- 提交：45af97305dbb
- 时间：2026-10-29T11:10:58.952Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-322 abandon cleans the task checkout without writing primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-grc6T4/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-grc6T4/report.jsonl test/first-batch.test.mjs","exitCode":0,"tree":"b70b1cb26d75b1c11c35b056012b9d440bfb8e9f5b7e8fda8493b50118ddda8d","commit":"45af97305dbb54f1f659e9230dec3704e55de237"} -->
- 条件：AC-3
- 测试：test/first-batch.test.mjs::CASE-322 abandon cleans the task checkout without writing primary
- 用例：CASE-322
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-worktree-cwd/logs/run-4.log
- 提交：45af97305dbb
- 时间：2026-10-29T11:11:04.685Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-322 accepted but unmerged task abandons by cleaning only local facts$' \u002d\u002dtest-reporter=./.tiller/local/verify-QDPl0J/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-QDPl0J/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"b70b1cb26d75b1c11c35b056012b9d440bfb8e9f5b7e8fda8493b50118ddda8d","commit":"45af97305dbb54f1f659e9230dec3704e55de237"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-322 accepted but unmerged task abandons by cleaning only local facts
- 用例：CASE-322
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-worktree-cwd/logs/run-5.log
- 提交：45af97305dbb
- 时间：2026-10-29T11:11:04.685Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-355 abandon 本机清理失败返回 TASK_CLEANUP_FAILED 且不假成功$' \u002d\u002dtest-reporter=./.tiller/local/verify-GVKg0j/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-GVKg0j/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"b70b1cb26d75b1c11c35b056012b9d440bfb8e9f5b7e8fda8493b50118ddda8d","commit":"45af97305dbb54f1f659e9230dec3704e55de237"} -->
- 条件：AC-4
- 测试：test/task-worktrees.test.mjs::CASE-355 abandon 本机清理失败返回 TASK_CLEANUP_FAILED 且不假成功
- 用例：CASE-355
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-worktree-cwd/logs/run-6.log
- 提交：45af97305dbb
- 时间：2026-10-29T11:11:11.911Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 缺陷修复包含基线失败与当前通过证据
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 165 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 141 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 66 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例；建议同时回归经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 52 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 175 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
