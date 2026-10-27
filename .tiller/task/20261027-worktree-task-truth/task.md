# worktree 为任务真相与路径解析收敛

<!-- tiller-task:v1 {"version":1,"id":"20261027-worktree-task-truth","type":"feature","size":"standard","created":"2026-10-27T05:11:05.848Z","base":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7","scope":["src","test",".tiller/specs",".tiller/cases","resources"],"format":"structured","slug":"worktree-task-truth","summary":"worktree为任务真相并收敛路径解析"} -->

## 需求

### 使用场景

执行 AI 在任务 worktree 改代码、加 CASE、confirm、verify、pr 时，tiller 仍常默认去 primary 读/写任务记录。#40 已同步 task.md 到 worktree，但双份并存后 `resolveTaskCheckout` 仍优先 primary；`case`/`confirm`/`verify` 等多数命令只用 `path.resolve`，未走统一解析，狗粮被迫 `--path` 或镜像。

### 目标

当 cwd 落在本任务 worktree 时，任务记录读写默认以该 worktree 为准；仅显式 `--path` 或明确主仓操作（push/平台 API/拆树删分支）走 primary。把重复的任务根/`--path`/cwd 解析收敛到一处；不做整仓架构重写。版本保持 0.5.0。

### 业务范围

- 做：统一解析（cwd 在任务 worktree → taskRoot=该树；显式 `--path` 尊重该路径；primary 仅用于推送/平台/清理）；`case`/`confirm`/`verify`/`check`/`accept`/`pr` 及相关读任务命令接入；禁止 worktree 工作时静默写 primary 任务副本；局部收敛重复解析与必要调用点；CASE+测试；文档一句；decisions 按需；稳定 specs 模块说明。
- 不做：升版本；整仓分层重写；改 CASE↔AC 模型；合入本 PR；改 pr 耗时、`--requirement` 单行、删 gitkeep 文案等无关项。
- 假设与待确认：#40 后 start 仍同步 task.md；双份并存时必须以 cwd 侧为真相。

### 关键行为

1. cwd（或 `--path`）指向本任务 worktree 且其中有任务记录时，`case add`/`confirm`/`verify`/`check`/`accept`/`pr`（读任务侧）默认用该 worktree 的 `.tiller/task/<id>/`，无需另加 `--path`、无需手工拷贝。
2. 上述写路径不得在「当前工作在 worktree」时静默落到 primary 任务副本。
3. primary 仍用于远端 push、平台 PR/merge API、拆除 worktree、删除本地/远端任务分支。
4. 任务根/`resolveProjectRoot`/`resolveTaskCheckout`/`--path`/cwd 解析收口到单一模块（或等价单一入口），相关命令经该入口。
5. 显式 `--path` 指向 primary 时可读 primary；任务在所有相关检出均不存在时仍报清晰缺失（兼容既有缺失语义）。

### 异常与边界

- cwd 在 primary、或不在本任务 worktree：保持主仓解析。
- worktree 无 task.md 而 primary 有：cwd 在该任务 worktree 时不以「仅 primary 有」为默认真相；优先只信当前树，失败须可测。
- 不重写无关的 platform-api/doctor 路径。

### 验收条件

- AC-1: 在任务 worktree 根、不带 `--path` 执行 case/confirm/verify（及同类读写真相命令）时，读写的是该 worktree 的任务记录，而非 primary 副本
- AC-2: 当 primary 与 worktree 均有 task.md 且内容可区分时，cwd=worktree 仍以 worktree 为 taskRoot（不再因 primary 存在而抢先）
- AC-3: 在 worktree 工作产生的任务记录写入不会静默出现在 primary 任务目录
- AC-4: 推送/平台 PR/拆树删分支等仍从 primary（或文档化的主仓句柄）执行且主路径可用
- AC-5: 任务根与 `--path`/cwd 解析集中在一处；相关命令经该入口；重复分叉已删或薄封装
- AC-6: 版本保持 0.5.0；全量 build/lint/typecheck/test 与 package smoke 通过；新增 CASE 覆盖 AC-1～5

## 设计

### 方案

1. **解析规则（产品钉死）**：在 `project-root.ts`（或等价单一入口）调整 `resolveTaskCheckout(input, id)`：
   - `primary` = 现有 `resolveProjectRoot(input)`（主仓，供 push/API/清理）。
   - 若 `projectCandidate(input)` 落在本任务 worktree（路径含该任务 local worktree，或与 `taskWorktreePaths(primary,id)` 匹配）且该树存在 `.tiller/task/<id>/task.md`，则 **taskRoot = 该候选树**，即使 primary 也有同名 task.md。
   - 否则若 primary 有记录 → taskRoot=primary；再否则若候选有 → taskRoot=候选；都无则 taskRoot=primary（由上层报缺失）。
   - 显式 `--path` 传入的 input 同样走此规则（指到哪棵树就以哪棵为候选）。
2. **写路径**：`confirmFlow`/`verifyFlow`/`checkFlow`/`acceptFlow`/case 写入/`pr` 读任务侧改为 `resolveTaskCheckout` 的 `taskRoot`；禁止在 taskRoot=worktree 时写 primary 的 `.tiller/task/<id>/`。
3. **主仓句柄**：`pr` 的 push、平台创建、`close`/`merge` 的拆树与删分支继续用 `primary`（保持 #39 resolveTaskCheckout 分工）。
4. **收敛**：删除或薄封装各命令内重复的 `path.resolve(rootInput)`+直接 `readTask` 猜测；新增/强化单测覆盖「双份并存 + cwd=worktree」「写入不落 primary」「primary 操作仍可用」。
5. **规格**：新增 `.tiller/specs/modules/workflow/worktree-task-truth.md`（或写入 workflow requirements/design/decisions 一句），与 usage/rules 必要时一句对齐；受管变更 `upgrade --adopt`。

### 失败处理

- 任务记录缺失：保持清晰错误码（如 TASK_NOT_FOUND），不静默落到错误树。
- 解析/同步失败：不破坏已有 worktree；测试用临时仓覆盖，失败即红。

### 取舍

- 选「cwd/候选 worktree 优先」而非「primary 有则永远 primary」：对齐人在小桌干活的直觉，消除 `--path` 摩擦。
- 选局部收敛解析层，不做整仓分层重写：主路径刚稳，大搬家风险大于收益。
- 不在本任务修 pr 耗时等无关软摩擦。

### 影响与风险

- 影响：`src/project-root.ts`、`flow.ts`（confirm/verify/check/accept/case 相关）、`pr.ts`、`cli.ts` 若有直连、`test/*`、`.tiller/cases`、`.tiller/specs`、可能 `resources`/usage。
- 风险：旧测试假定「总读 primary」需更新；双份内容漂移时以 cwd 为准可能让 primary 副本过期——可接受，或文档说明以 worktree 为准。
- 缓解：CASE 锁定双份可区分场景；全量套件 + package smoke。

### 验证入口

- 新增测试（名含 CASE-293+）覆盖 AC-1～5；更新 CASE-048 等总数断言。
- `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`
- 在本任务 worktree：`node .tiller/run.cjs verify … --criterion AC-n --case CASE-…`；`check`；`accept --by "boon yu"`；`tiller pr`（真实 PR，不 merge）。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T05:11:25.829Z | 6e9538ffc739 | 以当前任务所在worktree为主；包含上面的一起调整 |
| 设计 | boon yu | 2026-10-27T05:11:25.931Z | 6e9538ffc739 | 局部收敛解析层，cwd优先worktree |
| 交付验收 | boon yu | 2026-10-27T05:26:24.105Z | 5ad35c906c03 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"775a9be761702961feb99c45dc6dbba4ee96602d58775ad082ade031b573e362","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7","by":"boon yu","quote":"以当前任务所在worktree为主；包含上面的一起调整","at":"2026-10-27T05:11:25.829Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"c0a60a59a43eb55e2e6872e3b1de7b417dcc3f57f5eac47f1ee01cae1b61a72a","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7","by":"boon yu","quote":"局部收敛解析层，cwd优先worktree","at":"2026-10-27T05:11:25.931Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"3ed7c11b5b31412cb594ac05cadc861a7620ce8e9152bcc2e3850e94bbcbb083","commit":"5ad35c906c03604b9b7109425bbf326067299dd1","by":"boon yu","quote":"","at":"2026-10-27T05:26:24.105Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-BVOgrS/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-BVOgrS/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-1
- 测试：test/worktree-task-root.test.mjs::CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary
- 用例：CASE-293
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-1.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:20.662Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-294 dual task records resolve to cwd worktree and explicit primary stays selectable$' \u002d\u002dtest-reporter=./.tiller/local/verify-QUifuM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-QUifuM/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-2
- 测试：test/worktree-task-root.test.mjs::CASE-294 dual task records resolve to cwd worktree and explicit primary stays selectable
- 用例：CASE-294
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-2.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:22.275Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-NWnEkz/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-NWnEkz/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-3
- 测试：test/worktree-task-root.test.mjs::CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary
- 用例：CASE-295
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-3.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:23.406Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-296 worktree PR push and cleanup keep primary as the main checkout$' \u002d\u002dtest-reporter=./.tiller/local/verify-eZa3Rv/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-eZa3Rv/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-296 worktree PR push and cleanup keep primary as the main checkout
- 用例：CASE-296
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-4.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:25.003Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-297 task-root resolution has one entry used by task commands$' \u002d\u002dtest-reporter=./.tiller/local/verify-bCXEco/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-bCXEco/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-5
- 测试：test/worktree-task-root.test.mjs::CASE-297 task-root resolution has one entry used by task commands
- 用例：CASE-297
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-5.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:27.911Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-241 CASE-245 CASE-252 API 远端操作保持 0\\.5\\.0 且打包模块同步$' \u002d\u002dtest-reporter=./.tiller/local/verify-HqkLTm/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-HqkLTm/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-6
- 测试：test/merge.test.mjs::CASE-241 CASE-245 CASE-252 API 远端操作保持 0.5.0 且打包模块同步
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-6.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:28.415Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-AKj14S/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-AKj14S/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"6e9538ffc739b3d93b9b7ded5ca7040d638f8ab7"} -->
- 条件：AC-6
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-7.log
- 提交：6e9538ffc739
- 时间：2026-10-27T05:23:28.415Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-aDGdf8/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-aDGdf8/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-1
- 测试：test/worktree-task-root.test.mjs::CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary
- 用例：CASE-293
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-8.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:25:50.906Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-294 dual task records resolve to cwd worktree and explicit primary stays selectable$' \u002d\u002dtest-reporter=./.tiller/local/verify-I0lhU4/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I0lhU4/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-2
- 测试：test/worktree-task-root.test.mjs::CASE-294 dual task records resolve to cwd worktree and explicit primary stays selectable
- 用例：CASE-294
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-9.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:25:54.953Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-b4lHnT/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-b4lHnT/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-3
- 测试：test/worktree-task-root.test.mjs::CASE-293 CASE-295 worktree root commands read and write the worktree without mirroring primary
- 用例：CASE-295
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-10.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:25:59.391Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-296 worktree PR push and cleanup keep primary as the main checkout$' \u002d\u002dtest-reporter=./.tiller/local/verify-rCHwRU/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-rCHwRU/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-296 worktree PR push and cleanup keep primary as the main checkout
- 用例：CASE-296
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-11.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:26:05.321Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-297 task-root resolution has one entry used by task commands$' \u002d\u002dtest-reporter=./.tiller/local/verify-9VsLMR/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-9VsLMR/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-5
- 测试：test/worktree-task-root.test.mjs::CASE-297 task-root resolution has one entry used by task commands
- 用例：CASE-297
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-12.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:26:12.477Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-241 CASE-245 CASE-252 API 远端操作保持 0\\.5\\.0 且打包模块同步$' \u002d\u002dtest-reporter=./.tiller/local/verify-Rrqu12/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Rrqu12/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-6
- 测试：test/merge.test.mjs::CASE-241 CASE-245 CASE-252 API 远端操作保持 0.5.0 且打包模块同步
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-13.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:26:15.993Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-6VCk6X/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6VCk6X/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"27b1f33c724c0c2afbdbcfd402be2f34aed8a4cdd360fa6c71865e9e14d627fe","commit":"5ad35c906c03604b9b7109425bbf326067299dd1"} -->
- 条件：AC-6
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-worktree-task-truth/logs/run-14.log
- 提交：5ad35c906c03
- 时间：2026-10-27T05:26:15.993Z

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
- 125 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 146 条用例及经过它的场景 CASE-055, CASE-001。
