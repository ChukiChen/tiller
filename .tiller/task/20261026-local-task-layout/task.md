# 本机 local 按任务聚合与 close 清旁路

<!-- tiller-task:v1 {"version":1,"id":"20261026-local-task-layout","type":"feature","size":"standard","created":"2026-10-26T02:41:17.364Z","base":"edf6a24c0722790e557e2e4ebc3a802b5d406568","scope":["src","test","resources",".tiller","README.md","AGENTS.md"],"format":"structured","plan":"20261026-local-task-layout","item":"P-1","slug":"local-task-layout","summary":"local 按 task-id 聚合且 close 清旁路","requirementFile":".tiller/local/20261026-local-task-layout-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 与演示工程的人。现状 `.tiller/local` 按类型拆成 `worktrees/<id>`、`logs/<id>`、`tasks/<id>` 三棵树，目录深且分散；`close`/`abandon` 只拆 worktree、清日志，并只删 `worktrees.json` 文件，旁路目录 `tasks/<id>/`（含 `pre-existing.json`）常残留。用户已确认：close 须清该任务旁路；布局改为以 task id 为根聚合；不引入平级 `.tiller-local`。

### 目标

需求来源：`.tiller/local/20261026-local-task-layout-req.md`

新任务本机目录改为 `.tiller/local/<task-id>/` 聚合 worktrees、logs 与旁路文件；`close`/`abandon` 拆除 worktree 后删除整个该任务本机目录（含旁路）。读路径对旧布局做兼容回退；写路径只写新布局。同步 docs/specs/tests。

### 业务范围

- 做：task-id-first 布局；project 与 workspace（保留 management + repositories/<id>）；close/abandon 清 worktrees+logs+sidecar 整目录；旧路径 close 兼容；usage/rules/workflow specs/decisions；用例与测试。
- 不做：不引入 `.tiller-local`；不改版本号；不自动 merge；不强制 migrate 已存在旧目录上的进行中任务（仅 close 兼容清理）；不改 reopen 自动重建。
- 假设与待确认：任务编号仍为 `YYYYMMDD-…`，不会与保留名 `logs`/`tasks`/`worktrees`/`runtime.json` 冲突；共享 task.md/specs 仍在主检出 `.tiller/`。

### 关键行为

1. project：`start` 后检出在 `.tiller/local/<id>/worktrees/`；旁路 `pre-existing.json`、`worktrees.json` 与 `logs/` 同级位于 `.tiller/local/<id>/`。
2. workspace：`.tiller/local/<id>/worktrees/management` + `.tiller/local/<id>/worktrees/<登记相对路径>`（常见 `repositories/<repo-id>`）。
3. `close`/`abandon` 后 `.tiller/local/<id>/` 整体不存在（幂等）；旧布局 `.tiller/local/worktrees|logs|tasks/<id>/` 亦被清理。
4. 新写入不再创建旧三棵树下的任务子目录。

### 异常与边界

- 旧进行中任务仍可能落在旧路径：close/abandon 须兼容拆除与清理，不得仅因缺新路径失败。
- close 时 worktree/日志/旁路部分缺失：幂等成功。
- start 目标路径已占用：失败且不留半套新任务目录。
- 不删除其他任务的 `.tiller/local/<other-id>/` 或旧布局旁路。

### 验收条件

- AC-1: project 模式下 start 在 .tiller/local/<任务编号>/worktrees/ 创建 git worktree；pre-existing.json、worktrees.json 与 logs/ 位于同一任务目录 .tiller/local/<任务编号>/；不再写入旧路径 .tiller/local/worktrees|tasks|logs/<id>/
- AC-2: workspace 模式下 start 在 .tiller/local/<id>/worktrees/management 与 .tiller/local/<id>/worktrees/<登记相对路径>（常见 repositories/<repo-id>）创建隔离检出；各仓同一任务分支名
- AC-3: close 与 abandon 拆除该任务全部 worktree 后删除整棵 .tiller/local/<id>/（含 logs 与旁路）；并对旧布局 .tiller/local/worktrees|logs|tasks/<id>/ 做兼容清理；缺失则幂等；不删其他任务本机目录
- AC-4: usage/rules/workflow specs/decisions 与设计写明新布局与生命周期；测试覆盖 project/workspace/新布局 close/旧布局 close；用例自 CASE-209 起

## 规划

- 规划：20261026-local-task-layout
- 条目：P-1

## 设计

### 方案

1. **任务本机根**：引入 `taskLocalRoot(id) = .tiller/local/<id>`。其下固定：
   - `worktrees/`：git worktree 容器
   - `logs/`：verify 日志
   - `pre-existing.json`、`worktrees.json`：旁路
2. **project**：检出路径 = `.tiller/local/<id>/worktrees/`（目录本身即 worktree 根）。
3. **workspace**：`.tiller/local/<id>/worktrees/management`；各业务仓 `.tiller/local/<id>/worktrees/<repository.path>`（常见 `repositories/<repo-id>`）。分支名仍 `类型/任务编号[-描述]`。
4. **写路径只写新布局**：`createTaskWorktrees` / `writeTaskWorktreeState` / pre-existing / verify 日志全部改用新根；不再创建 `.tiller/local/worktrees|tasks|logs/<id>/`。
5. **读与 close 兼容**：读 sidecar 时先新后旧；`cleanupTaskWorktrees` 先按清单/约定拆 git worktree（新根 + 旧根回退），再删除 `.tiller/local/<id>/` 整树，并 best-effort 删除旧三路径 `.tiller/local/{worktrees,logs,tasks}/<id>/`。
6. **`TaskWorktreeState.root`**：改为新 worktree 容器路径（`.tiller/local/<id>/worktrees`）；parse 时同时接受旧 root 以便清理旧清单。
7. **文档**：更新 usage、rules（core/delivery/documents/verification）、workflow requirements/design、decisions 一条；版本保持 0.5.0。

### 失败处理

- start 中途失败：回滚已建 worktree，并删除已创建的 `.tiller/local/<id>/`（若为空或仅本任务产物）。
- close 拆树失败：强制删目录并 warnings，不阻断关闭态写入（与现策略一致）。
- 路径必须落在 `.tiller/local/<id>/` 下，经安全路径校验；禁止删除 `local` 根或其他任务目录。

### 取舍

- 保留 `.tiller/local` 前缀，不建平级 `.tiller-local`（迁移成本高、收益主要是命名审美）。
- 以 task-id 为第一层，而不是继续按类型分叉，便于 close 一次清干净。
- 旧布局只做 close/读兼容，不做自动搬迁进行中任务（避免半迁移）。
- 继续保留 workspace 的 management worktree。

### 影响与风险

- 影响：`src/task-worktrees.ts`、`src/flow.ts`（pre-existing 与 logs 路径）、相关测试与受管文档。
- 风险：旧测试硬编码旧路径；进行中旧任务 close 漏清；`local` 下保留名与任务 id 冲突（任务 id 格式已规避）。
- 缓解：CASE-209+ 覆盖新写与旧清；全量 npm test；文档写明新旧对照。

### 验证入口

- `case add` 自 CASE-209；扩展 `test/task-worktrees.test.mjs`（及 pre-existing/日志相关断言）；结束全量 `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T02:41:34.213Z | edf6a24c0722 | 那就按刚才的讨论增加清理并优化目录 |
| 设计 | boon yu | 2026-10-26T02:41:34.313Z | edf6a24c0722 | 那就按刚才的讨论增加清理并优化目录 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"88e663fef0cb20cbc9e2a0f495f296d98d74df50d2a05cc81e14996525468872","commit":"edf6a24c0722790e557e2e4ebc3a802b5d406568","by":"boon yu","quote":"那就按刚才的讨论增加清理并优化目录","at":"2026-10-26T02:41:34.213Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"71a8fe0356591fb195863f6157ebaa39561c84448f23ba22b9d5d8eb80fcc7ae","commit":"edf6a24c0722790e557e2e4ebc3a802b5d406568","by":"boon yu","quote":"那就按刚才的讨论增加清理并优化目录","at":"2026-10-26T02:41:34.313Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
