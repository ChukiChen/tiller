# doctor/close 对齐 worktree 任务真相

<!-- tiller-task:v1 {"version":1,"id":"20261027-lifecycle-truth","type":"feature","size":"small","created":"2026-10-27T14:20:04.916Z","base":"e32d0099f79df0ed92af835989ded84bd2367b11","scope":["src","test",".tiller"],"format":"structured"} -->

## 需求

### 使用场景

- 场景：doctor 从 active worktree 读任务；close/abandon 未合入或未落盘前不得删唯一任务事实；ready/next 诚实

### 目标

短目标：doctor 从 active worktree 读任务；close/abandon 未合入或未落盘前不得删唯一任务事实；ready/next 诚实

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“doctor 从 active worktree 读任务；close/abandon 未合入或未落盘前不得删唯一任务事实；ready/next 诚实”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：doctor 能发现并检查只存在于 worktree 的进行中任务，不得因 primary 无 .tiller/task 而全绿
- AC-2：close/abandon 在无合入证明或无法持久化放弃事实时拒绝破坏性清理，不得提示不可执行的 reopen
- AC-3：相关 CASE/测试与 package smoke 通过；版本 0.5.0

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-1: doctor 能发现并检查只存在于 worktree 的进行中任务，不得因 primary 无 .tiller/task 而全绿
- AC-2: close/abandon 在无合入证明或无法持久化放弃事实时拒绝破坏性清理，不得提示不可执行的 reopen
- AC-3: 相关 CASE/测试与 package smoke 通过；版本 0.5.0

## 设计

### 方案
- doctor：从 git worktree list / `.tiller/local/*/worktrees.json` 发现 active 任务 worktree，从 worktree 读 task.md 做覆盖检查；有 active worktree 却匹配不到任务时 warn/fail，不得全绿。
- close/abandon：无合入证明时拒绝删除唯一任务事实；abandon 须先持久化放弃事件再清理；无法持久化则拒绝；输出不得承诺不可执行的 reopen。
- ready/next：与对账结果一致。

### 影响面
src/doctor.ts、src/flow.ts close/abandon、相关 test/CASE、usage/decisions。

### 影响与风险
- 影响：doctor 与 close 行为收紧；可能阻断原先「未合入直接 close」捷径。
- 风险：误杀合法清理——合入证明判定要与现有 merge/ff 证据对齐。
- 回退：保持 0.5.0；不引入数据库。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T14:20:24.304Z | e32d0099f79d | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"88c742075c78fafd3f7dc41502cb212a374fbef8e9dcb41e2c862583c08f4ffa","commit":"e32d0099f79df0ed92af835989ded84bd2367b11","by":"boon yu","quote":"","at":"2026-10-27T14:20:24.304Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
