# 修复 abandon 在 worktree cwd 清理失败假成功

<!-- tiller-task:v1 {"version":1,"id":"20261029-fix-abandon-worktree-cwd","type":"bugfix","size":"standard","created":"2026-10-29T10:47:14.780Z","base":"54250ad578daecdcf6713d6eee75e08870fef8fe","scope":["src","test",".tiller/specs",".tiller/cases",".tiller/context"],"format":"structured","slug":"abandon-worktree-cwd","summary":"worktree cwd 下 abandon 先切出并传播清理失败"} -->

## 需求

### 使用场景

- 场景：从任务 worktree 内执行 close --abandon 时先切出 cwd，并在本地清理失败时非零退出，不再假报已放弃。

### 目标

需求来源：`.tiller/specs/modules/workflow/surefire-abandon.md`

从任务 worktree 内执行 close --abandon 时先切出 cwd，并在本地清理失败时非零退出，不再假报已放弃。

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“从任务 worktree 内执行 close --abandon 时先切出 cwd，并在本地清理失败时非零退出，不再假报已放弃。”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-3：在任务 worktree（含其子目录）执行 accepted close --abandon 时，删除前将 cwd 切出待删目录；成功后任务 worktree、.tiller/local/<id>/、存在的本地与远端任务分支均消失，仍不写 primary task.md/CASE 且不产生提交
- AC-4：abandon 任一本地清理项失败（含 Windows EBUSY 有界短重试耗尽）时返回非零退出与 ok:false，错误码为 TASK_CLEANUP_FAILED，且不得返回已放弃成功结果

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-3: 在任务 worktree（含其子目录）执行 accepted close --abandon 时，删除前将 cwd 切出待删目录；成功后任务 worktree、.tiller/local/<id>/、存在的本地与远端任务分支均消失，仍不写 primary task.md/CASE 且不产生提交
- AC-4: abandon 任一本地清理项失败（含 Windows EBUSY 有界短重试耗尽）时返回非零退出与 ok:false，错误码为 TASK_CLEANUP_FAILED，且不得返回已放弃成功结果

## 设计

### 方案

需求来源：`.tiller/specs/modules/workflow/surefire-abandon.md`

设计来源：`.tiller/specs/modules/workflow/surefire-abandon-design.md`

在 `cleanupTaskWorktrees` 删除前识别 cwd 是否位于任务 worktree 或 `.tiller/local/<id>/`，命中则先切到 primary。worktree 的 Git 拆除和目录删除共用有界短重试；本机删除或本地分支删除失败汇总为 `TASK_CLEANUP_FAILED`，由 `closeFlow` 非零返回，不生成放弃成功结果。

### 失败处理

缺失项继续幂等处理，非致命远端告警保持 warning。cwd 切换失败、worktree/任务目录删除失败或本地分支删除失败时保留仍存在的本机事实，返回 `TASK_CLEANUP_FAILED`，不报告“已放弃”。

### 取舍

不忽略 EBUSY 继续当成功，也不重新引入 persistAbandonedTask；失败后由用户解除占用并重试，避免假清理。

### 影响与风险

影响 `src/task-worktrees.ts`、`src/flow.ts`、`src/branch-cleanup.ts`、workflow specs、CASE 与测试。Linux/mac 成功路径保持兼容；Windows 通过先切出 cwd 和短重试缓解 EBUSY，测试覆盖 cwd 成功清理与失败传播。

### 验证入口

运行 `test/task-worktrees.test.mjs` 中引用 CASE-317、CASE-322 与新增失败传播用例的具名测试；再执行 `npm test`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-29T10:48:50.510Z | 54250ad578da | — |
| 设计 | ChukiChen | 2026-10-29T10:48:53.129Z | 5f1dcefe4d22 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"1738c681f899bdf80ce077230edf4b4533d5f50e5a35eab543e2636a12ca89d7","commit":"54250ad578daecdcf6713d6eee75e08870fef8fe","by":"ChukiChen","quote":"","at":"2026-10-29T10:48:50.510Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"57366517d70ee07d9d47dc14e0f56fedc734bd6a8f3e8bef965df32c905aa5e3","commit":"5f1dcefe4d228afc316f19a190895514ce1c66ac","by":"ChukiChen","quote":"","at":"2026-10-29T10:48:53.129Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
