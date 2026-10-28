# 去掉旧 launcher 与 runtime bind 兼容

<!-- tiller-task:v1 {"version":1,"id":"20261027-drop-compat","type":"feature","size":"standard","created":"2026-10-27T15:54:33.337Z","base":"92c93b93e9def866bf3d2598934a898ba4ca9f01","scope":["resources","src/runtime.ts","src/cli.ts","src/project-metadata.ts","src/flow.ts","src/core.ts","src/plans.ts","src/pr.ts","src/project-root.ts","src/task-worktrees.ts","scripts/package-smoke.mjs","test",".tiller","AGENTS.md"],"format":"structured"} -->

## 需求

### 使用场景

- 新工程 `tiller init` 后，用户与 AI 只使用 PATH 中的全局/本地 `tiller` CLI。
- 维护者决定不再保留旧 launcher、runtime bind、旧三棵树/closed 标记等跨版本兼容路径。

### 目标

不考虑兼容：删除 `run.cjs` / 旧 launcher、`tiller runtime status|bind` 与 `runtime.json`；收掉 close 对旧三棵树与 `.tiller/local/closed/` 的兼容清理枝，以及不再需要的 legacy 确认/证据解析；受管清单、package-smoke、文档同步；版本保持 0.5.0。

### 业务范围

- 做：从受管资源与包中移除 `run.cjs`；移除或拒绝用户主路径上的 runtime bind/status；清理 flow/close 旧布局兼容代码与相关测试/文档；upgrade/init 不再登记或写出 launcher。
- 不做：改变 worktree 任务真相、tokenized-git、合入证明 tip 绑定、doctor 语义；不顺带修 abandon / doctor ready 软摩擦；不做跨版本迁移工具。
- 假设：已安装工程若仍留有旧 `.tiller/run.cjs` / `runtime.json`，可忽略或由用户手工删除；新产品路径不再依赖它们。

### 关键行为

- AC-1：新 init 不再安装 `.tiller/run.cjs`；包与受管清单不含 `run.cjs`；不存在可用的 runtime bind/status 用户主路径。
- AC-2：close/merge 收尾不再依赖旧三棵树或 `.tiller/local/closed/` 兼容路径；相关文档与测试更新；全量测+package smoke 通过；0.5.0。

### 异常与边界

- 若 CLI 仍收到 `runtime` 子命令：明确报错提示改用 PATH `tiller`，不要静默写 bind。
- 删除受管文件后，upgrade/doctor 不得因缺少旧 launcher 失败。

### 验收条件

- AC-1: 新 init 不再安装 .tiller/run.cjs；包与受管清单不含 run.cjs；不存在可用的 runtime bind/status 用户主路径。
- AC-2: close/merge 收尾不再依赖旧三棵树或 .tiller/local/closed/ 兼容路径；相关文档与测试更新；全量测+package smoke 通过；0.5.0。

## 设计

### 方案

1. 从 `SHARED_RESOURCES` / managedFiles / package 资源中移除 `run.cjs`；删除或停用 `resources/run.cjs`。
2. CLI：`runtime status|bind` 改为拒绝（明确错误）或整命令移除；删掉 `bindRuntime` 主路径与对 launcher digest 的强制校验。
3. flow/close：去掉旧三棵树布局与 `.tiller/local/closed/` 兼容清理；保留当前 worktree-first close。
4. 可选收紧：不再写入/解析无用的 `style: legacy` / `legacyEvidence`（若测试与旧 fixture 依赖则先删测试再删解析）。
5. 更新 usage、AGENTS、package-smoke、CASE/测试；版本保持 0.5.0。

### 失败处理

- 缺旧 launcher 不再视为工程损坏。
- runtime 子命令调用返回明确错误码/文案。

### 取舍

- 一次砍兼容入口，不做双轨迁移期；与「PATH 单一 tiller」产品决策一致。
- 不在本任务改 abandon / ready 语义，避免混包。

### 影响与风险

- 影响：`resources/`、`src/runtime.ts`、`src/cli.ts`、`src/project-metadata.ts`、`src/flow.ts`、`src/core.ts`、smoke/测试/文档。
- 风险：旧 CASE 覆盖 launcher/bind 需改写或删除；已初始化仓库残留 `run.cjs` 无害但不被管理。

### 验证入口

- init 后断言无 `.tiller/run.cjs`、无 runtime.json；`tiller runtime …` 失败。
- `npm test` + `npm run test:package`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-28T00:17:40.854Z | d5c1c0c7ca4b | 既然不保留兼容旧逻辑，就代码与用例一起删掉。 |
| 设计 | boon yu | 2026-10-28T00:17:44.282Z | 916814545dc4 | 既然不保留兼容旧逻辑，就代码与用例一起删掉。 |
| 交付验收 | boon yu | 2026-10-28T00:25:39.037Z | ad0d5b398c62 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"aca806aee96a811b73676f167ad9bb18661ddac06f073a8ba306990c0a8cab3a","commit":"d5c1c0c7ca4b2a31bc7330d58313822e8c664821","by":"boon yu","quote":"既然不保留兼容旧逻辑，就代码与用例一起删掉。","at":"2026-10-28T00:17:40.854Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"b8f4b9a2066d739d0ff341c2b6f2ca672a666fec2aade535c011f39dd15523cc","commit":"916814545dc47ea8e7648d509e5149b8482ac3e6","by":"boon yu","quote":"既然不保留兼容旧逻辑，就代码与用例一起删掉。","at":"2026-10-28T00:17:44.282Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"2e9f967c94a69a885afca2a30b0cc8da740a8ffd88292e69b7fc430244ca3607","commit":"ad0d5b398c627235a07738b1ad5877ce08b76deb","by":"boon yu","quote":"","at":"2026-10-28T00:25:39.037Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-319 initialization and package expose the current 0\\.5\\.0 contract without run\\.cjs$' \u002d\u002dtest-reporter=./.tiller/local/verify-tfkWoe/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-tfkWoe/report.jsonl test/package-contract.test.mjs","exitCode":0,"tree":"e5de1757d0205e4d409bfa9d5579aabba385271e11070fe581493878227ef8d3","commit":"37443aab801e1272640e3ac0c3fcd1cde80be9ee"} -->
- 条件：AC-1
- 测试：test/package-contract.test.mjs::CASE-319 initialization and package expose the current 0.5.0 contract without run.cjs
- 用例：CASE-319
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-drop-compat/logs/run-1.log
- 提交：37443aab801e
- 时间：2026-10-28T00:18:10.877Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-283 CASE-309 合入后 close 不改共享 task\\.md 且重复 close 安全$' \u002d\u002dtest-reporter=./.tiller/local/verify-yAkaKs/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-yAkaKs/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"e5de1757d0205e4d409bfa9d5579aabba385271e11070fe581493878227ef8d3","commit":"37443aab801e1272640e3ac0c3fcd1cde80be9ee"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-283 CASE-309 合入后 close 不改共享 task.md 且重复 close 安全
- 用例：CASE-283, CASE-309
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-drop-compat/logs/run-2.log
- 提交：37443aab801e
- 时间：2026-10-28T00:18:14.607Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-319 initialization and package expose the current 0\\.5\\.0 contract without run\\.cjs$' \u002d\u002dtest-reporter=./.tiller/local/verify-e8ww4P/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-e8ww4P/report.jsonl test/package-contract.test.mjs","exitCode":0,"tree":"cb70a77bce523aee0fa9dca969a83eab87defff72d73e4a2dec8ff614ecfa974","commit":"ad0d5b398c627235a07738b1ad5877ce08b76deb"} -->
- 条件：AC-1
- 测试：test/package-contract.test.mjs::CASE-319 initialization and package expose the current 0.5.0 contract without run.cjs
- 用例：CASE-319
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-drop-compat/logs/run-3.log
- 提交：ad0d5b398c62
- 时间：2026-10-28T00:25:27.143Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-283 CASE-309 合入后 close 不改共享 task\\.md 且重复 close 安全$' \u002d\u002dtest-reporter=./.tiller/local/verify-BAwkVw/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-BAwkVw/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"cb70a77bce523aee0fa9dca969a83eab87defff72d73e4a2dec8ff614ecfa974","commit":"ad0d5b398c627235a07738b1ad5877ce08b76deb"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-283 CASE-309 合入后 close 不改共享 task.md 且重复 close 安全
- 用例：CASE-283, CASE-309
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-drop-compat/logs/run-4.log
- 提交：ad0d5b398c62
- 时间：2026-10-28T00:25:27.865Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-296 worktree PR push and cleanup keep primary as the main checkout$' \u002d\u002dtest-reporter=./.tiller/local/verify-rbMiew/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-rbMiew/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"cb70a77bce523aee0fa9dca969a83eab87defff72d73e4a2dec8ff614ecfa974","commit":"ad0d5b398c627235a07738b1ad5877ce08b76deb"} -->
- 条件：AC-2
- 测试：test/pr.test.mjs::CASE-296 worktree PR push and cleanup keep primary as the main checkout
- 用例：CASE-296
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-drop-compat/logs/run-5.log
- 提交：ad0d5b398c62
- 时间：2026-10-28T00:25:29.737Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
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
- 167 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 129 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 53 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 159 条用例及经过它的场景 CASE-055, CASE-001。
- 删除 2 个测试文件（请确认对应功能已删除；详情见 Git diff）。
- 修改的测试文件移除了 9 个测试用例（请确认对应功能已删除；详情见 Git diff）。
- 交付验收后任务对象已变化，需要重新验收。
