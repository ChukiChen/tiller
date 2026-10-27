# doctor/close 对齐 worktree 任务真相

<!-- tiller-task:v1 {"version":1,"id":"20261027-lifecycle-truth","type":"feature","size":"small","created":"2026-10-27T14:20:04.916Z","base":"e32d0099f79df0ed92af835989ded84bd2367b11","scope":["src","test",".tiller"],"format":"structured"} -->

## 需求

### 使用场景

- 场景：doctor 从 active worktree 读任务；close/abandon 未合入或未落盘前不得删唯一任务事实；ready/next 诚实

### 目标

短目标：doctor 从 active worktree 读任务；close/abandon 未合入或未落盘前不得删唯一任务事实；ready/next 诚实

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“doctor 从 active worktree 读任务；close/abandon 未合入或未落盘前不得删唯一任务事实；ready/next 诚实”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：doctor 能发现并检查只存在于 worktree 的进行中任务，不得因 primary 无 .tiller/task 而全绿
- AC-2：close/abandon 在无合入证明或无法持久化放弃事实时拒绝破坏性清理，不得提示不可执行的 reopen
- AC-3：相关 CASE/测试与 package smoke 通过；版本 0.5.0

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-1: doctor 能发现并检查只存在于 worktree 的进行中任务，不得因 primary 无 .tiller/task 而全绿
- AC-2: close/abandon 在无合入证明或无法持久化放弃事实时拒绝破坏性清理，不得提示不可执行的 reopen
- AC-3: 相关 CASE/测试与 package smoke 通过；版本 0.5.0

## 设计

### 方案
- doctor：从 git worktree list / `.tiller/local/*/worktrees.json` 发现 active 任务 worktree，从 worktree 读 task.md 做覆盖检查；有 active worktree 却匹配不到任务时 warn/fail，不得全绿。
- close/abandon：无合入证明时拒绝删除唯一任务事实；abandon 须先持久化放弃事件再清理；无法持久化则拒绝；输出不得承诺不可执行的 reopen。
- ready/next：与对账结果一致。

### 影响面
src/doctor.ts、src/flow.ts close/abandon、相关 test/CASE、usage/decisions。

### 影响与风险
- 影响：doctor 与 close 行为收紧；可能阻断原先「未合入直接 close」捷径。
- 风险：误杀合法清理——合入证明判定要与现有 merge/ff 证据对齐。
- 回退：保持 0.5.0；不引入数据库。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T14:20:24.304Z | e32d0099f79d | — |
| 设计 | boon yu | 2026-10-27T14:20:24.434Z | 125be60ded33 | — |
| 交付验收 | boon yu | 2026-10-27T14:53:36.629Z | c02246c0d99a | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"88c742075c78fafd3f7dc41502cb212a374fbef8e9dcb41e2c862583c08f4ffa","commit":"e32d0099f79df0ed92af835989ded84bd2367b11","by":"boon yu","quote":"","at":"2026-10-27T14:20:24.304Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"7bb4ac4a3f9a0e5af76e9632ce4179a8c353445ad96ff49851179187e4e52de2","commit":"125be60ded33cf39fbf4b441403d188527d9a8eb","by":"boon yu","quote":"","at":"2026-10-27T14:20:24.434Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"9ce75b85ffd4fcd20d16fc5794b34bd0f9745639b56f75d1fed4d3788b4fd946","commit":"c02246c0d99aa0152a6489e8840cb838e643bb42","by":"boon yu","quote":"","at":"2026-10-27T14:53:36.629Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-315 doctor checks tasks that exist only in an active worktree$' \u002d\u002dtest-reporter=./.tiller/local/verify-KjZCQV/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-KjZCQV/report.jsonl test/doctor.test.mjs","exitCode":0,"tree":"1a27fcdc2f5e5507b6d254fcd8962f4fcb4ff44556ca12f58212b402d8d7d93b","commit":"71024c76c948f700c1f57b2a3674534298e9cd55"} -->
- 条件：AC-1
- 测试：test/doctor.test.mjs::CASE-315 doctor checks tasks that exist only in an active worktree
- 用例：CASE-315
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-1.log
- 提交：71024c76c948
- 时间：2026-10-27T14:41:35.403Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-280 CASE-316 worktree-only close reads the record but requires merge proof$' \u002d\u002dtest-reporter=./.tiller/local/verify-xlDUu9/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xlDUu9/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"1a27fcdc2f5e5507b6d254fcd8962f4fcb4ff44556ca12f58212b402d8d7d93b","commit":"71024c76c948f700c1f57b2a3674534298e9cd55"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-280 CASE-316 worktree-only close reads the record but requires merge proof
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-2.log
- 提交：71024c76c948
- 时间：2026-10-27T14:41:42.041Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-316 close reports no executable reopen when only platform merge evidence survives$' \u002d\u002dtest-reporter=./.tiller/local/verify-dENoD7/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-dENoD7/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"1a27fcdc2f5e5507b6d254fcd8962f4fcb4ff44556ca12f58212b402d8d7d93b","commit":"71024c76c948f700c1f57b2a3674534298e9cd55"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-316 close reports no executable reopen when only platform merge evidence survives
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-3.log
- 提交：71024c76c948
- 时间：2026-10-27T14:41:42.041Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record$' \u002d\u002dtest-reporter=./.tiller/local/verify-cXAe8X/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-cXAe8X/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"1a27fcdc2f5e5507b6d254fcd8962f4fcb4ff44556ca12f58212b402d8d7d93b","commit":"71024c76c948f700c1f57b2a3674534298e9cd55"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record
- 用例：CASE-317
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-4.log
- 提交：71024c76c948
- 时间：2026-10-27T14:41:47.855Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-8rySBH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-8rySBH/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"1a27fcdc2f5e5507b6d254fcd8962f4fcb4ff44556ca12f58212b402d8d7d93b","commit":"71024c76c948f700c1f57b2a3674534298e9cd55"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-5.log
- 提交：71024c76c948
- 时间：2026-10-27T14:41:51.502Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-315 doctor checks tasks that exist only in an active worktree$' \u002d\u002dtest-reporter=./.tiller/local/verify-BkjQIl/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-BkjQIl/report.jsonl test/doctor.test.mjs","exitCode":0,"tree":"8bab1d07cef5ba9242b312415af522270ac59ccfe13e9ac942e4a4f7a6c1cc64","commit":"4080cc2dd1984e3bc13b380bedf953206e1f6116"} -->
- 条件：AC-1
- 测试：test/doctor.test.mjs::CASE-315 doctor checks tasks that exist only in an active worktree
- 用例：CASE-315
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-6.log
- 提交：4080cc2dd198
- 时间：2026-10-27T14:45:55.919Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-280 CASE-316 worktree-only close reads the record but requires merge proof$' \u002d\u002dtest-reporter=./.tiller/local/verify-gEtt8u/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-gEtt8u/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"8bab1d07cef5ba9242b312415af522270ac59ccfe13e9ac942e4a4f7a6c1cc64","commit":"4080cc2dd1984e3bc13b380bedf953206e1f6116"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-280 CASE-316 worktree-only close reads the record but requires merge proof
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-7.log
- 提交：4080cc2dd198
- 时间：2026-10-27T14:45:57.011Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-316 close reports no executable reopen when only platform merge evidence survives$' \u002d\u002dtest-reporter=./.tiller/local/verify-WFFixJ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-WFFixJ/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"8bab1d07cef5ba9242b312415af522270ac59ccfe13e9ac942e4a4f7a6c1cc64","commit":"4080cc2dd1984e3bc13b380bedf953206e1f6116"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-316 close reports no executable reopen when only platform merge evidence survives
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-8.log
- 提交：4080cc2dd198
- 时间：2026-10-27T14:45:57.011Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record$' \u002d\u002dtest-reporter=./.tiller/local/verify-HCBxfy/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-HCBxfy/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"8bab1d07cef5ba9242b312415af522270ac59ccfe13e9ac942e4a4f7a6c1cc64","commit":"4080cc2dd1984e3bc13b380bedf953206e1f6116"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record
- 用例：CASE-317
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-9.log
- 提交：4080cc2dd198
- 时间：2026-10-27T14:46:00.623Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-FJBHbW/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-FJBHbW/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"8bab1d07cef5ba9242b312415af522270ac59ccfe13e9ac942e4a4f7a6c1cc64","commit":"4080cc2dd1984e3bc13b380bedf953206e1f6116"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-10.log
- 提交：4080cc2dd198
- 时间：2026-10-27T14:46:01.741Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-315 doctor checks tasks that exist only in an active worktree$' \u002d\u002dtest-reporter=./.tiller/local/verify-FgGuEX/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-FgGuEX/report.jsonl test/doctor.test.mjs","exitCode":0,"tree":"9f9d441594ff2a305417de991b320105dbff3e3fb256db46d1f27a4baeba01ae","commit":"ba0e56eff745d5054f1f173cc44d2be7f1ab0c78"} -->
- 条件：AC-1
- 测试：test/doctor.test.mjs::CASE-315 doctor checks tasks that exist only in an active worktree
- 用例：CASE-315
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-11.log
- 提交：ba0e56eff745
- 时间：2026-10-27T14:50:36.920Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-280 CASE-316 worktree-only close reads the record but requires merge proof$' \u002d\u002dtest-reporter=./.tiller/local/verify-SMKWeI/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-SMKWeI/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"9f9d441594ff2a305417de991b320105dbff3e3fb256db46d1f27a4baeba01ae","commit":"ba0e56eff745d5054f1f173cc44d2be7f1ab0c78"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-280 CASE-316 worktree-only close reads the record but requires merge proof
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-12.log
- 提交：ba0e56eff745
- 时间：2026-10-27T14:50:37.983Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-316 close reports no executable reopen when only platform merge evidence survives$' \u002d\u002dtest-reporter=./.tiller/local/verify-ITVtVq/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ITVtVq/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"9f9d441594ff2a305417de991b320105dbff3e3fb256db46d1f27a4baeba01ae","commit":"ba0e56eff745d5054f1f173cc44d2be7f1ab0c78"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-316 close reports no executable reopen when only platform merge evidence survives
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-13.log
- 提交：ba0e56eff745
- 时间：2026-10-27T14:50:37.983Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record$' \u002d\u002dtest-reporter=./.tiller/local/verify-xEiwkf/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xEiwkf/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"9f9d441594ff2a305417de991b320105dbff3e3fb256db46d1f27a4baeba01ae","commit":"ba0e56eff745d5054f1f173cc44d2be7f1ab0c78"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record
- 用例：CASE-317
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-14.log
- 提交：ba0e56eff745
- 时间：2026-10-27T14:50:41.397Z

### run-15
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-6phFap/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6phFap/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"9f9d441594ff2a305417de991b320105dbff3e3fb256db46d1f27a4baeba01ae","commit":"ba0e56eff745d5054f1f173cc44d2be7f1ab0c78"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-15.log
- 提交：ba0e56eff745
- 时间：2026-10-27T14:50:42.508Z

### run-16
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-315 doctor checks tasks that exist only in an active worktree$' \u002d\u002dtest-reporter=./.tiller/local/verify-MjP4AG/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-MjP4AG/report.jsonl test/doctor.test.mjs","exitCode":0,"tree":"834d9b206b6d27658d4c6f7d30e7084369b42a7c0916d267bb7e0f36df7d9f02","commit":"c02246c0d99aa0152a6489e8840cb838e643bb42"} -->
- 条件：AC-1
- 测试：test/doctor.test.mjs::CASE-315 doctor checks tasks that exist only in an active worktree
- 用例：CASE-315
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-16.log
- 提交：c02246c0d99a
- 时间：2026-10-27T14:53:26.034Z

### run-17
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-316 close reports no executable reopen when only platform merge evidence survives$' \u002d\u002dtest-reporter=./.tiller/local/verify-oVePEY/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-oVePEY/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"834d9b206b6d27658d4c6f7d30e7084369b42a7c0916d267bb7e0f36df7d9f02","commit":"c02246c0d99aa0152a6489e8840cb838e643bb42"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-316 close reports no executable reopen when only platform merge evidence survives
- 用例：CASE-316
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-17.log
- 提交：c02246c0d99a
- 时间：2026-10-27T14:53:27.110Z

### run-18
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record$' \u002d\u002dtest-reporter=./.tiller/local/verify-hKhxtd/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-hKhxtd/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"834d9b206b6d27658d4c6f7d30e7084369b42a7c0916d267bb7e0f36df7d9f02","commit":"c02246c0d99aa0152a6489e8840cb838e643bb42"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record
- 用例：CASE-317
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-18.log
- 提交：c02246c0d99a
- 时间：2026-10-27T14:53:29.127Z

### run-19
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-ilM88w/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ilM88w/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"834d9b206b6d27658d4c6f7d30e7084369b42a7c0916d267bb7e0f36df7d9f02","commit":"c02246c0d99aa0152a6489e8840cb838e643bb42"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-lifecycle-truth/logs/run-19.log
- 提交：c02246c0d99a
- 时间：2026-10-27T14:53:30.261Z

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
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 145 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 69 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 164 条用例及经过它的场景 CASE-055, CASE-001。
