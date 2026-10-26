# specs 经任务 worktree 合入门禁

<!-- tiller-task:v1 {"version":1,"id":"20261026-specs-worktree-gate","type":"feature","size":"standard","created":"2026-10-26T15:07:31.316Z","base":"a7f8bfa0f816332c987d415724601ad612f8f0fc","scope":["src","test","resources","scripts",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/project.json",".tiller/usage.md"],"format":"structured","slug":"specs-worktree-gate","summary":"默认分支改specs时check门禁并强化文档"} -->

## 需求

### 使用场景

维护 tiller 的人与执行 AI 写全局或模块 `.tiller/specs/` 时，应先 `start` 任务，在任务 worktree 修改 specs，再随任务 PR 合入；避免在默认分支主工作区直接改 specs 并推送（对照 demo 直推 main 的偏差）。

### 目标

1. `check` 在检出位于 `main`/`master` 且本次相对任务基线（含未提交）触及 `.tiller/specs/` 时给出过程门禁（issue，阻断未验收交付）。
2. 任务分支 / worktree 上的合法 specs 改动不因此误报。
3. usage、core、delivery、CLI help 与示例只示范 `start` → worktree 写 specs → 随任务 PR 合入；写明禁止默认分支直改/直推；保持验收条件 `AC-n`、`requirement-file` 导入、无 `LIB-`/对照双套。
4. 版本保持 0.5.0。

### 业务范围

- 做：`evaluateFlow`/`check` 门禁；resources 与受管镜像（rules/usage/cli）；CASE 与测试；必要时 decisions 补一句；package-smoke 不示范直推。
- 不做：升版本；强制改写历史 demo 仓；改 CASE↔AC 关联模型。
- 假设：合法路径是在含任务编号的任务分支（worktree）上改 specs；`chore/tiller-init` 不是默认分支。

### 关键行为

1. 默认分支上相对基线改了 `.tiller/specs/` → `check` 报可定位的过程卫生 issue（提示经任务 worktree/PR 合入）。
2. 任务分支上改 specs → 不因本门禁失败。
3. 文档写明禁止默认分支直改/直推 specs，只示范正确路径。

### 异常与边界

- 已验收历史检查不因旧提交误阻断。
- 无 Git / 无法读当前分支时跳过本项。
- init 分支 `chore/tiller-init` 不触发本门禁。

### 验收条件

- AC-1: check 在 main/master 且变更含 .tiller/specs/ 时给出过程门禁（issue），任务分支同类改动不触发
- AC-2: usage、core、delivery、CLI 与示例仅示范 start→worktree 写 specs→任务 PR 合入，并写明禁止默认分支直改/直推；无 LIB-AC/对照双套与「验收条件（稳定）」新写法
- AC-3: 全量门禁与 package smoke 通过，版本 0.5.0

## 设计

### 方案

- 在 `evaluateFlow` 中，读取 `currentBranch(root)`；若为 `main`/`master`，且 `changedFiles`（相对任务 base，含工作区未提交）中存在 `.tiller/specs` 或以其为前缀的路径，则向 `issues` 推入过程卫生文案（明确「经任务 worktree 合入 / 勿在默认分支直改」）。
- 已验收（historicalAccepted）时跳过，避免历史复查误伤。
- 任务分支（如 `feat/20261026-…`）上同类 specs 变更不加本 issue；与现有 `branchNameWarning` 分工。
- 文档：`resources/usage.md`、`resources/rules/core.md`、`resources/rules/activities/delivery.md`、`src/cli.ts` help 强化「禁止默认分支直改/直推」；同步 `.tiller/` 受管镜像；decisions 可补一条短决定；示例与 smoke 不示范直推。保持 #37 AC 模型用语。

### 失败处理

- 无 Git 或读不到分支：跳过本检查（不因本项阻断）。
- 误报：仅当分支名为 main/master 时触发；init/任务分支不受影响。

### 取舍

- 用 **issue**（阻断 check/accept）而非仅 warning，以贴合「硬约束」；与过程卫生（设计前 verify）同级。
- 不在无任务上下文做全局 hooks；门禁挂在任务 `check`。
- 不改远程 force 策略，只做本地过程门禁 + 文档。

### 影响与风险

- 影响：`src/flow.ts`、tests、resources/rules/usage/cli、受管 digests。
- 风险：有人从 main 根目录跑 check 且主工作区误改了 specs 会被拦住——符合预期。
- 缓解：CASE 覆盖 main 触发与任务分支不触发。

### 验证入口

- `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T15:07:55.379Z | a7f8bfa0f816 | 修改 |
| 设计 | boon yu | 2026-10-26T15:07:55.463Z | a7f8bfa0f816 | 修改 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"b667658b6547d267a58adabdf78babefdf58b6af01521d2b6f6d40d1e6b9affa","commit":"a7f8bfa0f816332c987d415724601ad612f8f0fc","by":"boon yu","quote":"修改","at":"2026-10-26T15:07:55.379Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"bcbe1dec7e1d01b7d02eafc1085d0ea790463b9265bdb16d6ff9f73434c4d174","commit":"a7f8bfa0f816332c987d415724601ad612f8f0fc","by":"boon yu","quote":"修改","at":"2026-10-26T15:07:55.463Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-276 check blocks specs changes on the default branch$' \u002d\u002dtest-reporter=./.tiller/local/verify-KzJxub/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-KzJxub/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"b058dd39809b3dac5c1b0d10e93e3a524f042b64c4f733d0046ab5347742297e","commit":"a7f8bfa0f816332c987d415724601ad612f8f0fc"} -->
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-276 check blocks specs changes on the default branch
- 用例：CASE-276
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-specs-worktree-gate/logs/run-1.log
- 提交：a7f8bfa0f816
- 时间：2026-10-26T15:24:08.410Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-277 check allows specs changes on a task branch$' \u002d\u002dtest-reporter=./.tiller/local/verify-8Sj0Zi/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-8Sj0Zi/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"b058dd39809b3dac5c1b0d10e93e3a524f042b64c4f733d0046ab5347742297e","commit":"a7f8bfa0f816332c987d415724601ad612f8f0fc"} -->
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-277 check allows specs changes on a task branch
- 用例：CASE-277
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-specs-worktree-gate/logs/run-2.log
- 提交：a7f8bfa0f816
- 时间：2026-10-26T15:24:14.707Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-278 docs require specs changes through task worktrees and forbid direct default-branch changes$' \u002d\u002dtest-reporter=./.tiller/local/verify-OfXZqX/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-OfXZqX/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"b058dd39809b3dac5c1b0d10e93e3a524f042b64c4f733d0046ab5347742297e","commit":"a7f8bfa0f816332c987d415724601ad612f8f0fc"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-278 docs require specs changes through task worktrees and forbid direct default-branch changes
- 用例：CASE-278
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-specs-worktree-gate/logs/run-3.log
- 提交：a7f8bfa0f816
- 时间：2026-10-26T15:24:16.196Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-048 global cases use module kinds and scenarios with resolvable named tests$' \u002d\u002dtest-reporter=./.tiller/local/verify-4mIhbZ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-4mIhbZ/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"b058dd39809b3dac5c1b0d10e93e3a524f042b64c4f733d0046ab5347742297e","commit":"a7f8bfa0f816332c987d415724601ad612f8f0fc"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-048 global cases use module kinds and scenarios with resolvable named tests
- 用例：CASE-048
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-specs-worktree-gate/logs/run-4.log
- 提交：a7f8bfa0f816
- 时间：2026-10-26T15:24:24.069Z

## 自检

交付前运行 check；验收后运行 accept。
