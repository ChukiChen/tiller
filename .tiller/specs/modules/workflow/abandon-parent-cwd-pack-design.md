# 父 shell cwd 下的 abandon 可重试与流程卫生设计

## 方案

- `task-worktrees` 在清理前区分 abandon 与普通 close：abandon 命中调用方 cwd 时只做预检失败，不执行 `process.chdir`；普通 close 暂保留既有切出行为。错误包含当前 cwd、primary 与可复制重试命令。
- `cleanupTaskWorktrees` 在删除 worktree 前把现存任务记录复制到 `.tiller/local/<id>/recovery/.tiller/task/<id>/`。该恢复记录仅为本机状态，不进入 Git，不写 primary `.tiller/task/`。
- 清理拆成准备与收尾两阶段：准备阶段删除 worktree、日志和已知本机产物但保留恢复记录；`closeFlow` 完成本地分支清理后才调用收尾删除整个 `.tiller/local/<id>/`。任一阶段失败都保留恢复记录，`readTask` 在 primary 无记录时读取该恢复路径。
- 父 cwd 预检在恢复记录写入和任何删除之前执行；失败后用户切到 primary 即可重试，后续 `resolveTaskCheckout`/`readTask` 通过 `.tiller/local/<id>/recovery` 继续识别任务。
- Windows 命令封装改用与 cross-spawn 相同的 cmd 规则：可执行文件做元字符转义，参数先按 Windows 引号规则加引号，再对 cmd 元字符做 `^` 转义，最后只包一层 `/d /s /c` 外层命令。
- `test/helpers.mjs` 只负责把 primary 夹具文件镜像到任务检出，不再覆盖调用方传入的 `cwd`；CASE-317 改为真实 nested cwd 的预检失败与 primary 重试，CASE-322 保留 accepted 未合入的仅本机清理回归。
- `checkFlow` 只求值并返回 selfCheck，不调用 `writeTask`。验证编号从已有 `run-N` 最大值加一；PR 验证段仅输出 inspectFlow 确认的当前测试摘要，历史运行省略。
- specs/cases-only 范围统一推为 `specs` 模块，PR 支持显式 `--module` 覆盖。`case add` 增加可重复 `--input-file`，按工程安全路径读取文本并合并到输入列表。
- 新增 Git 身份预检工具：start 在创建 worktree 前检查 `user.name`/`user.email`；init 在创建目录或分支前检查已存在仓库的本地/全局配置，新目录只检查全局配置，并给出设置命令。

## 失败处理

- cwd 预检失败、恢复记录复制失败或清理步骤失败都返回非零 `ok:false`，不返回放弃成功结果；错误文案保留重试入口。
- 恢复记录复制失败时在删除前停止，原 worktree 记录不动；清理中失败时恢复记录仍可由下一次 close 读取，成功后随任务本机树删除。
- Windows 参数包含 NUL、换行或无法安全表达的控制字符时继续以 `VERIFY_COMMAND_UNSUPPORTED` 拒绝。
- `check` 无写副作用；发现阻断项只返回 issues。Git 身份缺失时在写盘前以 `GIT_IDENTITY_MISSING` 失败。

## 取舍

- 不尝试释放父 shell cwd，也不把 EBUSY 当成功；预检失败比半删后丢记录更可恢复。
- 恢复记录放在本机任务目录，避免重新引入 primary abandon 种子或提交；成功后删除，不成为共享历史。
- PR 历史验证选择省略而不是复杂地逐条标注时效，确保不会把旧失败误标为当前有效。
- 不引入 Gradle 启动修复，保持本包聚焦已点名问题。

## 影响与风险

- 影响 `src/task-worktrees.ts`、`src/project-root.ts`、`src/flow.ts`、`src/test-output.ts`、`src/pr.ts`、`src/cases.ts`、`src/cli.ts`、初始化/Git 身份入口、workflow/verification/initialization 相关 CASE 与测试。
- abandon 的行为从「worktree 内自动切出」收紧为「调用方先切出再重试」，旧 CASE-317 预期需同步更新，属于父进程句柄无法由子进程释放的契约修正。
- 恢复记录只覆盖本机失败窗口；若用户手工删除 `.tiller/local/<id>/recovery`，任务记录仍需从工作分支恢复，产品不伪造记录。

## 验证入口

- `test/task-worktrees.test.mjs`：CASE-317、CASE-322、CASE-355、CASE-356。
- `test/windows-fresh-hygiene.test.mjs`：CASE-352。
- `test/flow-cli.test.mjs`、`test/pr.test.mjs`、`test/review-release.test.mjs`、`test/init-baseline.test.mjs`：CASE-357 至 CASE-361 对应回归。
- 最后执行 `npm test`、`npm run lint`、`npm run typecheck`。
