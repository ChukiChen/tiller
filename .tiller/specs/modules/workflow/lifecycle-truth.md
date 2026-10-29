# 任务生命周期核对

## 使用场景

任务记录在开工时只写入任务 worktree，主检出可能没有 `.tiller/task/`。过程卫生自检和收尾必须从同一任务真相读取，不能在主检出缺少记录时误判为干净，也不能删除尚未合入或尚未持久化的唯一事实。

## 1. doctor 以 active worktree 为任务真相

`doctor` 从 Git worktree 清单和任务 worktree 中的记录发现进行中任务，读取 worktree 的 `task.md`，复用任务阶段和 `inspectFlow` 检查 AC 覆盖与数据模型。primary 没有任务目录不构成跳过理由；有 active 任务分支但找不到对应记录时报告严重问题。主检出的初始化基线、默认分支 specs 和残留分支检查保持不变。

## 2. close 以合入证明约束破坏性清理

已验收任务执行 `close` 前必须取得任务已合入的证明：主检出的跟踪记录与当前任务记录一致、任务分支已进入默认历史，或平台 API 确认同分支 PR/MR 已合入。证明不足时拒绝删除 worktree、本机目录和分支，并保留可恢复任务事实。清理后只有当前检出仍能读取任务记录时，结果才提示 `reopen`。

## 3. abandon 只清理本机

未验收或已验收未合入任务使用 `--abandon` 时，只拆除任务 worktree、删除 `.tiller/local/<id>/` 并清理任务分支；不写 primary `task.md`/CASE，不创建放弃提交。清理后没有任务记录可读属预期，`resume` 不再列出该任务，`confirm`、`verify`、`accept` 与 `reopen` 按记录不存在失败。正常 `close` 的合入证明语义不变。
