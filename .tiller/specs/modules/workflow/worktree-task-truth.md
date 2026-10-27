# 任务 worktree 为任务真相

## 使用场景

执行 AI 在任务 worktree 中改代码、登记用例、确认、验证和创建 PR/MR 时，命令默认读写当前任务检出，不应因为主仓还有同名任务副本而回到大桌。

## 目标

把任务根、`--path` 与 cwd 的解析收敛到 `resolveTaskCheckout`。cwd 或显式路径落在本任务 worktree 时，该 worktree 的任务记录是默认真相；primary 只承担推送、平台 API、拆树和删分支等主仓操作。

## 业务范围

- 做：统一任务记录读写入口；任务 worktree 优先；worktree 写入不静默镜像 primary；CASE 与测试；相关规格和决策。
- 不做：升版本；整仓分层重写；修改 CASE 与 AC 数据模型；改变平台 API 协议。
- 假设：start 在创建任务 worktree 后只把任务记录写入该 worktree（多仓时由管理 worktree 再同步到兄弟 worktree），primary 不留存活种子；若历史残留导致双份并存，以 cwd/显式路径所在检出为准。

## 关键行为

1. `case add`、`confirm`、`verify`、`check`、`accept`、`review`、`release`、`reopen`、`resume <id>` 与 `pr` 读任务侧都经 `resolveTaskCheckout`。
2. cwd 或 `--path` 命中本任务 worktree 时，`taskRoot` 是该 worktree，即使 primary 也有可区分的 `task.md`。
3. 任务 worktree 缺少 `task.md` 时不回退读取 primary；命令保持清晰 `TASK_NOT_FOUND`。
4. 从任务 worktree 写任务记录、用例或验证事实时不静默写入 primary 任务目录。
5. `primary` 仍用于 Git push、平台 PR/MR API、worktree 拆除与本地/远端分支删除。
6. 显式 `--path primary` 或从 primary 运行命令时，仍可读取 primary 任务记录。

## 异常与边界

- cwd 在 primary 或普通仓库时保持原解析。
- 新 start 不再制造 primary 种子；历史双份漂移时以当前 worktree 为准，close 会尝试清理 primary 残留目录。
- 任务 worktree 已建立但记录同步缺失时，优先只信当前树并失败，不静默消费 primary 副本。
- 解析逻辑只保留一个公开入口；命令层不再各自用 `path.resolve(rootInput)` 猜测任务根。

## 验收条件

- AC-1: 在任务 worktree 根不带 `--path` 执行 case/confirm/verify 等任务命令时，读写该 worktree 的任务记录。
- AC-2: primary 与 worktree 均有可区分 task.md 时，cwd=worktree 的 taskRoot 为 worktree。
- AC-3: 在 worktree 工作产生的任务记录写入不会静默出现在 primary 任务目录。
- AC-4: push、平台 PR/MR、拆树与删分支仍使用 primary，主路径可用。
- AC-5: 任务根与 `--path`/cwd 解析集中在一个入口，相关命令经该入口。
- AC-6: 版本保持 0.5.0；全量门禁与 package smoke 通过，新增 CASE 覆盖 AC-1～5。
