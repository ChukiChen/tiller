# 初始化合入证明绑定本次 head

<!-- tiller-task:v1 {"version":1,"id":"20261028-init-proof-head","type":"feature","size":"standard","created":"2026-10-28T12:05:31.601Z","base":"eb5d5c1f864736e053ce227efca27b7f38c1c065","scope":["src","test",".tiller/specs",".tiller/rules",".tiller/cases",".tiller/usage.md",".tiller/project.json","resources/rules","resources/usage.md"],"format":"structured","slug":"init-proof-head","summary":"平台证明须匹配 expected head"} -->

## 需求

### 使用场景

- wipe 或同日多次 `tiller init` 后，GitHub/GitLab 上仍可能留下同分支（`chore/tiller-init`）、同 task-id 标题的历史已合入 PR/MR。
- 操作者在新的 init 尚未合入时运行 `status` / `doctor` / `close` / `start`，系统必须把「这一次」未合入的 tip 判为 pending，而不是把旧 merged PR 当成证明。
- 维护者阅读受管 rules 时，措辞应与 tip SHA + 平台 PR + local/CLI effective 一致，不再暗示往 tracked `project.json` 写回 `merged`。

### 目标

合入证明绑定本次 init 的 expected head（必要时含 open PR 编号）；消除同日重初始化假绿；补齐可本地跑的 mock 负向契约测；统一受管 rules 的 effective 措辞。

### 业务范围

- 做：
  - 平台回查：仅当已合入 PR/MR 的 `head.sha` 等于本次 init expected head 时记 `merged`；同分支、同 task-id、标题匹配但 head 不同 → `pending`。
  - `close` / `start` / `doctor` / `status` 的 init 证明共用同一匹配规则。
  - 合入前 `close <init-id>`：无匹配证明则失败（不得 exit 0），并保留 worktree、本地/远端 init 分支与 open PR。
  - 在 `.tiller/local/<init-id>/` 持久化本次 expected head 与/或 open PR；同日 re-init 清掉或重写旧 merged marker，禁止复用。
  - 增加 mock 平台列表的负向契约测（历史 merged + 新 head → pending；pre-merge close 失败）。
  - 更新受管 rules（至少 `core.md`、`activities/delivery.md`）去掉「写回 merged」旧双层表达，改为 tip/平台 PR + local marker + CLI effective。
  - 同步 initialization/workflow 相关 specs、CASE/invariants。
- 不做：
  - 不恢复 git tag / `headRef` / tracked `initBaseline.status`。
  - 不为旧松散匹配（只比 branch+标题）保留兼容分支。
  - 不在本任务合入产品 PR；只开 PR。
- 假设与待确认：机制已由 boon yu 确认（expected head 绑定；不兼容旧松散匹配）。

### 关键行为

- 新 init 创建后，即便平台存在同分支历史 merged PR，`initBaselineStatus` / doctor init-baseline 仍为 pending，detail 不得引用错误 tip。
- 仅当平台 merged PR 的 head 与本次 expected head 一致（或祖先证明成立）时记合入，并可写入 local merged marker。
- 合入前 close：失败且不删 worktree/分支；合入后 close：仍按现有成功清理（含 logsRemoved）。
- 同日再次 init：新 expected head 生效，旧 marker 不可放行新 tip。
- `npm test` 含上述 mock 负向用例；rules 文案无「写回 merged」指向 tracked 元信息。

### 异常与边界

- 无 token / API 失败：仍阻断为 pending（与现契约一致），不得因历史 PR 误放行。
- expected head 缺失：不得用「任意同分支 merged」兜底。
- 真实 head 与 open PR 并存时以 head 匹配为准；PR 编号可作为辅助记录。
- 未满足任一 AC 不得 accept。

### 验收条件

- AC-1: 平台回查仅当 merged PR/MR 的 head.sha 等于本次 init expected head 时记为合入；同分支同 task-id 但 head 不同必须 pending
- AC-2: 合入前 close init-id 在无匹配证明时失败且保留 worktree、任务分支与 open PR
- AC-3: 本机 local 记录本次 expected head/open PR；同日 re-init 不得复用旧 merged marker
- AC-4: 补 mock 负向契约测；受管 rules 去掉写回 merged 旧措辞，改为 tip/平台 PR + local/CLI effective

## 设计

### 方案

1. **Expected head 来源**：init 推送/开 PR 后，将当前 tip（及可选 PR number）写入 `.tiller/local/<init-id>/`（例如 proof/expected 记录）；tracked `project.json` 仍只保留 id/branch/commit。
2. **平台匹配**：查询同分支已合入 PR/MR 时，必须 `head.sha === expectedHead`（或明确约定的等价规范化比较）；仅 branch + 标题/task-id 命中不足。不匹配 → pending。
3. **共享 prove 入口**：`status`/`doctor`/`close`/`start` 的 init 证明均走同一函数，避免出口分叉。
4. **close 门禁**：init close 在 prove 非 merged 时抛既有/明确错误码并 return non-zero；禁止删 worktree/远端分支。
5. **re-init**：再次 init 同 id 时覆盖 expected head，删除或失效旧 merged marker。
6. **测试**：mock 平台返回「历史 merged（旧 sha）+ 当前 open（新 sha）」；断言 pending 与 close 失败。扫 rules 文案的轻量断言可放 test 或 CASE。
7. **docs**：specs + managed rules 同步；不考虑旧松散匹配兼容层。

### 失败处理

- 证明不足：CLI JSON `ok:false`，保留本机状态，提示合入当前 PR 后再 close。
- API/token 错误：按现有失败路径，不降级为「历史 PR 已合入」。

### 取舍

- 选「强制 head 相等」而非「同 branch 最新 merged」：后者仍会误认同日旧 tip。
- 不把 expected head 写进 tracked project.json：保持 #52 契约（tracked 无 status/headRef）；本机 local 足够支撑 prove。
- 不做完整 wipe e2e 替代 mock：mock 保证每次 CI 覆盖；wipe fullflow 仍作发版/合入后闸。

### 影响与风险

- 影响：`src` 中 init-baseline/prove/close/start/doctor、受管 rules、initialization specs、相关测试。
- 风险：过严匹配导致真合入后仍 pending——缓解：合入后 tip 进入默认分支祖先证明仍可用；marker 在正确 head 合入后写入。
- 无旧兼容：刻意打破「只比 branch+标题」的假绿路径。

### 验证入口

- 全量 `npm test`（含新增 mock 负向）。
- `tiller verify` 覆盖 AC-1～AC-4；`check` → `accept --by "boon yu"` → `pr`（不开 merge）。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-28T12:35:59.047Z | ce4584876658 | — |
| 设计 | boon yu | 2026-10-28T12:35:59.166Z | 06ebe86a8cf7 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"bd56db5616e12878941ca5a8028916bc3d30ed7e98530d0b82b3a9b1d9150bed","commit":"ce45848766580084d6e2797ccf70348385cc9078","by":"boon yu","quote":"","at":"2026-10-28T12:35:59.047Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"9e91e8b2037cb56fa4fef65fe7c5e1d86b373193a8254a70b3b03f86f15f8486","commit":"06ebe86a8cf71f3ce91e06644cec3d48851e9d5c","by":"boon yu","quote":"","at":"2026-10-28T12:35:59.166Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-iSlkzZ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-iSlkzZ/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"dac5be30300a09c6dede9438ab22e9c46472cbd10dd7263516fcff04432dd7d3","commit":"2289f57ccac28681b1e1e3c7af16970ee7426e01"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge
- 用例：CASE-332
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-1.log
- 提交：2289f57ccac2
- 时间：2026-10-28T12:34:45.804Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-SqvJ4G/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-SqvJ4G/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"dac5be30300a09c6dede9438ab22e9c46472cbd10dd7263516fcff04432dd7d3","commit":"2289f57ccac28681b1e1e3c7af16970ee7426e01"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge
- 用例：CASE-332
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-2.log
- 提交：2289f57ccac2
- 时间：2026-10-28T12:34:47.554Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-331 CASE-333 same-day reinitialization records the new expected head and discards old proof$' \u002d\u002dtest-reporter=./.tiller/local/verify-eak7tl/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-eak7tl/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"dac5be30300a09c6dede9438ab22e9c46472cbd10dd7263516fcff04432dd7d3","commit":"2289f57ccac28681b1e1e3c7af16970ee7426e01"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-331 CASE-333 same-day reinitialization records the new expected head and discards old proof
- 用例：CASE-333
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-3.log
- 提交：2289f57ccac2
- 时间：2026-10-28T12:34:49.379Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-NEQcxS/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-NEQcxS/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"dac5be30300a09c6dede9438ab22e9c46472cbd10dd7263516fcff04432dd7d3","commit":"2289f57ccac28681b1e1e3c7af16970ee7426e01"} -->
- 条件：AC-4
- 测试：test/init-baseline.test.mjs::CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge
- 用例：CASE-332
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-4.log
- 提交：2289f57ccac2
- 时间：2026-10-28T12:34:54.527Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-334 managed rules describe expected tip, platform PR and local/CLI effective without writing merged$' \u002d\u002dtest-reporter=./.tiller/local/verify-i9PjpW/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-i9PjpW/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"dac5be30300a09c6dede9438ab22e9c46472cbd10dd7263516fcff04432dd7d3","commit":"2289f57ccac28681b1e1e3c7af16970ee7426e01"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-334 managed rules describe expected tip, platform PR and local/CLI effective without writing merged
- 用例：CASE-334
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-5.log
- 提交：2289f57ccac2
- 时间：2026-10-28T12:34:56.126Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-eBt7VY/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-eBt7VY/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e632d3994c145f06d7b2282bf6f528fea48b2da4a04ec91f7f46b7089df9b335","commit":"6d24bf504f4e8b8978579fb56487fbd57f71c9e3"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge
- 用例：CASE-332
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-6.log
- 提交：6d24bf504f4e
- 时间：2026-10-28T12:36:02.682Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-u3AlCl/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-u3AlCl/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e632d3994c145f06d7b2282bf6f528fea48b2da4a04ec91f7f46b7089df9b335","commit":"6d24bf504f4e8b8978579fb56487fbd57f71c9e3"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge
- 用例：CASE-332
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-7.log
- 提交：6d24bf504f4e
- 时间：2026-10-28T12:36:04.207Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-331 CASE-333 same-day reinitialization records the new expected head and discards old proof$' \u002d\u002dtest-reporter=./.tiller/local/verify-JnFN0k/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-JnFN0k/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e632d3994c145f06d7b2282bf6f528fea48b2da4a04ec91f7f46b7089df9b335","commit":"6d24bf504f4e8b8978579fb56487fbd57f71c9e3"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-331 CASE-333 same-day reinitialization records the new expected head and discards old proof
- 用例：CASE-333
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-8.log
- 提交：6d24bf504f4e
- 时间：2026-10-28T12:36:05.728Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-Z66zUM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Z66zUM/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e632d3994c145f06d7b2282bf6f528fea48b2da4a04ec91f7f46b7089df9b335","commit":"6d24bf504f4e8b8978579fb56487fbd57f71c9e3"} -->
- 条件：AC-4
- 测试：test/init-baseline.test.mjs::CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge
- 用例：CASE-332
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-9.log
- 提交：6d24bf504f4e
- 时间：2026-10-28T12:36:06.894Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-334 managed rules describe expected tip, platform PR and local/CLI effective without writing merged$' \u002d\u002dtest-reporter=./.tiller/local/verify-aZgRjH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-aZgRjH/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"e632d3994c145f06d7b2282bf6f528fea48b2da4a04ec91f7f46b7089df9b335","commit":"6d24bf504f4e8b8978579fb56487fbd57f71c9e3"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-334 managed rules describe expected tip, platform PR and local/CLI effective without writing merged
- 用例：CASE-334
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-proof-head/logs/run-10.log
- 提交：6d24bf504f4e
- 时间：2026-10-28T12:36:08.460Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 改动超出范围：.tiller/project.json、.tiller/usage.md、resources/rules/activities/delivery.md、resources/rules/core.md、resources/usage.md、STEER-CONFIRMER.txt

提示：
- 167 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 144 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 61 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例；建议同时回归经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 166 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 需求“业务范围·做”包含交付路径 `.tiller/local/<init-id>/`；业务范围应写约束，交付路径请只记录在任务范围（--target）：`.tiller/task/20261028-init-proof-head/task.md`。
- 需求“业务范围·做”包含交付路径 `activities/delivery.md`；业务范围应写约束，交付路径请只记录在任务范围（--target）：`.tiller/task/20261028-init-proof-head/task.md`。
- 修改的测试文件移除了 2 个测试用例（请确认对应功能已删除；详情见 Git diff）。
