# 狗粮卫生六项

<!-- tiller-task:v1 {"version":1,"id":"20261027-dogfood-hygiene","type":"feature","size":"standard","created":"2026-10-27T03:19:32.491Z","base":"27f7d619b5fc071bc2782a9340872734672e7f21","scope":["src","test",".tiller/specs",".tiller/cases",".tiller/rules",".tiller/task",".tiller/project.json","resources"],"format":"structured","slug":"dogfood-hygiene","summary":"修 start/doctor/init/pr/close/gitkeep 软摩擦"} -->

## 需求

### 使用场景

合入流程稳定执行（#39）后，在 tiller-test-single 上 wipe+全流程狗粮仍有六处软摩擦：start 后 worktree 缺 task.md；init squash 后 doctor 红到下一次 start；init 在 main 留未跟踪受管文件；pr 成功默认 markdown 不便脚本；tiller 仓 close 对已删远端仍刷 422 警告；脚手架漏 gitkeep 多一次 main 提交。维护者与执行 AI 需要这些路径在无人工补丁时也能干净走通。

### 目标

一次性收齐六项卫生，使 post-#39 狗粮路径无需手工拷贝、hard reset、二次 main 提交或忍受误导警告；版本保持 0.5.0。稳定规格见 `.tiller/specs/modules/workflow/dogfood-hygiene.md`。

### 业务范围

- 做：start 后任务记录对 worktree 可用；doctor/close/init 对已合入基线与已删远端安静正确；init 不在默认分支 cwd 留脏的未跟踪受管残留（或安全自动清理）；pr 对人友好且对机器可解析；init/骨架为需保留的空目录带上必要 gitkeep；CASE+测试+文档一句；decisions 按需补记。
- 不做：升版本；CloudAgent；改 CASE↔AC 关联模型；合入本 PR（由人审阅）；扩大到与六项无关的重构。
- 假设与待确认：token 仍为 GITHUB_TOKEN/GH_TOKEN 或 GITLAB_TOKEN/GL_TOKEN；网页 squash 后分支常已被平台删除。

### 关键行为

1. start：创建任务 worktree 后，任务记录（至少 `.tiller/task/<id>/task.md` 及开工所需旁路）在 worktree 内立即可用，无需从 primary 手工拷贝。
2. doctor：初始化基线在平台已 squash/合入后应判定通过（祖先、status=merged、或与 start 同等的 API 合入证明）；不必等到下一次 start 才变绿。close init-id 在能证明已合入时应写回 merged（若尚未写）。
3. init：受管文件写入与提交以初始化 worktree/基线分支为准；默认分支 cwd 不留下需 hard reset 才能 pull 的未跟踪受管残留（保留 project.json 基线元信息所需的最小例外须文档化且可测）。
4. pr：成功创建真实 PR/MR 后，在保持人类可读的同时提供机器友好输出（`--json` 稳定字段必含 url/number/branch/title 等；非 TTY 默认可走 JSON 或等价稳定结构）；`--draft-only` 行为保持不联网。
5. close/merge 删远端：分支已不存在或平台返回 404/422/“does not exist” 等视为已清理，不进 warnings；与文档「安静处理」一致。
6. init/骨架：SHARED_RESOURCES 与初始化提交所含空目录保留所需 `.gitkeep`；对狗粮常见的空 `src/`、`test/`（若工程已存在这些空目录或骨架会创建它们），在同一次初始化变更中带上 `.gitkeep`，避免 wipe+fullflow 再追加一次仅含 gitkeep 的 main 提交。

### 异常与边界

- 缺 token 时 doctor/close 不能凭空标 merged；无合入证明时 init-baseline 仍 fail。
- init 清理仅删除本次写入且内容匹配的未跟踪受管文件，不 `git clean -fd` 误删用户文件。
- pr：TTY 保持人类可读；脚本/非 TTY/`--json` 可解析；`--draft-only` 不推送、不调创建 API。
- 远端删除：非「不存在」类失败仍记 warning，不回滚已合入结果。
- 空目录 gitkeep：不覆盖已有非空内容；无 src/test 目录时不强造业务骨架，仅在目录已存在且为空时补 keep。

### 验收条件

- AC-1: start 完成后任务 worktree 内存在可读的 .tiller/task/<id>/task.md（及开工旁路若有），无需从 primary 手工拷贝即可在 worktree 继续 case/confirm
- AC-2: 初始化基线经 squash/合入后，doctor 的 init-baseline 检查通过（不依赖下一次 start）；能证明合入时 close init-id 写回 status=merged
- AC-3: 首次 init 成功后，默认分支工作区对受管文件无未跟踪残留（或仅有文档化的最小例外），无需 hard reset 即可与远端同步
- AC-4: tiller pr 成功时机器可解析稳定字段（--json 与/或非 TTY 默认）；人类 TTY 仍可读；--draft-only 不联网且输出可用
- AC-5: 删除已不存在的远端任务分支（404/422/不存在语义）时 close/merge 不产生 warnings，并视为已清理
- AC-6: init/骨架在同一变更集中包含必要 .gitkeep（含 cases 空目录与存在的空 src/test），狗粮无需额外仅 gitkeep 的 main 提交

## 设计

### 方案

在既有 worktree / initBaseline / platform-api / doctor / pr CLI 之上做六处卫生修补，不另开交付通道。

1. start：`applyChanges` 写 primary 任务记录后，把 `.tiller/task/<id>/`（含 task.md 与开工旁路）同步到本任务各 worktree；失败回滚 worktree。
2. doctor init-baseline：`status=merged` 或 commit 为 HEAD 祖先则通过；否则有 token 时做与 start 同级的平台合入查询，确认则 `markInitBaselineMerged` 并通过。
3. close init-id：清理前若 pending 且能祖先/API 证明已合入，先写回 merged。
4. init 残留：`createInitBaseline` 成功后，对本次 changes 中除 META 外、在 primary 仍为未跟踪且内容匹配 after 的受管路径安全删除；不 `git clean -fd`。
5. pr 输出：TTY 默认 markdown；`--json` 或非 TTY 默认稳定 JSON（url/number/branch/title/draftOnly 等）；`--draft-only` 不联网。
6. 远端删除：404/422 及 does not exist / not found 语义视为已清理，计入 remoteDeleted，不进 warnings。
7. gitkeep：保留 cases 空目录 keep；若 `src/`、`test/` 已存在且为空，向同一 init 变更集追加 `.gitkeep`。

### 失败处理

- 同步 worktree 失败：回滚本次 start 创建的 worktree，并向用户返回明确错误，不留下半套任务目录。
- 无 token / API 无法证明合入：doctor 与 close 不伪造 merged，init-baseline 仍 fail。
- init 清理：仅删本次写入且内容匹配的未跟踪文件；内容已变或已成为 tracked 则跳过并 warning。
- 远端删除非「不存在」失败：记 warning，不回滚合入，不阻断本机收尾。

### 取舍

- 选「start 同步任务目录到 worktree」而非「所有命令只写 primary」：dogfood 与 CLI 已从 worktree 写入确认/用例；同步后与现用法一致，改动面小于把全部写入改回 primary。
- 选「doctor/close 复用合入证明」而非「仅等 start」：squash 后祖先 SHA 常对不上，必须 API；与 start 门禁同语义避免双轨。
- 选「精确删除未跟踪受管残留」而非 `git clean`：避免误删用户文件。
- 选「非 TTY / --json → JSON，TTY → markdown」：脚本可解析且不打断人类。
- 空 src/test 才补 gitkeep：不强造业务骨架，只消除空目录无法提交的摩擦。

### 影响与风险

- 影响：`src/flow.ts`、`task-worktrees.ts`、`doctor.ts`、`init-baseline.ts`、`core.ts`、`branch-cleanup.ts`、`platform-api.ts`、`cli.ts`、`pr.ts`；测试与 CASE；usage/rules 镜像；decisions。
- 风险：误删 primary 文件——用内容匹配与未跟踪约束缓解；JSON 默认改变脚本外人类管道——仅非 TTY 切换并保留 `--json`/TTY markdown；API 误判合入——复用既有 findMergedIntegration。
- 兼容：版本 0.5.0；不改 CASE↔AC 模型；合入本 PR 由人审阅。

### 验证入口

- CASE-287 起覆盖 AC-1～AC-6；`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`；tiller verify 按 AC→CASE。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T03:51:27.070Z | 27f7d619b5fc | — |
| 设计 | boon yu | 2026-10-27T03:51:27.172Z | 27f7d619b5fc | — |
| 交付验收 | boon yu | 2026-10-27T04:01:10.046Z | 8bdfbbd195a3 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"023caef346b6526bbb7cbe3c470d24df1c3b6770f15506ed819ba0587bed7d7f","commit":"27f7d619b5fc071bc2782a9340872734672e7f21","by":"boon yu","quote":"","at":"2026-10-27T03:51:27.070Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"ed87ee8df01a9b0572ee5c01e171dbd3ca6a99dc6a50de3de2e091c657da1cd0","commit":"27f7d619b5fc071bc2782a9340872734672e7f21","by":"boon yu","quote":"","at":"2026-10-27T03:51:27.172Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"76aa7c06da02cc7a9f2ad9566471ba856d342bd2e9d519dc9f39ef998c1965c1","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3","by":"boon yu","quote":"","at":"2026-10-27T04:01:10.046Z"} -->

## 验证

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-196 CASE-209 CASE-287 project start creates a task-local worktree, sidecars and logs in one directory$' \u002d\u002dtest-reporter=./.tiller/local/verify-xJXyk8/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xJXyk8/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-196 CASE-209 CASE-287 project start creates a task-local worktree, sidecars and logs in one directory
- 用例：CASE-287
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-17.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:46.879Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-197 CASE-210 CASE-287 workspace start keeps management and registered repositories under the task worktree root$' \u002d\u002dtest-reporter=./.tiller/local/verify-7ELBpK/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-7ELBpK/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-197 CASE-210 CASE-287 workspace start keeps management and registered repositories under the task worktree root
- 用例：CASE-287
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-18.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:46.879Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-288 doctor and close use platform merge evidence for a pending init baseline$' \u002d\u002dtest-reporter=./.tiller/local/verify-Ud0lkL/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Ud0lkL/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-288 doctor and close use platform merge evidence for a pending init baseline
- 用例：CASE-288
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-19.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:48.936Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-288 ancestor proof records merged for doctor and close init-id$' \u002d\u002dtest-reporter=./.tiller/local/verify-OuQNHe/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-OuQNHe/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-288 ancestor proof records merged for doctor and close init-id
- 用例：CASE-288
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-20.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:48.936Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-289 init leaves no untracked managed residue$' \u002d\u002dtest-reporter=./.tiller/local/verify-liFN4V/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-liFN4V/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-289 init leaves no untracked managed residue
- 用例：CASE-289
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-21.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:51.958Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-279 CASE-292 pr 经 API 创建真实 PR 并返回稳定字段$' \u002d\u002dtest-reporter=./.tiller/local/verify-EXtQw1/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-EXtQw1/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-279 CASE-292 pr 经 API 创建真实 PR 并返回稳定字段
- 用例：CASE-292
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-22.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:53.411Z

### run-15
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-292 pr 非 TTY 默认输出 JSON 且 TTY 保持 Markdown$' \u002d\u002dtest-reporter=./.tiller/local/verify-jlmECd/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-jlmECd/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-292 pr 非 TTY 默认输出 JSON 且 TTY 保持 Markdown
- 用例：CASE-292
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-23.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:53.411Z

### run-16
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-290 已不存在的远端分支按已清理处理且不产生警告$' \u002d\u002dtest-reporter=./.tiller/local/verify-YSsOzW/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-YSsOzW/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-5
- 测试：test/merge.test.mjs::CASE-290 已不存在的远端分支按已清理处理且不产生警告
- 用例：CASE-290
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-24.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:00:59.760Z

### run-17
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-291 init includes gitkeeps for empty src and test in the baseline commit$' \u002d\u002dtest-reporter=./.tiller/local/verify-LVe1Mw/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-LVe1Mw/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e5660d7bfe2ec66f3420ba2382cb27ba297df1b5f230915c76b608458a0a04dc","commit":"8bdfbbd195a3d880ac6a71893c33fa4a5118d3a3"} -->
- 条件：AC-6
- 测试：test/init-baseline.test.mjs::CASE-291 init includes gitkeeps for empty src and test in the baseline commit
- 用例：CASE-291
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-dogfood-hygiene/logs/run-25.log
- 提交：8bdfbbd195a3
- 时间：2026-10-27T04:01:02.719Z

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
- 120 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 141 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 3 个测试用例（请确认对应功能已删除；详情见 Git diff）。
