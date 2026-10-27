# start / confirm / requirement 软摩擦根因修复

## 使用场景

post-#42 狗粮后仍有三项软摩擦：primary 残留未跟踪 `.tiller/task/<id>/` 导致 `PR_TASK_RECORDS_DIRTY`；`accept`/`confirm` 写确认后不提交，必须再手搓一轮才能 `pr`；`--requirement` 被当成可写完整需求的入口，与 specs/AC 分流打架。维护者与执行 AI 需要这三项按根因收口，而不是降级门禁或临时特判。

## 目标

一次性按根因修这三项：`start` 只把任务记录写入任务 worktree；`confirm`/`accept` 写完确认后自动提交任务记录；`--requirement` 明确为短目标单行通道，完整需求与 AC-n 只走 `--requirement-file`。版本保持 0.5.0。

## 业务范围

- 做：改 `startFlow` 写入路径与同步/回滚/close 清理；`confirmFlow`/`acceptFlow`（及同类写确认的门禁）自动 `git add`+`git commit` 本任务记录；收紧 CLI/usage/AGENTS/相关 specs 对 `--requirement` 与 `--requirement-file` 的定位与错误文案；更新被推翻的 worktree-task-truth 假设与 decisions；CASE + 测试；必要文档一句。
- 不做：升版本；把 `--requirement` 放开为多行完整需求；给 `pr` 增加“忽略 primary 残留”的特判作为主修复；CloudAgent；合入本 PR（由人审阅）；扩大到无关重构。
- 假设：验收绑定仍是 confirm 当时的 HEAD（`deliverySubject` 用写入前的 commit）；自动提交发生在绑定之后，只暂存本任务 `.tiller/task/<id>/`（及该次确认直接相关的任务记录路径），不把无关脏文件一并提交。

## 关键行为

1. `start`：先 `createTaskWorktrees`，再把 `.tiller/task/<id>/`（含 `task.md` 与开工所需旁路）直接写入任务 worktree；primary 上不留下存活的同名任务记录目录。失败回滚拆除 worktree，并确保 primary 无同名残留。
2. `syncTaskRecordsToWorktrees` 不再承担“primary 权威种子 → 拷贝到 worktree”的主路径；若仍保留，仅服务多 worktree 间已有记录的传播，或改为对 worktree 路径的直接写入辅助。
3. `close`/失败清理：若 primary 仍意外存在同名 `.tiller/task/<id>/`，一并清理；`pr` 脏记录门禁继续只要求当前任务检出干净，不依赖“忽略 primary 残留”特判作为根因修复。
4. `confirm`（requirements/design/acceptance）与 `accept`：在绑定确认对象（含 acceptance 的 HEAD）并写入 `task.md` 后，由 tiller 自动提交本任务记录，约定提交信息如 `chore: 需求确认` / `chore: 设计确认` / `chore: 验收确认`；成功后工作区相对该任务记录干净，可直接进入后续 `pr`（在代码与其它交付物已提交的前提下）。
5. `--requirement` 继续只接受单行短目标；含换行时仍失败，并明确导向 `--requirement-file`。CLI help、usage、错误文案标明：`--requirement` 仅短目标；完整正文与 AC-n 导入只用 `--requirement-file`（`.tiller/specs/`）。不得把 `--requirement` 放开为多行完整需求。

## 异常与边界

- 无 Git 或无法提交时，确认写入仍成功，但返回可观测 warning/失败语义说明未能自动提交，不假装已干净。
- 自动提交仅限本任务记录路径；工作区其它未提交业务改动不进该次提交，也不被静默丢弃。
- 历史 primary 残留副本：新 `start` 不再制造；旧残留由 close/清理路径处理；双份并存解析规则（cwd worktree 优先）保持。
- workspace 多仓：任务记录写入管理侧任务 worktree（与现有 taskRoot 一致），不在 primary 留种子。

## 验收条件

- AC-1: `start` 成功后 primary 不存在 `.tiller/task/<id>/` 存活目录，任务 worktree 内存在可读 `task.md`（及开工旁路若有），可直接在 worktree 继续 case/confirm
- AC-2: `accept`（及 requirements/design 的 `confirm`）写入确认后，本任务记录已由 tiller 自动提交；在交付物已提交的前提下，无需再手搓一轮仅含 task.md 的 commit 即可通过 `pr` 的任务记录干净门禁
- AC-3: `--requirement` 多行仍被拒绝并导向 `--requirement-file`；CLI/usage 等文案明确 `--requirement` 仅短目标、完整需求与 AC-n 走 `--requirement-file`；版本保持 0.5.0，相关 CASE/测试与 package smoke 通过
