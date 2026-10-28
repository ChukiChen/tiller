# status叠合入证明与cleanup日志字段对齐

<!-- tiller-task:v1 {"version":1,"id":"20261028-status-cleanup","type":"improvement","size":"standard","created":"2026-10-28T06:38:41.896Z","base":"5c9189449417082dc28b8732e880e43db72aa216","scope":["src","test",".tiller/cases",".tiller/specs"],"format":"structured","slug":"status-cleanup","summary":"对齐 status 与 cleanup 日志呈现"} -->

## 需求

### 使用场景

- 场景：dogfood 后 init 已合入且 doctor 通过，用户执行 `tiller status` 仍看到 `initBaseline.status=pending`，误以为未合入。
- 场景：close/merge 已拆除任务本机目录（含日志），返回 JSON 却写 `logsRemoved=false`，机器消费者误判日志未清理。

### 目标

对齐状态与清理结果的呈现：`status` 反映当前 init 合入结论；cleanup 如实报告日志是否已不存在。不恢复把 `merged` 写回跟踪 `project.json` 的旧做法。

### 业务范围

- 做：`tiller status` 在 init 已合入时可观察结论为已合入；close/merge cleanup 在日志已随拆除消失时不再假报 `logsRemoved=false`；配套 CASE 与回归测试。
- 不做：改写跟踪 `project.json` 的 `initBaseline.status` 为合入后强制 `merged`；恢复 runtime/launcher/closed；扩大 hygiene 其他行为。
- 假设：合入证明仍以本机 marker + 平台/祖先证明为准（既有 `proveInitBaselineMerged`）。

### 关键行为

#### status 叠证明
- 当证明结论为已合入时，`tiller status` 对用户可见的 init 状态不得只剩误导性的 `pending`。
- 允许保留跟踪元信息原始字段，但须同时给出当前证明结论（例如 `merged` / `proved` / 等价展示）。

#### cleanup 日志字段
- 若清理前任务日志目录存在，或日志位于将被拆除的任务 worktree/本机目录内，清理后日志路径已不存在时，返回必须表示日志已清理。
- 不得在整棵本机任务目录已删除的情况下仍固定输出 `logsRemoved=false`。

### 异常与边界

- 无 initBaseline 时 status 不伪造合入结论。
- 证明失败/未合入时不得显示已合入。
- 清理失败仍须保留失败警告；本任务只修正“已拆除却假报未删日志”的呈现。

### 验收条件

- AC-1: init 已合入时 tiller status 展示当前证明结论为已合入（不得仅回显跟踪元信息里的 pending 误导用户）；跟踪 project.json 可不改写 status 字段
- AC-2: close/merge cleanup：若任务日志曾存在且最终随 worktree 或本机任务目录拆除而不再存在，返回不得再报 logsRemoved=false；须如实表示已清理（true 或等价字段如 removedWithWorktree）

## 设计

### 方案

1. **status**：在现有 status 组装处调用与 doctor 同源的合入证明（`proveInitBaselineMerged` 或读取本地 merged marker）。输出中增加当前结论字段（优先复用/覆盖用户可见的 `initBaseline.status` 展示为 `merged`，或并列 `initBaseline.provedStatus`/`currentStatus`）；**不**把该结论写回跟踪 `project.json`。
2. **logsRemoved**：在 `cleanupTaskWorktrees` 中，拆除 worktree **之前**探测 primary 与任务本机 `logs` 是否存在；拆除后若日志路径已不存在且清理前曾存在（或日志必然落在已拆除的本机任务树内），则 `logsRemoved=true`（若保留区分语义，可另加 `removedWithWorktree`，但 AC 要求不得再假报 false）。同步 CASE/测试。

### 失败处理

- 证明调用失败：status 可保留原始 pending 并附 warning/issues，不得谎报 merged。
- 清理路径不安全或删除失败：维持现有 warnings；不得把失败伪装成已清理。

### 取舍

- 不把 merged 写进跟踪 project.json：避免跨 clone 脏跟踪树；与既有 hygiene 决策一致，只修呈现层。
- logsRemoved 优先修正布尔语义为“清理后日志已不存在”，避免再引入易被忽略的新字段却仍输出 false。

### 影响与风险

- 影响：`tiller status` JSON、close/merge 返回的 cleanup 字段、相关 CASE/单测。
- 风险：依赖 status 原样回显 project.json 的脚本需适配；以 AC 与 CASE 锁定新契约。

### 验证入口

- 单测：status 在有 local merged marker / 证明已合入时展示 merged；cleanup 在日志仅存在于任务本机树并随拆除消失时 `logsRemoved=true`。
- 包内 node:test 全量 + 相关 CASE。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-28T06:38:59.648Z | 5c9189449417 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"d4358f97ffe31fb53cee3a27f2a1a9ebc786c9fce925d5a7f8ebc1fcd2f2b2db","commit":"5c9189449417082dc28b8732e880e43db72aa216","by":"boon yu","quote":"","at":"2026-10-28T06:38:59.648Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
