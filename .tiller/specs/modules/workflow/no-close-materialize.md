# close 只清理本机并保持共享记录

## 使用场景

合入或关闭后，任务记录应通过默认分支的已跟踪提交读取；本地收尾只处理当前任务的 worktree、`.tiller/local/<id>/` 与任务分支，不再向 primary 复制任务树。

## 目标

close/merge 自动 close 与 abandon 只清理本机状态；共享任务记录由默认分支快进/pull 获得。版本保持 0.5.0。`--requirement` 短目标通道与设计占位手填不改。

## 业务范围

- 做：保持 close/merge 自动 close 与 abandon 的本机清理语义；更新 workflow 设计、usage、decisions 与相关 CASE/测试；全量测试与必要 package smoke。
- 不做：升版本；改 `--requirement` 短目标通道；改设计占位须手填；给 `pull` 加忽略未跟踪文件的特判；CloudAgent；合入本 PR（由人审阅）；无关重构。
- 假设：合入后 primary 经快进/pull 获得已跟踪任务记录；从未合入就 close 的任务不在 primary 留未跟踪副本，reopen 仅在记录仍可解析时可用。

## 关键行为

1. **收尾只清本机**：已验收 close（含 `merge` 自动 close）与 abandon 在清理 worktree 后只删除 `.tiller/local/<id>/` 与任务分支；primary 不新增未跟踪任务树。
2. **重复 close 幂等**：worktree、本机目录或分支已缺失时仍安全完成清理。
3. **文档与用例**：usage/design/decisions 与相关 CASE 反映上述行为；测试覆盖 close 后 primary 无未跟踪 task，以及合入后跟踪记录可 reopen。

## 异常与边界

- 任务记录已在默认分支跟踪：close 不删除跟踪文件；快进/pull 后可读。
- 从未合入仅存在于 worktree 的任务：close 后 primary 无该 task 树属预期；随后 reopen/resume 若找不到记录则按现有 `TASK_NOT_FOUND`（或等价）失败。
- abandon 不写关闭事实；任务记录随 worktree 清理消失属预期，不为此在 primary 造未跟踪副本或放弃提交。
- `--keep-branch`：仍跳过分支删除。
- init 基线 close：行为保持（本机清理、不改共享 task），本任务不扩展。

## 验收条件

- AC-1: 已验收 close（含 merge 自动 close）与 abandon 均不把任务树复制到 primary；close 后 primary 不因该路径新增未跟踪 `.tiller/task/<id>/`
- AC-2: 重复 close 在 worktree 已缺失时仍安全完成清理
- AC-3: 相关 CASE/测试与全量套件通过；版本保持 0.5.0；usage/design/decisions 反映上述行为
