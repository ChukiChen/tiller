# 本机 local 按任务聚合与 close 清旁路

<!-- tiller-task:v1 {"version":1,"id":"20261026-local-task-layout","type":"feature","size":"standard","created":"2026-10-26T02:41:17.364Z","base":"edf6a24c0722790e557e2e4ebc3a802b5d406568","scope":["src","test","resources",".tiller","README.md","AGENTS.md"],"format":"structured","plan":"20261026-local-task-layout","item":"P-1","slug":"local-task-layout","summary":"local 按 task-id 聚合且 close 清旁路","requirementFile":".tiller/local/20261026-local-task-layout-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 与演示工程的人。现状 `.tiller/local` 按类型拆成 `worktrees/<id>`、`logs/<id>`、`tasks/<id>` 三棵树，目录深且分散；`close`/`abandon` 只拆 worktree、清日志，并只删 `worktrees.json` 文件，旁路目录 `tasks/<id>/`（含 `pre-existing.json`）常残留。用户已确认：close 须清该任务旁路；布局改为以 task id 为根聚合；不引入平级 `.tiller-local`。

### 目标

需求来源：`.tiller/local/20261026-local-task-layout-req.md`

新任务本机目录改为 `.tiller/local/<task-id>/` 聚合 worktrees、logs 与旁路文件；`close`/`abandon` 拆除 worktree 后删除整个该任务本机目录（含旁路）。读路径对旧布局做兼容回退；写路径只写新布局。同步 docs/specs/tests。

### 业务范围

- 做：task-id-first 布局；project 与 workspace（保留 management + repositories/<id>）；close/abandon 清 worktrees+logs+sidecar 整目录；旧路径 close 兼容；usage/rules/workflow specs/decisions；用例与测试。
- 不做：不引入 `.tiller-local`；不改版本号；不自动 merge；不强制 migrate 已存在旧目录上的进行中任务（仅 close 兼容清理）；不改 reopen 自动重建。
- 假设与待确认：任务编号仍为 `YYYYMMDD-…`，不会与保留名 `logs`/`tasks`/`worktrees`/`runtime.json` 冲突；共享 task.md/specs 仍在主检出 `.tiller/`。

### 关键行为

1. project：`start` 后检出在 `.tiller/local/<id>/worktrees/`；旁路 `pre-existing.json`、`worktrees.json` 与 `logs/` 同级位于 `.tiller/local/<id>/`。
2. workspace：`.tiller/local/<id>/worktrees/management` + `.tiller/local/<id>/worktrees/<登记相对路径>`（常见 `repositories/<repo-id>`）。
3. `close`/`abandon` 后 `.tiller/local/<id>/` 整体不存在（幂等）；旧布局 `.tiller/local/worktrees|logs|tasks/<id>/` 亦被清理。
4. 新写入不再创建旧三棵树下的任务子目录。

### 异常与边界

- 旧进行中任务仍可能落在旧路径：close/abandon 须兼容拆除与清理，不得仅因缺新路径失败。
- close 时 worktree/日志/旁路部分缺失：幂等成功。
- start 目标路径已占用：失败且不留半套新任务目录。
- 不删除其他任务的 `.tiller/local/<other-id>/` 或旧布局旁路。

### 验收条件

- AC-1: project 模式下 start 在 .tiller/local/<任务编号>/worktrees/ 创建 git worktree；pre-existing.json、worktrees.json 与 logs/ 位于同一任务目录 .tiller/local/<任务编号>/；不再写入旧路径 .tiller/local/worktrees|tasks|logs/<id>/
- AC-2: workspace 模式下 start 在 .tiller/local/<id>/worktrees/management 与 .tiller/local/<id>/worktrees/<登记相对路径>（常见 repositories/<repo-id>）创建隔离检出；各仓同一任务分支名
- AC-3: close 与 abandon 拆除该任务全部 worktree 后删除整棵 .tiller/local/<id>/（含 logs 与旁路）；并对旧布局 .tiller/local/worktrees|logs|tasks/<id>/ 做兼容清理；缺失则幂等；不删其他任务本机目录
- AC-4: usage/rules/workflow specs/decisions 与设计写明新布局与生命周期；测试覆盖 project/workspace/新布局 close/旧布局 close；用例自 CASE-209 起

## 规划

- 规划：20261026-local-task-layout
- 条目：P-1

## 设计

### 方案

1. **任务本机根**：引入 `taskLocalRoot(id) = .tiller/local/<id>`。其下固定：
   - `worktrees/`：git worktree 容器
   - `logs/`：verify 日志
   - `pre-existing.json`、`worktrees.json`：旁路
2. **project**：检出路径 = `.tiller/local/<id>/worktrees/`（目录本身即 worktree 根）。
3. **workspace**：`.tiller/local/<id>/worktrees/management`；各业务仓 `.tiller/local/<id>/worktrees/<repository.path>`（常见 `repositories/<repo-id>`）。分支名仍 `类型/任务编号[-描述]`。
4. **写路径只写新布局**：`createTaskWorktrees` / `writeTaskWorktreeState` / pre-existing / verify 日志全部改用新根；不再创建 `.tiller/local/worktrees|tasks|logs/<id>/`。
5. **读与 close 兼容**：读 sidecar 时先新后旧；`cleanupTaskWorktrees` 先按清单/约定拆 git worktree（新根 + 旧根回退），再删除 `.tiller/local/<id>/` 整树，并 best-effort 删除旧三路径 `.tiller/local/{worktrees,logs,tasks}/<id>/`。
6. **`TaskWorktreeState.root`**：改为新 worktree 容器路径（`.tiller/local/<id>/worktrees`）；parse 时同时接受旧 root 以便清理旧清单。
7. **文档**：更新 usage、rules（core/delivery/documents/verification）、workflow requirements/design、decisions 一条；版本保持 0.5.0。

### 失败处理

- start 中途失败：回滚已建 worktree，并删除已创建的 `.tiller/local/<id>/`（若为空或仅本任务产物）。
- close 拆树失败：强制删目录并 warnings，不阻断关闭态写入（与现策略一致）。
- 路径必须落在 `.tiller/local/<id>/` 下，经安全路径校验；禁止删除 `local` 根或其他任务目录。

### 取舍

- 保留 `.tiller/local` 前缀，不建平级 `.tiller-local`（迁移成本高、收益主要是命名审美）。
- 以 task-id 为第一层，而不是继续按类型分叉，便于 close 一次清干净。
- 旧布局只做 close/读兼容，不做自动搬迁进行中任务（避免半迁移）。
- 继续保留 workspace 的 management worktree。

### 影响与风险

- 影响：`src/task-worktrees.ts`、`src/flow.ts`（pre-existing 与 logs 路径）、相关测试与受管文档。
- 风险：旧测试硬编码旧路径；进行中旧任务 close 漏清；`local` 下保留名与任务 id 冲突（任务 id 格式已规避）。
- 缓解：CASE-209+ 覆盖新写与旧清；全量 npm test；文档写明新旧对照。

### 验证入口

- `case add` 自 CASE-209；扩展 `test/task-worktrees.test.mjs`（及 pre-existing/日志相关断言）；结束全量 `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T02:41:34.213Z | edf6a24c0722 | 那就按刚才的讨论增加清理并优化目录 |
| 设计 | boon yu | 2026-10-26T02:41:34.313Z | edf6a24c0722 | 那就按刚才的讨论增加清理并优化目录 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"88e663fef0cb20cbc9e2a0f495f296d98d74df50d2a05cc81e14996525468872","commit":"edf6a24c0722790e557e2e4ebc3a802b5d406568","by":"boon yu","quote":"那就按刚才的讨论增加清理并优化目录","at":"2026-10-26T02:41:34.213Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"71a8fe0356591fb195863f6157ebaa39561c84448f23ba22b9d5d8eb80fcc7ae","commit":"edf6a24c0722790e557e2e4ebc3a802b5d406568","by":"boon yu","quote":"那就按刚才的讨论增加清理并优化目录","at":"2026-10-26T02:41:34.313Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-196 CASE-209 project start creates a task-local worktree, sidecars and logs in one directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-8KGtFi/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-8KGtFi/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-196 CASE-209 project start creates a task-local worktree, sidecars and logs in one directory
- 用例：CASE-209
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261026-local-task-layout/run-1.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:16.818Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-197 CASE-210 workspace start keeps management and registered repositories under the task worktree root$' \u002d\u002dtest-reporter=./.tiller/local/verify-Ce70LQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Ce70LQ/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-197 CASE-210 workspace start keeps management and registered repositories under the task worktree root
- 用例：CASE-210
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261026-local-task-layout/run-2.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:17.758Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks$' \u002d\u002dtest-reporter=./.tiller/local/verify-CCduU3/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-CCduU3/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks
- 用例：CASE-211
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261026-local-task-layout/run-3.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:18.763Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths$' \u002d\u002dtest-reporter=./.tiller/local/verify-7otVYj/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-7otVYj/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths
- 用例：CASE-212
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261026-local-task-layout/run-4.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:20.541Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-096 CASE-181 CASE-213 verify writes a readable command summary and verbose log in the task-local directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-Coxewl/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Coxewl/report.jsonl test/verification-integrity.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-1
- 测试：test/verification-integrity.test.mjs::CASE-096 CASE-181 CASE-213 verify writes a readable command summary and verbose log in the task-local directory
- 用例：CASE-213
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261026-local-task-layout/run-5.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:22.368Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path$' \u002d\u002dtest-reporter=./.tiller/local/verify-W9XfcQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-W9XfcQ/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path
- 用例：CASE-214
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261026-local-task-layout/run-6.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:23.388Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-196 CASE-209 project start creates a task-local worktree, sidecars and logs in one directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-rGCVTI/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-rGCVTI/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-196 CASE-209 project start creates a task-local worktree, sidecars and logs in one directory
- 用例：CASE-209
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-7.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:47.249Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-197 CASE-210 workspace start keeps management and registered repositories under the task worktree root$' \u002d\u002dtest-reporter=./.tiller/local/verify-7ae4MC/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-7ae4MC/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-197 CASE-210 workspace start keeps management and registered repositories under the task worktree root
- 用例：CASE-210
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-8.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:48.150Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks$' \u002d\u002dtest-reporter=./.tiller/local/verify-5g2jSM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-5g2jSM/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks
- 用例：CASE-211
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-9.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:49.070Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths$' \u002d\u002dtest-reporter=./.tiller/local/verify-mr66kr/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mr66kr/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths
- 用例：CASE-212
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-10.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:50.707Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-096 CASE-181 CASE-213 verify writes a readable command summary and verbose log in the task-local directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-FIjSQO/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-FIjSQO/report.jsonl test/verification-integrity.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-1
- 测试：test/verification-integrity.test.mjs::CASE-096 CASE-181 CASE-213 verify writes a readable command summary and verbose log in the task-local directory
- 用例：CASE-213
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-11.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:52.366Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path$' \u002d\u002dtest-reporter=./.tiller/local/verify-XcPAkk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-XcPAkk/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"c4e6fb9fbb41957ea0e0d09ad1af3c870cb28a151f6d978901b5ae39cdd898c2","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path
- 用例：CASE-214
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-12.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:57:53.323Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-215 docs describe task-local layout and close cleanup lifecycle$' \u002d\u002dtest-reporter=./.tiller/local/verify-3sRlIq/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-3sRlIq/report.jsonl test/usage-resources.test.mjs","exitCode":0,"tree":"2e2a5c9585a6c3abdb493642db64baee741a01d8a04f94432974d531d85b6849","commit":"c953a6e81d0cf93745ae0e7d01b9a4d975e4fbc9"} -->
- 条件：AC-4
- 测试：test/usage-resources.test.mjs::CASE-215 docs describe task-local layout and close cleanup lifecycle
- 用例：CASE-215
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-13.log
- 提交：c953a6e81d0c
- 时间：2026-10-26T02:58:39.421Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-196 CASE-209 project start creates a task-local worktree, sidecars and logs in one directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-rqOl9D/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-rqOl9D/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-196 CASE-209 project start creates a task-local worktree, sidecars and logs in one directory
- 用例：CASE-209
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-14.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:11.063Z

### run-15
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-197 CASE-210 workspace start keeps management and registered repositories under the task worktree root$' \u002d\u002dtest-reporter=./.tiller/local/verify-e0Hhg7/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-e0Hhg7/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-197 CASE-210 workspace start keeps management and registered repositories under the task worktree root
- 用例：CASE-210
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-15.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:12.001Z

### run-16
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks$' \u002d\u002dtest-reporter=./.tiller/local/verify-VvPEoN/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-VvPEoN/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks
- 用例：CASE-211
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-16.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:12.971Z

### run-17
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths$' \u002d\u002dtest-reporter=./.tiller/local/verify-X3IJLz/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-X3IJLz/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths
- 用例：CASE-212
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-17.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:14.733Z

### run-18
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-096 CASE-181 CASE-213 verify writes a readable command summary and verbose log in the task-local directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-Q3Clmg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Q3Clmg/report.jsonl test/verification-integrity.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-1
- 测试：test/verification-integrity.test.mjs::CASE-096 CASE-181 CASE-213 verify writes a readable command summary and verbose log in the task-local directory
- 用例：CASE-213
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-18.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:16.524Z

### run-19
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path$' \u002d\u002dtest-reporter=./.tiller/local/verify-e0AOIy/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-e0AOIy/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path
- 用例：CASE-214
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-19.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:17.522Z

### run-20
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-215 docs describe task-local layout and close cleanup lifecycle$' \u002d\u002dtest-reporter=./.tiller/local/verify-OptARH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-OptARH/report.jsonl test/usage-resources.test.mjs","exitCode":0,"tree":"06267f8ea2cc05b1ef0fa97578a96b066f92283f5010b80b5b53a82426a62da2","commit":"5c74d67317d38e279fb2f8e4f53d4035450677a3"} -->
- 条件：AC-4
- 测试：test/usage-resources.test.mjs::CASE-215 docs describe task-local layout and close cleanup lifecycle
- 用例：CASE-215
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-local-task-layout/logs/run-20.log
- 提交：5c74d67317d3
- 时间：2026-10-26T02:59:18.459Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- AC-1 的用例 CASE-213：AC-1 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-1 的用例 CASE-209：AC-1 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-1 的用例 CASE-214：AC-1 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-1 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-2 的用例 CASE-210：AC-2 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-2 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-3 的用例 CASE-211：AC-3 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-3 的用例 CASE-212：AC-3 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-3 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-4 的用例 CASE-215：AC-4 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-4 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- 改动超出范围：node_modules

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 59 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 23 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 91 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 5 个测试用例（请确认对应功能已删除；详情见 Git diff）。
