# 修复 init worktree 落盘与 verify/基线卫生

## 使用场景

post-#43 狗粮后仍有三项软摩擦：设计确认前误跑 `verify` 会写入错序段，随后过程卫生阻断确认，需手工清记录；`init` 仍先在 primary 落受管文档再清理，常留未跟踪 `.tiller/` / 任务树挡 `git pull`；合入后 `markInitBaselineMerged` 只改工作区里的跟踪 `.tiller/project.json`，造成偶发脏树。维护者与执行 AI 需要这三项按根因收口，与 #43「start 只写 worktree」同精神。

## 目标

一次性按根因修这三项：`verify` 在 standard 且设计未确认时拒跑（可观测错误），并提供一键清除过早 verify 段的能力，避免手工改 `task.md`；`init` 受管产物只写入 init 任务 worktree，primary 不预建 `.tiller/` 文档树 / 未跟踪种子；合入后不再靠改跟踪 `project.json` 标记 merged（本地状态进 `.tiller/local/`，或合入证明不脏工作区）。版本保持 0.5.0。`--requirement` 短目标通道不改。

## 业务范围

- 做：改 `src/` 中 `initialize` / `createInitBaseline` / `markInitBaselineMerged` / `proveInitBaselineMerged` / `verifyFlow` / 可选 clear 子命令或 confirm 修复路径；更新受管文档一句、initialization/workflow specs 与 decisions；CASE + 测试；必要 CLI/usage。
- 不做：升版本；放开 `--requirement` 多行完整需求；给 `pr`/`pull` 加“忽略未跟踪”特判作为主修复；CloudAgent；合入本 PR（由人审阅）；扩大到无关重构。
- 假设：init 后、人工合入前，primary 可以没有完整 `.tiller/` 骨架；门禁可从 init worktree 或 `.tiller/local/` 读取 pending 基线。merged 证明优先 git 祖先 / 平台 API，本地标记仅缓存且不修改已跟踪 `project.json`。

## 关键行为

1. **verify 顺序**：standard 任务在尚无有效设计确认时，`verify` 直接失败（稳定错误码 + 中文说明须先 `confirm … design`），不写入 verify 段。若历史已有过早 verify 段，提供一键清除（如 `tiller verify <id> --clear-premature` 或等价命令），清除后可再确认设计；过程卫生门禁（check/accept）仍保留。
2. **init 只写 worktree**：有 Git HEAD 并创建初始化基线时，受管改动（含 `.tiller/**`、`AGENTS.md`、`.gitignore`、平台模板、`project.json`、空目录 gitkeep 等）只 `apply`/提交到 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees`；primary 不预写这些文档，也不再依赖「先写 primary 再 cleanup」作为主路径。失败回滚不在 primary 留未跟踪受管树。
3. **initBaseline 不脏跟踪文件**：init PR 内 `project.json` 记录基线 id/branch/commit（及初始 status 若保留）；`markInitBaselineMerged` / doctor / merge / close 证明合入后，把 merged 记在 `.tiller/local/`（已 gitignore），**不**把跟踪的 `.tiller/project.json` 改成仅工作区脏的 `status: merged`。primary 在 init 成功后对受管文件无未跟踪残留（含不再保留 META 最小例外）。

## 异常与边界

- 无 Git / 无法建 worktree：保持现有降级（可写 primary），并警告；不假装已建基线。
- 重复 init / 已有 initBaseline：不新建冲突分支，行为与现网一致。
- 已合入但 local 标记缺失：祖先或平台证明仍可通过，并补写 local 标记。
- small / 无设计门禁的任务：`verify` 不套用「先设计后验证」拒绝。
- 用户手工改过的 primary 文件：init 清理/不写路径不得覆盖或误删。

## 验收条件

- AC-1: standard 任务在有效设计确认前执行 `verify` 被拒绝且不写入验证段；若已有过早验证段，一键清除后可继续设计确认；过程卫生门禁仍在
- AC-2: 有 Git 的首次 `init` 成功后，primary 工作区对受管文件无未跟踪残留（含 `.tiller/project.json`）；全部 init 产物仅在 init worktree 提交中；合入/close/doctor 证明 merged 后跟踪的 `project.json` 不被改成仅工作区脏
- AC-3: 相关 CASE/测试与 package smoke 通过；版本保持 0.5.0；CLI/usage/decisions 反映上述行为
