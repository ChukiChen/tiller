# 修复 start/confirm/requirement 三项软摩擦根因

<!-- tiller-task:v1 {"version":1,"id":"20261027-soft-friction","type":"feature","size":"standard","created":"2026-10-27T07:18:28.499Z","base":"19fc75b4a4eddda997930bb929bf143882cc25f8","scope":["src","test",".tiller","resources"],"format":"structured","slug":"soft-friction","summary":"start只写worktree、confirm自动提交、requirement通道定位","requirementFile":".tiller/specs/modules/workflow/soft-friction-rootfixes.md"} -->

## 需求

### 使用场景

post-#42 狗粮后仍有三项软摩擦：primary 残留未跟踪 `.tiller/task/<id>/` 导致 `PR_TASK_RECORDS_DIRTY`；`accept`/`confirm` 写确认后不提交，必须再手搓一轮才能 `pr`；`--requirement` 被当成可写完整需求的入口，与 specs/AC 分流打架。维护者与执行 AI 需要这三项按根因收口，而不是降级门禁或临时特判。

### 目标

需求来源：`.tiller/specs/modules/workflow/soft-friction-rootfixes.md`

一次性按根因修这三项：`start` 只把任务记录写入任务 worktree；`confirm`/`accept` 写完确认后自动提交任务记录；`--requirement` 明确为短目标单行通道，完整需求与 AC-n 只走 `--requirement-file`。版本保持 0.5.0。

### 业务范围

- 做：改 `src/` 中 `startFlow` 写入路径与同步/回滚/close 清理；`confirmFlow`/`acceptFlow`（及同类写确认的门禁）自动 `git add`+`git commit` 本任务记录；收紧 CLI/usage/AGENTS/相关 specs 对 `--requirement` 与 `--requirement-file` 的定位与错误文案；更新被推翻的 worktree-task-truth 假设与 decisions；CASE + 测试；必要文档一句。
- 不做：升版本；把 `--requirement` 放开为多行完整需求；给 `pr` 增加“忽略 primary 残留”的特判作为主修复；CloudAgent；合入本 PR（由人审阅）；扩大到无关重构。
- 假设：验收绑定仍是 confirm 当时的 HEAD（`deliverySubject` 用写入前的 commit）；自动提交发生在绑定之后，只暂存本任务 `.tiller/task/<id>/`（及该次确认直接相关的任务记录路径），不把无关脏文件一并提交。

### 关键行为

1. `start`：先 `createTaskWorktrees`，再把 `.tiller/task/<id>/`（含 `task.md` 与开工所需旁路）直接写入任务 worktree；primary 上不留下存活的同名任务记录目录。失败回滚拆除 worktree，并确保 primary 无同名残留。
2. `syncTaskRecordsToWorktrees` 不再承担“primary 权威种子 → 拷贝到 worktree”的主路径；若仍保留，仅服务多 worktree 间已有记录的传播，或改为对 worktree 路径的直接写入辅助。
3. `close`/失败清理：若 primary 仍意外存在同名 `.tiller/task/<id>/`，一并清理；`pr` 脏记录门禁继续只要求当前任务检出干净，不依赖“忽略 primary 残留”特判作为根因修复。
4. `confirm`（requirements/design/acceptance）与 `accept`：在绑定确认对象（含 acceptance 的 HEAD）并写入 `task.md` 后，由 tiller 自动提交本任务记录，约定提交信息如 `chore: 需求确认` / `chore: 设计确认` / `chore: 验收确认`；成功后工作区相对该任务记录干净，可直接进入后续 `pr`（在代码与其它交付物已提交的前提下）。
5. `--requirement` 继续只接受单行短目标；含换行时仍失败，并明确导向 `--requirement-file`。CLI help、usage、错误文案标明：`--requirement` 仅短目标；完整正文与 AC-n 导入只用 `--requirement-file`（`.tiller/specs/`）。不得把 `--requirement` 放开为多行完整需求。

### 异常与边界

- 无 Git 或无法提交时，确认写入仍成功，但返回可观测 warning/失败语义说明未能自动提交，不假装已干净。
- 自动提交仅限本任务记录路径；工作区其它未提交业务改动不进该次提交，也不被静默丢弃。
- 历史 primary 残留副本：新 `start` 不再制造；旧残留由 close/清理路径处理；双份并存解析规则（cwd worktree 优先）保持。
- workspace 多仓：任务记录写入管理侧任务 worktree（与现有 taskRoot 一致），不在 primary 留种子。

### 验收条件

- AC-1: `start` 成功后 primary 不存在 `.tiller/task/<id>/` 存活目录，任务 worktree 内存在可读 `task.md`（及开工旁路若有），可直接在 worktree 继续 case/confirm
- AC-2: `accept`（及 requirements/design 的 `confirm`）写入确认后，本任务记录已由 tiller 自动提交；在交付物已提交的前提下，无需再手搓一轮仅含 task.md 的 commit 即可通过 `pr` 的任务记录干净门禁
- AC-3: `--requirement` 多行仍被拒绝并导向 `--requirement-file`；CLI/usage 等文案明确 `--requirement` 仅短目标、完整需求与 AC-n 走 `--requirement-file`；版本保持 0.5.0，相关 CASE/测试与 package smoke 通过

## 设计

### 方案

1. **start 只写 worktree**  
   `startFlow` 在 `createTaskWorktrees` 成功后，以任务 worktree 根（project 模式即 `worktrees.root` 对应绝对路径；workspace 取管理仓 worktree）为 `applyChanges`/`writePreExisting` 目标，写入 `.tiller/task/<id>/task.md` 与开工旁路。primary 根不再 `mkdir`/`applyChanges` 该目录。  
   `syncTaskRecordsToWorktrees`：主路径改为「已在某一 worktree 写好后，复制到同任务其它尚未拥有该目录的 worktree」（多仓场景）；单仓 project 可直接写目标 worktree，不再「primary→全量拷贝」。失败分支 `rollbackTaskWorktrees` 后 `rm` primary 与各 worktree 上的同名任务目录（best-effort）。  
   `close`/abandon 清理：在拆除 worktree 时，若 primary 仍存在 `.tiller/task/<id>/`，删除该残留（不改共享合入后不写 task.md 的约定——仅删未合入/残留目录）。

2. **confirm/accept 自动提交任务记录**  
   在 `confirmFlow` 完成 `writeTask` 后新增 `commitTaskRecords(root, id, message)`：仅 `git add` `.tiller/task/<id>/`（及该次确认直接产生的同目录文件），再 `git commit`；提交信息按门禁：`chore: 需求确认` / `chore: 设计确认` / `chore: 验收确认`。  
   **顺序**：先 `currentCommit` 绑定 `subject`（acceptance 用写入前 HEAD），再写 `task.md`，再自动提交。验收有效性仍按 `acceptance.commit`（旧 HEAD）重算 `deliverySubject`，自动提交不使验收失效。  
   无 Git / add·commit 失败：确认事实已写入，返回 `warnings`（含失败原因），不回滚确认；调用方可知记录仍可能 dirty。不 `git add -A`，不提交业务脏文件。

3. **`--requirement` 通道定位**  
   保持单行校验与失败码；错误文案改为明确「仅短目标/单行；完整需求与 AC-n 请用 `--requirement-file`（须在 `.tiller/specs/`）」。同步 `src/cli.ts` help、`.tiller/usage.md`、必要时 AGENTS 一句。不放开多行。  
   更新 `worktree-task-truth.md` 假设（删除「start 先写 primary」）、`requirements.md`/`design.md` 中 start 同步叙述，以及 `decisions.md`：推翻「本版不自动 commit」中针对 confirm/accept 任务记录的部分，改为「confirm/accept 自动提交本任务记录」。

### 失败处理

- start 写 worktree 失败：回滚 worktree 并清理 primary/worktree 任务目录，抛原错误。  
- confirm 自动提交失败：保留确认写入 + warning；用户可手工提交后 `pr`。  
- close 删 primary 残留失败：记 warning，不阻断本机清理结果。

### 取舍

- 不采用「pr 忽略 primary 残留」：那是症状特判，会掩盖 start 继续写 primary。  
- 不采用「accept 后改 digest 忽略 task.md」：改动大且与现有 commit 绑定模型冲突；自动提交更小、与「记录须入仓」一致。  
- 不把 `--requirement` 放开多行：与 specs/AC 导入模型冲突；文案收紧即可。

### 影响与风险

- 影响：`src/flow.ts`、`src/task-worktrees.ts`、close 清理、CLI/usage/specs/decisions、既有「start 后 primary 必有 task.md」类测试（如 CASE-293/295 断言）需改为「primary 无种子」。  
- 兼容：显式 `--path primary` 仍可读历史主仓副本；双份解析规则不变。旧 primary 残留靠 close 清理。  
- 风险：自动提交作者取 git `user.name`/`user.email`（与 init 一致）；测试夹具需接受 confirm 后多一次 chore 提交。

### 验证入口

- 新增/更新 CASE 覆盖 AC-1～3；`node --test` 相关套件；`npm test` / package smoke；版本号仍为 0.5.0。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T08:20:12.619Z | 0215cd8b2349 | — |
| 设计 | boon yu | 2026-10-27T08:20:15.235Z | b7db706dbdd9 | — |
| 交付验收 | boon yu | 2026-10-27T08:20:35.454Z | 9d506993a73e | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"a2c39faf52cb09f21590e37e750acff4592835c33ab676a506644e6a35ba4c8e","commit":"0215cd8b23492cb7932ec49f7c2e601091ac648c","by":"boon yu","quote":"","at":"2026-10-27T08:20:12.619Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"04bbc7d66d5249cd70c9fdba204387b5152fa86ad33ab401174fe44b0204a6cd","commit":"b7db706dbdd9cb1fd0b59e987380abae7e4f3319","by":"boon yu","quote":"","at":"2026-10-27T08:20:15.235Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"c14d4cde24b2ec1b87f5722a254ceafa94bcf792f4c7ec498f477b9235ebfb41","commit":"9d506993a73ebe6e666596cbb5e07a50e9632eca","by":"boon yu","quote":"","at":"2026-10-27T08:20:35.454Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-302 CASE-293 CASE-295 start leaves no primary seed; worktree root commands stay local$' \u002d\u002dtest-reporter=./.tiller/local/verify-gc8lux/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-gc8lux/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"eb139ea00a6be98d78b263dfa2e57762bd18bda45ba2f2d05482cf32465412fe","commit":"9d506993a73ebe6e666596cbb5e07a50e9632eca"} -->
- 条件：AC-1
- 测试：test/worktree-task-root.test.mjs::CASE-302 CASE-293 CASE-295 start leaves no primary seed; worktree root commands stay local
- 用例：CASE-302
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-soft-friction/logs/run-1.log
- 提交：9d506993a73e
- 时间：2026-10-27T08:20:17.446Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-303 confirm and accept auto-commit task records$' \u002d\u002dtest-reporter=./.tiller/local/verify-PKBurA/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-PKBurA/report.jsonl test/worktree-task-root.test.mjs","exitCode":0,"tree":"eb139ea00a6be98d78b263dfa2e57762bd18bda45ba2f2d05482cf32465412fe","commit":"9d506993a73ebe6e666596cbb5e07a50e9632eca"} -->
- 条件：AC-2
- 测试：test/worktree-task-root.test.mjs::CASE-303 confirm and accept auto-commit task records
- 用例：CASE-303
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-soft-friction/logs/run-2.log
- 提交：9d506993a73e
- 时间：2026-10-27T08:20:23.244Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 CASE-304 multiline requirement stays short-goal only and points to requirement-file$' \u002d\u002dtest-reporter=./.tiller/local/verify-mH49Ss/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mH49Ss/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"eb139ea00a6be98d78b263dfa2e57762bd18bda45ba2f2d05482cf32465412fe","commit":"9d506993a73ebe6e666596cbb5e07a50e9632eca"} -->
- 条件：AC-3
- 测试：test/pr.test.mjs::CASE-301 CASE-304 multiline requirement stays short-goal only and points to requirement-file
- 用例：CASE-304
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-soft-friction/logs/run-3.log
- 提交：9d506993a73e
- 时间：2026-10-27T08:20:26.833Z

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
- 132 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 153 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 2 个测试用例（请确认对应功能已删除；详情见 Git diff）。
