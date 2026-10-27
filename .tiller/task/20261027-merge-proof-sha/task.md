# 合入证明绑定 PR head.sha

<!-- tiller-task:v1 {"version":1,"id":"20261027-merge-proof-sha","type":"feature","size":"standard","created":"2026-10-27T15:20:31.820Z","base":"80f42f948821f2a6a58caf7befe6431398c5a5cc","scope":["src/platform-api.ts","src/flow.ts","src/init-baseline.ts","test",".tiller/cases/modules/workflow/behavior.md"],"format":"structured"} -->

## 需求

### 使用场景

- 仓库 wipe/重建后仍复用历史任务编号与分支名（如 `feat/20261027-library-specs`）时，用户对「已验收但尚未为本 tip 创建/合入 PR」的任务执行 `close`。
- `close` / init-baseline 闸门需要平台合入证明；平台上同 head 分支可能已有多次历史 merged PR。

### 目标

合入证明必须把「当前任务分支 tip」与「平台已合入 PR/MR 的 head tip」绑在一起；禁止仅凭历史同名 head 分支判定已合入，避免误清未合入任务。

### 业务范围

- 做：收紧 `findMergedIntegration`（及 close / init-baseline 调用方）的合入证明匹配规则；补 CASE/测试覆盖分支名复用场景；版本保持 0.5.0。
- 不做：改写 tokenized-git / PR 创建路径；不引入 `.tiller/local/closed/` 或 materialize；不扩大 doctor 语义；不顺带清软摩擦清单其余项。
- 假设：GitHub pull 的 `head.sha`（或等价 tip）与本地/任务分支 tip 可比对；GitLab MR 用等价 source tip / merge 回执字段。

### 关键行为

- AC-1：仅当 merged PR/MR 的 head tip 与当前任务分支 tip 匹配时，才视为合入证明；历史同名分支的旧 merged PR 不得放行。
- AC-2：无匹配 tip 时 `close` 返回 `CLOSE_MERGE_PROOF_MISSING` 且不破坏性清理；CASE+测试锁住；0.5.0。

### 异常与边界

- API 无 tip / tip 不可比时视为证明不足，不得放行清理。
- squash merge 后若平台仍暴露合入前 head tip，优先用该 tip 与任务 tip 比对；不得退回「任意同分支 merged」。
- 输入无效、token/API 不可用时返回明确错误，不静默把历史同名 PR 当证明。

### 验收条件

- AC-1: findMergedIntegration（及 close/init-baseline 调用方）仅当 merged PR/MR 的 head.sha（或等价 tip）与当前任务分支 tip 匹配时才视为合入证明；历史同名分支的旧 merged PR 不得放行。
- AC-2: 无匹配 tip 时 close 返回 CLOSE_MERGE_PROOF_MISSING 且不破坏性清理；CASE+测试锁住复用分支名场景；版本保持 0.5.0。

## 设计

### 方案

1. 扩展 `findMergedIntegration`：在按 head/source branch 列出候选 merged PR/MR 后，读取每条的 `head.sha`（GitHub）或等价 tip（GitLab），与调用方传入的**当前任务分支 tip** 比对；只返回 tip 匹配的那一条。
2. close / init-baseline 传入当前 tip（任务 worktree 或分支 tip），不得只传分支名。
3. 无匹配 → 证明不足；close 保持 `CLOSE_MERGE_PROOF_MISSING`，不删 worktree/分支/任务事实。
4. 测试：模拟「同分支多名历史 merged PR + 当前 tip 未出现在任一 head.sha」→ 证明不足；「当前 tip 命中最新 merged head.sha」→ 证明成立。

### 失败处理

- tip 缺失或 API 字段不全：按证明不足处理。
- 不回退到「同分支任一 merged 即通过」。

### 取舍

- 选 tip 绑定而非仅 merge commit 祖先检查：直接对应报告根因，改动面小，覆盖 wipe 后复用分支名。
- 不在本任务做完整跨平面状态机；只修合入证明匹配。

### 影响与风险

- 影响：`src/platform-api.ts`、`src/flow.ts`、`src/init-baseline.ts`、相关测试。
- 风险：旧测试若依赖「同分支任意 merged」需同步改写；真实 tip 与 API head.sha 不一致时会更严（符合预期）。

### 验证入口

- 单测覆盖 tip 匹配 / 历史同名误判拒绝。
- `npm test` + `npm run test:package`；版本 0.5.0。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T15:26:27.203Z | 80f42f948821 | — |
| 设计 | boon yu | 2026-10-27T15:26:27.359Z | 20d6d6b2e952 | — |
| 交付验收 | boon yu | 2026-10-27T15:35:26.102Z | 6973bb7ac7a3 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"b7ad8dcc0a72d362db28e36fcbc9c649c7374d8db225032296af83e413698fe4","commit":"80f42f948821f2a6a58caf7befe6431398c5a5cc","by":"boon yu","quote":"","at":"2026-10-27T15:26:27.203Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"de6aef675d6435a4a66a1323045f21d4e3f2f8bb0ef88d2ffd023ad59c5ae9ea","commit":"20d6d6b2e952578e0fc3134878fe8d6bd5bf53c3","by":"boon yu","quote":"","at":"2026-10-27T15:26:27.359Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"fa8ee87df4177132fbbb64baacbe62c6d90b805fddec74df641c3e370ec0db10","commit":"6973bb7ac7a35181cb64288150f89c747f827e37","by":"boon yu","quote":"","at":"2026-10-27T15:35:26.102Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-318 merged integration matches only the current branch tip$' \u002d\u002dtest-reporter=./.tiller/local/verify-WJ8jBD/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-WJ8jBD/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"d26b7e3ba997dc4af4a77137e58a3b1a71fd42f34863bba63ad32316620e7607","commit":"6973bb7ac7a35181cb64288150f89c747f827e37"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-318 merged integration matches only the current branch tip
- 用例：CASE-318
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-merge-proof-sha/logs/run-1.log
- 提交：6973bb7ac7a3
- 时间：2026-10-27T15:35:11.901Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-318 close rejects historical same-branch merges until the current tip matches$' \u002d\u002dtest-reporter=./.tiller/local/verify-MCp6Mx/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-MCp6Mx/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"d26b7e3ba997dc4af4a77137e58a3b1a71fd42f34863bba63ad32316620e7607","commit":"6973bb7ac7a35181cb64288150f89c747f827e37"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-318 close rejects historical same-branch merges until the current tip matches
- 用例：CASE-318
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-merge-proof-sha/logs/run-2.log
- 提交：6973bb7ac7a3
- 时间：2026-10-27T15:35:11.901Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-318 merged integration matches only the current branch tip$' \u002d\u002dtest-reporter=./.tiller/local/verify-U06G3u/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-U06G3u/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"d26b7e3ba997dc4af4a77137e58a3b1a71fd42f34863bba63ad32316620e7607","commit":"6973bb7ac7a35181cb64288150f89c747f827e37"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-318 merged integration matches only the current branch tip
- 用例：CASE-318
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-merge-proof-sha/logs/run-3.log
- 提交：6973bb7ac7a3
- 时间：2026-10-27T15:35:17.210Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-318 close rejects historical same-branch merges until the current tip matches$' \u002d\u002dtest-reporter=./.tiller/local/verify-npsGY8/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-npsGY8/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"d26b7e3ba997dc4af4a77137e58a3b1a71fd42f34863bba63ad32316620e7607","commit":"6973bb7ac7a35181cb64288150f89c747f827e37"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-318 close rejects historical same-branch merges until the current tip matches
- 用例：CASE-318
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-merge-proof-sha/logs/run-4.log
- 提交：6973bb7ac7a3
- 时间：2026-10-27T15:35:17.210Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 146 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 69 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 165 条用例及经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/modules/initialization/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/initialization/design.md`（“## <方案>” + 取舍与影响）；`.tiller/specs/modules/standards/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/standards/design.md`（“## <方案>” + 取舍与影响）。纯过程性变更可忽略。
