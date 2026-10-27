# 去掉 close materialize 与 closed 标记

## 使用场景

post-#44 狗粮仍软：合入/关闭后 `materializeSharedTaskRecord` 把任务树复制到 primary，留下未跟踪 `.tiller/task/<id>/` 挡 `git pull`/快进；同时 close 写入 `.tiller/local/closed/<id>.json` 作为幂等清理标记，增加本机状态面。维护者已确认：MR 合入后本地快进即可读到已跟踪内容，不必再复制；历史靠 Git 合入结果，不再依赖 closed 标记。

## 目标

按根因去掉 close/merge 后的共享任务 materialize，并移除 `.tiller/local/closed/` 清理标记的写入与读取；close 只清 worktree 与分支。版本保持 0.5.0。`--requirement` 短目标通道与设计占位手填不改。

## 业务范围

- 做：删除或停用 `materializeSharedTaskRecord` 及其在 close（含 accept 收尾与 abandon）中的调用；删除 `cleanupMarkerPath` / `readCleanupMarker` / `writeCleanupMarker` / `clearCleanupMarker` 与 reopen 中的清除；更新 workflow 设计/usage/decisions；调整依赖 materialize 或 closed 标记的 CASE/测试（含 CASE-057 等）；全量测试与必要 package smoke。
- 不做：升版本；改 `--requirement` 短目标通道；改设计占位须手填；给 `pull` 加“忽略未跟踪”特判；CloudAgent；合入本 PR（由人审阅）；无关重构。
- 假设：合入后 primary 经快进/pull 获得已跟踪任务记录；从未合入就 close 的任务不在 primary 留未跟踪副本，reopen 仅在记录仍可解析时可用（例如已在默认分支跟踪）。

## 关键行为

1. **close/merge 不 materialize**：已验收 close（含 `merge` 自动 close）与 abandon 在清理 worktree 前**不再**把 `.tiller/task/<id>/` 复制到 primary；primary 不因此新增未跟踪任务树。
2. **去掉 closed 标记**：不再读写 `.tiller/local/closed/<id>.json`；重复 close 对已缺失 worktree/local/分支保持幂等（清理路径本身幂等），不依赖该标记；reopen 不再清除该标记。
3. **文档与用例**：usage/design/decisions 与相关 CASE 反映上述行为；测试断言改为「close 后 primary 无因 materialize 产生的未跟踪 task」，并以合入后跟踪记录或显式夹具覆盖 reopen。

## 异常与边界

- 任务记录已在默认分支跟踪：close 不删除跟踪文件；快进/pull 后可读。
- 从未合入仅存在于 worktree 的任务：close 后 primary 无该 task 树属预期；随后 reopen/resume 若找不到记录则按现有 `TASK_NOT_FOUND`（或等价）失败。
- abandon 写入的关闭事实若仅在 worktree 且未合入，随 worktree 清理消失；不为此在 primary 造未跟踪副本。
- `--keep-branch`：仍跳过分支删除；与是否 materialize/closed 标记无关。
- init 基线 close：行为保持（本机清理、不改共享 task），本任务不扩展。

## 验收条件

- AC-1: 已验收 close（含 merge 自动 close）与 abandon 均不把任务树 materialize 到 primary；close 后 primary 不因该路径新增未跟踪 `.tiller/task/<id>/`
- AC-2: close/reopen 路径不再创建、读取或依赖 `.tiller/local/closed/<id>.json`；重复 close 在 worktree 已缺失时仍安全完成清理
- AC-3: 相关 CASE/测试与全量套件通过；版本保持 0.5.0；usage/design/decisions 反映上述行为
