# 合入后冻结共享任务记录

<!-- tiller-task:v1 {"version":1,"id":"20261026-post-merge-freeze","type":"feature","size":"standard","created":"2026-10-26T03:36:59.445Z","base":"e914a51cd9e81291e17a7fdf2c8a6bdfd998cf4a","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","slug":"post-merge-freeze","summary":"合入后不再改写 task.md","requirementFile":".tiller/local/20261026-post-merge-freeze-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 交付流程的人。现状：即使 `pr` 前已强制提交任务记录，合入后仍常再跑 `accept`/`close`，二者都会改写共享 `.tiller/task/<id>/task.md`，留下脏工作区，还要再补提交。用户明确：合入即交付完成；合入后不要再改共享 `task.md`；清理与合入/close 同路径完成。

### 目标

调整交付收尾：验收（`accept`）在开 PR 之前完成并随任务分支提交；PR 合入后任务即交付完成；之后的 `close`（或等价收尾）只清理本机 `.tiller/local/<id>/`，不再改写共享 `task.md`。顺带处理刚关闭的 `20261026-pr-task-sync` 遗留脏 `task.md`（合入后 accept/close 写入的段落）：纳入本 PR 一次性清理提交，或按新约定收敛为「合入后无共享改写」一致状态。

需求来源：`.tiller/local/20261026-post-merge-freeze-req.md`

### 业务范围

- 做：调整 `accept`/`close`（及必要时 `pr`/`check`/`resume`/阶段推导）使合入后无需也不再改写共享 `task.md`；文档与规则同步；用例与测试；清理 pr-task-sync 遗留脏文件。
- 不做：不自动 git commit；不自动合入 PR；不改版本号；不联网改托管平台合入钩子（本版以 CLI/文档约定为主）；不引入必须依赖 merge webhook 才能 close。
- 假设与待确认：合入授权仍在托管平台；`tiller pr` 仍只生成草稿；「合入即交付完成」以流程+门禁表达（accept 在 pr 前；close 合入后只清 local）。

### 关键行为

1. 标准交付链：`verify` → `check` → **`accept`** → 提交任务记录 → `pr` →（人工）合入 → **`close` 只清 local**。
2. `pr` 在任务尚未交付验收（无有效 acceptance）时失败并提示先 accept，避免「合入后再 accept」。
3. 对已验收任务执行 `close`：强拆并删除 `.tiller/local/<id>/`（含旧布局兼容），**不**向共享 `task.md` 追加关闭段；阶段/resume/check/release 仍可用（已验收即交付完成；关闭为本地清理完成，不得再脏主仓）。
4. `abandon`（未验收终止）仍可写共享记录（发生在合入前），行为与文档写清。
5. 本 PR 处理 `.tiller/task/20261026-pr-task-sync/task.md` 当前未提交的合入后改写。

### 异常与边界

- 已合入但从未 accept：应由 `pr` 门禁拦住；历史任务若处于该状态，文档给出迁移说明（一次性补救，不作为主路径）。
- `reopen`：在 close 不再写共享关闭段后仍可重开；实现可选 local 标记或最小共享语义，但合入后主路径不得再脏 `task.md`。
- 无 Git / 无法读工作树：与现有门禁对齐并在用例固定。

### 验收条件

- AC-1: pr 在任务尚未有效交付验收（无 acceptance）时默认失败并提示先 accept 再 pr；已验收且任务记录已提交时可生成五段草稿
- AC-2: 已验收任务的 close 只清理 .tiller/local/<id>/（含兼容旧布局），不改写共享 .tiller/task/<id>/task.md；合入后工作区不因 close 变脏
- AC-3: 文档与 rules（usage、delivery、必要时 decisions/core）写明：合入即交付完成；accept 在 pr 前；合入后 close 只清 local、不再改共享 task.md；不再要求合入后 accept
- AC-4: 已关闭任务 20261026-pr-task-sync 因合入后 accept/close 产生的脏 task.md 随本分支处理完毕（提交或按新约定收敛），合入后主仓不再遗留该脏文件
- AC-5: 用例与测试覆盖：未验收 pr 阻断、已验收 close 不改共享 task.md、文档约定；全量 build/lint/typecheck/test/test:package 通过；版本保持 0.5.0

## 设计

### 方案

1. **交付顺序**：把人工验收前移到开 PR 之前。推荐链：`verify` → `check` → `accept` → 提交含 acceptance 的任务记录 → `pr` → 合入 → `close`（只清 local）。
2. **`pr` 门禁（AC-1）**：在既有 `PR_TASK_RECORDS_DIRTY` 之外，若任务无有效交付验收（无 acceptance 确认），失败（建议错误码如 `PR_NOT_ACCEPTED`），提示先 `accept` 并提交后再 `pr`。
3. **`close` 冻结共享记录（AC-2）**：对**已验收**任务，`close` 只调用 worktree/local 清理（删除 `.tiller/local/<id>/`，兼容旧布局），**不再** `writeTask` 追加关闭段。阶段上：「已验收」即为交付完成态；`close` 表示本机清理完成。`resume`/`check`/`release` 以已验收为交付完成，不要求共享「已关闭」段才能发布自检。
4. **`abandon`**：未验收终止仍写入共享关闭/放弃记录（合入前路径），与「合入后冻结」不冲突。
5. **`reopen`**：若共享无关闭段，允许从已验收重开（清验收或追加 reopen 事件的最小方案由实现选定并测通）；不得迫使合入后再写一遍关闭段。
6. **文档（AC-3）**：更新 usage、delivery rules、必要时 decisions/core；删除或改写「合入后 accept/close 须另作收尾提交」的旧表述；写明合入即交付完成。
7. **遗留清理（AC-4）**：将主工作区脏的 `.tiller/task/20261026-pr-task-sync/task.md` 按新约定处理——优先去掉合入后才写入、本不应再改共享文件的验收/关闭追加（若 HEAD 已含验证记录则恢复到合入提交内容），或把「仅验证已合入、无合入后改写」的收敛结果随本分支提交，确保合入后主仓干净。

### 失败处理

- 未验收就 `pr`：硬失败并提示 `accept` → 提交 → `pr`。
- 已验收 `close`：清理 local；共享 `task.md` 内容与 mtime/哈希在调用前后一致（测试断言）。
- 对未验收任务误用无 `--abandon` 的 `close`：保持既有 `NOT_ACCEPTED` 失败。
- 无 Git：与现有 pr/close 行为对齐并写入用例。

### 取舍

- **合入前 accept，而非合入后补记**：直接满足「合并后不要再改」；验收事实进入 PR。
- **已验收 close 不写共享关闭段**：避免合入后脏工作区；「已关闭」不再作为必须写入共享的终态。备选（local sidecar）在 close 删除整棵 local 后无法留存，故不采用。
- **不自动 commit / 不接 merge webhook**：保持授权边界；以 CLI 门禁+文档固化流程。

### 影响与风险

- 影响：`src/pr.ts`、`src/flow.ts`（close/accept/stage/resume）、相关测试、resources 与受管 `.tiller/rules`/`usage`、decisions；可能触及 release 清单文案（已验收即可，不必已关闭）。
- 兼容：旧文档「合入后补提交」作废；依赖「已关闭」共享段的外部脚本需改为认「已验收」或 local 已清理。
- 风险：习惯合入后再 accept 的人会被 `pr` 门禁挡住——属预期纠偏。
- 安全：不触网、不自动推送/合入。

### 验证入口

- 定向：`node --test test/pr.test.mjs test/flow-*.mjs`（或现有 close/accept 相关套件）。
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T03:37:28.721Z | e914a51cd9e8 | — |
| 设计 | boon yu | 2026-10-26T03:37:33.477Z | e914a51cd9e8 | — |
| 交付验收 | boon yu | 2026-10-26T04:03:21.007Z | b7b71cc5ccd8 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"d92bfd531025bdfc87854b95cb87a27564321fd119f42c23a208655ae7cda8ab","commit":"e914a51cd9e81291e17a7fdf2c8a6bdfd998cf4a","by":"boon yu","quote":"","at":"2026-10-26T03:37:28.721Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"8b8073664842eeaf17a29dd6ac485566fa5892668916342424b9df023fd6259f","commit":"e914a51cd9e81291e17a7fdf2c8a6bdfd998cf4a","by":"boon yu","quote":"","at":"2026-10-26T03:37:33.477Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"9ae5a740cd147c77f5c912bd1d3d8a45abc4f76a9b210e8a530259dd64df2428","commit":"b7b71cc5ccd88a83222da2e7a2a17dcefd8a39ab","by":"boon yu","quote":"","at":"2026-10-26T04:03:21.007Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-223 pr blocks a task without a valid delivery acceptance$' \u002d\u002dtest-reporter=./.tiller/local/verify-ePN6eF/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ePN6eF/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"b3d65e42fae606b01cc3e7a92a65f150d35508fbf2b9580f3effb5c3efcdc60b","commit":"b7b71cc5ccd88a83222da2e7a2a17dcefd8a39ab"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-223 pr blocks a task without a valid delivery acceptance
- 用例：CASE-223
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-post-merge-freeze/logs/run-1.log
- 提交：b7b71cc5ccd8
- 时间：2026-10-26T04:03:05.895Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-224 accepted close only cleans local state and leaves shared task content unchanged$' \u002d\u002dtest-reporter=./.tiller/local/verify-4reYoC/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-4reYoC/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"b3d65e42fae606b01cc3e7a92a65f150d35508fbf2b9580f3effb5c3efcdc60b","commit":"b7b71cc5ccd88a83222da2e7a2a17dcefd8a39ab"} -->
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-224 accepted close only cleans local state and leaves shared task content unchanged
- 用例：CASE-224
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-post-merge-freeze/logs/run-2.log
- 提交：b7b71cc5ccd8
- 时间：2026-10-26T04:03:07.355Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-225 delivery docs freeze shared task records after merge$' \u002d\u002dtest-reporter=./.tiller/local/verify-SnTqRb/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-SnTqRb/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"b3d65e42fae606b01cc3e7a92a65f150d35508fbf2b9580f3effb5c3efcdc60b","commit":"b7b71cc5ccd88a83222da2e7a2a17dcefd8a39ab"} -->
- 条件：AC-3
- 测试：test/pr.test.mjs::CASE-225 delivery docs freeze shared task records after merge
- 用例：CASE-225
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-post-merge-freeze/logs/run-3.log
- 提交：b7b71cc5ccd8
- 时间：2026-10-26T04:03:09.521Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-226 pr-task-sync record converges to the merged content without post-merge sections$' \u002d\u002dtest-reporter=./.tiller/local/verify-aKpQBI/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-aKpQBI/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"b3d65e42fae606b01cc3e7a92a65f150d35508fbf2b9580f3effb5c3efcdc60b","commit":"b7b71cc5ccd88a83222da2e7a2a17dcefd8a39ab"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-226 pr-task-sync record converges to the merged content without post-merge sections
- 用例：CASE-226
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-post-merge-freeze/logs/run-4.log
- 提交：b7b71cc5ccd8
- 时间：2026-10-26T04:03:10.049Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-227 version stays 0\\.5\\.0 and freeze behavior remains covered$' \u002d\u002dtest-reporter=./.tiller/local/verify-DHSsGu/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-DHSsGu/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"b3d65e42fae606b01cc3e7a92a65f150d35508fbf2b9580f3effb5c3efcdc60b","commit":"b7b71cc5ccd88a83222da2e7a2a17dcefd8a39ab"} -->
- 条件：AC-5
- 测试：test/pr.test.mjs::CASE-227 version stays 0.5.0 and freeze behavior remains covered
- 用例：CASE-227
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-post-merge-freeze/logs/run-5.log
- 提交：b7b71cc5ccd8
- 时间：2026-10-26T04:03:10.562Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
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
- 本次改动涉及模块 initialization：建议回归该模块 59 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 23 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 103 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 2 个测试用例（请确认对应功能已删除；详情见 Git diff）。
