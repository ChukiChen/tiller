# GitHub 推送优先 tokenized git

## 使用场景

开发者在 tiller 任务 worktree 完成 `accept` 后运行 `tiller pr`，需要快速把任务分支推送到 GitHub。提交、推送和删分支由 Git 完成；创建 PR、squash 合入和读取远端合入状态由平台 REST API 完成。

## 目标

- GitHub 默认使用现有 tokenized HTTPS `git push` 推送分支，避免 Git Data API 串行上传整树 blob 成为主路径。
- 保留 Git Data API 作为 git 推送失败时的可选回退，不改变 PR 创建与合入的 REST API 边界。
- 收口初始化 `.gitkeep`、check 回写提示、PR 任务记录门禁和重复验收的软摩擦。

## 业务范围

- 做：调整 `pushBranch` 的 GitHub 传输顺序；缺失 `src/`、`test/` 时初始化仍写 `.gitkeep`；对引用稳定 specs 的实现任务降低回写噪音；PR 门禁区分当前任务检出与 primary 残留；重复验收按当前工作区重新检查。
- 不做：升版本、合入本任务 PR、纯性能抛光、静默删除用户文件或整仓架构重写。
- 假设：token 仍由 `GITHUB_TOKEN`/`GH_TOKEN` 或 `GITLAB_TOKEN`/`GL_TOKEN` 提供；本地 Git 可用于 commit 和 push。

## 关键行为

1. GitHub `pushBranch` 先返回 `method=tokenized-git` 的推送结果；只有 tokenized git 推送失败时才尝试 Git Data API 回退。
2. 初始化工程缺少 `src/` 或 `test/` 目录时，初始化基线变更集仍包含对应 `.gitkeep`。
3. 仅有稳定 specs 需求来源的实现任务，基线后没有 specs/context 回写时，不出现泛化的“未回写”提示。
4. `PR_TASK_RECORDS_DIRTY` 区分当前任务 worktree/primary 检出与 primary 残留副本，并提示人工提交或清理。
5. 重复 `accept` 不使用旧验收提交掩盖当前改动；当前代码树未重新验证时阻断。

## 异常与边界

- tokenized git 推送失败时返回中文错误并遮蔽 token；Git Data API 回退也失败时合并报告两种原因。
- 目录缺失只补 `.gitkeep` 标记，不把已存在的用户文件或目录覆盖为空目录。
- primary 残留只提示，不自动删除。
- `--requirement` 只接受单行；多行或结构化需求使用 `--requirement-file`，文件必须位于 `.tiller/specs/`。

## 验收条件

- AC-1: GitHub 上 `tiller pr` 推送优先使用 tokenized HTTPS git push，不再默认走 Git Data API 串行上传整树 blob；开 PR/merge 仍走 REST API
- AC-2: 仓库尚无 `src/` 或 `test/` 目录时，init 变更集仍包含 `src/.gitkeep` 与 `test/.gitkeep`
- AC-3: feature 任务仅引用已有稳定 specs、本次无基线后 specs/context 长期回写必要时，check 对“未回写 specs”提示降噪或仅在真实需要时出现
- AC-4: `PR_TASK_RECORDS_DIRTY` 提示能区分 worktree 未提交记录与 primary 残留副本，且不静默删除用户文件；重复验收按当前工作区校验；`--requirement` 多行指向 `--requirement-file`
- AC-5: 版本保持 0.5.0；全量 build/lint/typecheck/test 与 package smoke 通过；新增 CASE 并更新总数断言；开真实 PR 不合入
