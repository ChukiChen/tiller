# 去掉close materialize与closed标记

<!-- tiller-task:v1 {"version":1,"id":"20261027-no-close-materialize","type":"feature","size":"standard","created":"2026-10-27T11:06:36.230Z","base":"db6bf6a01452f3bb1f253f1182c4be841178b7b8","scope":["src","test",".tiller","resources","scripts"],"format":"structured","slug":"no-close-materialize","summary":"去掉close materialize与closed标记","requirementFile":".tiller/specs/modules/workflow/no-close-materialize.md"} -->

## 需求

### 使用场景

post-#44 狗粮仍软：合入/关闭后 `materializeSharedTaskRecord` 把任务树复制到 primary，留下未跟踪 `.tiller/task/<id>/` 挡 `git pull`/快进；同时 close 写入 `.tiller/local/closed/<id>.json` 作为幂等清理标记，增加本机状态面。维护者已确认：MR 合入后本地快进即可读到已跟踪内容，不必再复制；历史靠 Git 合入结果，不再依赖 closed 标记。

### 目标

需求来源：`.tiller/specs/modules/workflow/no-close-materialize.md`

按根因去掉 close/merge 后的共享任务 materialize，并移除 `.tiller/local/closed/` 清理标记的写入与读取；close 只清 worktree 与分支。版本保持 0.5.0。`--requirement` 短目标通道与设计占位手填不改。

### 业务范围

- 做：删除或停用 `materializeSharedTaskRecord` 及其在 close（含 accept 收尾与 abandon）中的调用；删除 `cleanupMarkerPath` / `readCleanupMarker` / `writeCleanupMarker` / `clearCleanupMarker` 与 reopen 中的清除；更新 workflow 设计/usage/decisions；调整依赖 materialize 或 closed 标记的 CASE/测试（含 CASE-057 等）；全量测试与必要 package smoke。
- 不做：升版本；改 `--requirement` 短目标通道；改设计占位须手填；给 `pull` 加“忽略未跟踪”特判；CloudAgent；合入本 PR（由人审阅）；无关重构。
- 假设：合入后 primary 经快进/pull 获得已跟踪任务记录；从未合入就 close 的任务不在 primary 留未跟踪副本，reopen 仅在记录仍可解析时可用（例如已在默认分支跟踪）。

### 关键行为

1. **close/merge 不 materialize**：已验收 close（含 `merge` 自动 close）与 abandon 在清理 worktree 前**不再**把 `.tiller/task/<id>/` 复制到 primary；primary 不因此新增未跟踪任务树。
2. **去掉 closed 标记**：不再读写 `.tiller/local/closed/<id>.json`；重复 close 对已缺失 worktree/local/分支保持幂等（清理路径本身幂等），不依赖该标记；reopen 不再清除该标记。
3. **文档与用例**：usage/design/decisions 与相关 CASE 反映上述行为；测试断言改为「close 后 primary 无因 materialize 产生的未跟踪 task」，并以合入后跟踪记录或显式夹具覆盖 reopen。

### 异常与边界

- 任务记录已在默认分支跟踪：close 不删除跟踪文件；快进/pull 后可读。
- 从未合入仅存在于 worktree 的任务：close 后 primary 无该 task 树属预期；随后 reopen/resume 若找不到记录则按现有 `TASK_NOT_FOUND`（或等价）失败。
- abandon 写入的关闭事实若仅在 worktree 且未合入，随 worktree 清理消失；不为此在 primary 造未跟踪副本。
- `--keep-branch`：仍跳过分支删除；与是否 materialize/closed 标记无关。
- init 基线 close：行为保持（本机清理、不改共享 task），本任务不扩展。

### 验收条件

- AC-1: 已验收 close（含 merge 自动 close）与 abandon 均不把任务树 materialize 到 primary；close 后 primary 不因该路径新增未跟踪 `.tiller/task/<id>/`
- AC-2: close/reopen 路径不再创建、读取或依赖 `.tiller/local/closed/<id>.json`；重复 close 在 worktree 已缺失时仍安全完成清理
- AC-3: 相关 CASE/测试与全量套件通过；版本保持 0.5.0；usage/design/decisions 反映上述行为

## 设计

### 方案

1. **删除 materialize**  
   去掉 `materializeSharedTaskRecord` 及其在 `closeFlow` 已验收收尾与 abandon 两处调用。close/merge 只：读任务 →（abandon 时写关闭段到当前任务检出）→ `cleanupTaskWorktrees` → `cleanupTaskBranches`。不把 `.tiller/task/<id>/` 复制到 primary。

2. **删除 closed 清理标记**  
   删除 `FlowCleanupMarker`、`cleanupMarkerPath`、`readCleanupMarker`、`writeCleanupMarker`、`clearCleanupMarker`；去掉 close 开头的「已有标记则幂等返回」分支与 reopen 中的 `clearCleanupMarker`。重复 close：若任务记录仍可解析且阶段允许，清理路径对缺失 worktree/local/分支本身幂等；若记录已随 worktree 消失且 primary 无跟踪副本，则 `TASK_NOT_FOUND`（可接受）。

3. **文档与测试**  
   更新 `.tiller/specs/modules/workflow/design.md` §关闭、`usage`/CLI 帮助、`decisions` 一条；CASE-057 等改为断言 close 后 primary **无**因 materialize 产生的未跟踪 task；reopen 夹具先把已验收记录落到跟踪树（模拟合入后快进）再 close/reopen；新增 CASE 覆盖「无 closed 标记、重复 close 安全」。

### 失败处理

- abandon 写回失败：不清理 worktree，保持现状。  
- worktree/分支清理失败：只记 warning，不回滚已成功的本机清理；不为此写 closed 标记。  
- 从未合入就 close：primary 无 task 属预期；后续命令找不到记录按现有错误码失败。

### 取舍

- 不保留「关任务往 primary 甩未跟踪副本」兜底。  
- 不用 `.tiller/local/closed/` 做幂等；依赖清理 API 幂等 + Git 跟踪事实。  
- 不改 `--requirement` 短目标；设计占位手填仍为流程要求。

### 影响与风险

- 影响：`src/flow.ts`、workflow design/usage/decisions、依赖 materialize/closed 的测试（如 CASE-057、CASE-283）。  
- 风险：旧脚本若依赖 close 后 primary 立刻有未跟踪 task，会失效——符合「先合入再读」模型。

### 验证入口

- `npm test`（全量）；重点 `test/first-batch.test.mjs`、`test/task-worktrees.test.mjs`、本任务新增 CASE。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T11:06:43.805Z | db6bf6a01452 | 优化吧 |
| 设计 | boon yu | 2026-10-27T11:06:50.531Z | 72b05a9f836c | 优化吧 |
| 交付验收 | boon yu | 2026-10-27T11:27:09.096Z | 1d08bca130c7 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"6ce8305503830e035bc822902cda22e6f6addbf403e3ce25479a8b005165c07e","commit":"db6bf6a01452f3bb1f253f1182c4be841178b7b8","by":"boon yu","quote":"优化吧","at":"2026-10-27T11:06:43.805Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"8a65bf342b06dabe52902da22e8fd182affd441eebbe22b782961a1de52d8b4f","commit":"72b05a9f836cfe1cf50c6750ed1412a9e8109243","by":"boon yu","quote":"优化吧","at":"2026-10-27T11:06:50.531Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"f07b574c1cf829d3f6f21476d4ac5ccf2c21650b09e5e7c3dacd0f692a703031","commit":"1d08bca130c76449a0d4a88a12a6ee812e8f4a39","by":"boon yu","quote":"","at":"2026-10-27T11:27:09.096Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-057 CASE-308 accepted close cleans local state without materializing; reopen after merge simulation$' \u002d\u002dtest-reporter=./.tiller/local/verify-Nzb0OG/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Nzb0OG/report.jsonl test/first-batch.test.mjs","exitCode":0,"tree":"fcc3a758cd23b9a7d763e9c16bafb08e5ccc81444b6728543546d787099ba10e","commit":"351011d846d126aa90fd6c9cdc6c805cf223d882"} -->
- 条件：AC-1
- 测试：test/first-batch.test.mjs::CASE-057 CASE-308 accepted close cleans local state without materializing; reopen after merge simulation
- 用例：CASE-308
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-1.log
- 提交：351011d846d1
- 时间：2026-10-27T11:23:54.519Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-308 abandon does not materialize an untracked task onto primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-AJgATa/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-AJgATa/report.jsonl test/first-batch.test.mjs","exitCode":0,"tree":"fcc3a758cd23b9a7d763e9c16bafb08e5ccc81444b6728543546d787099ba10e","commit":"351011d846d126aa90fd6c9cdc6c805cf223d882"} -->
- 条件：AC-1
- 测试：test/first-batch.test.mjs::CASE-308 abandon does not materialize an untracked task onto primary
- 用例：CASE-308
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-2.log
- 提交：351011d846d1
- 时间：2026-10-27T11:23:54.519Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-283 CASE-309 合入后 close 不改共享 task\\.md、无 closed 标记且重复 close 安全$' \u002d\u002dtest-reporter=./.tiller/local/verify-QTgsl1/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-QTgsl1/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"fcc3a758cd23b9a7d763e9c16bafb08e5ccc81444b6728543546d787099ba10e","commit":"351011d846d126aa90fd6c9cdc6c805cf223d882"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-283 CASE-309 合入后 close 不改共享 task.md、无 closed 标记且重复 close 安全
- 用例：CASE-309
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-3.log
- 提交：351011d846d1
- 时间：2026-10-27T11:24:01.104Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-162 repository keeps the 0\\.5\\.0 release contract and five full verification entries$' \u002d\u002dtest-reporter=./.tiller/local/verify-O64XLt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-O64XLt/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"fcc3a758cd23b9a7d763e9c16bafb08e5ccc81444b6728543546d787099ba10e","commit":"351011d846d126aa90fd6c9cdc6c805cf223d882"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-4.log
- 提交：351011d846d1
- 时间：2026-10-27T11:24:05.655Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-057 CASE-308 accepted close cleans local state without materializing; reopen after merge simulation$' \u002d\u002dtest-reporter=./.tiller/local/verify-fe3mYe/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-fe3mYe/report.jsonl test/first-batch.test.mjs","exitCode":0,"tree":"f3328426012596e9620f2823cf9c1210d71a6d556044cc2c16ed0ad579b227f3","commit":"1d08bca130c76449a0d4a88a12a6ee812e8f4a39"} -->
- 条件：AC-1
- 测试：test/first-batch.test.mjs::CASE-057 CASE-308 accepted close cleans local state without materializing; reopen after merge simulation
- 用例：CASE-308
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-5.log
- 提交：1d08bca130c7
- 时间：2026-10-27T11:26:56.141Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-308 abandon does not materialize an untracked task onto primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-zL6XOE/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-zL6XOE/report.jsonl test/first-batch.test.mjs","exitCode":0,"tree":"f3328426012596e9620f2823cf9c1210d71a6d556044cc2c16ed0ad579b227f3","commit":"1d08bca130c76449a0d4a88a12a6ee812e8f4a39"} -->
- 条件：AC-1
- 测试：test/first-batch.test.mjs::CASE-308 abandon does not materialize an untracked task onto primary
- 用例：CASE-308
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-6.log
- 提交：1d08bca130c7
- 时间：2026-10-27T11:26:56.141Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-283 CASE-309 合入后 close 不改共享 task\\.md、无 closed 标记且重复 close 安全$' \u002d\u002dtest-reporter=./.tiller/local/verify-7vcBZx/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-7vcBZx/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"f3328426012596e9620f2823cf9c1210d71a6d556044cc2c16ed0ad579b227f3","commit":"1d08bca130c76449a0d4a88a12a6ee812e8f4a39"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-283 CASE-309 合入后 close 不改共享 task.md、无 closed 标记且重复 close 安全
- 用例：CASE-309
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-7.log
- 提交：1d08bca130c7
- 时间：2026-10-27T11:27:00.174Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-162 repository keeps the 0\\.5\\.0 release contract and five full verification entries$' \u002d\u002dtest-reporter=./.tiller/local/verify-mGB8UE/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mGB8UE/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"f3328426012596e9620f2823cf9c1210d71a6d556044cc2c16ed0ad579b227f3","commit":"1d08bca130c76449a0d4a88a12a6ee812e8f4a39"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-no-close-materialize/logs/run-8.log
- 提交：1d08bca130c7
- 时间：2026-10-27T11:27:02.150Z

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
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 137 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 69 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 156 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 2 个测试用例（请确认对应功能已删除；详情见 Git diff）。
- 交付验收后任务对象已变化，需要重新验收。
