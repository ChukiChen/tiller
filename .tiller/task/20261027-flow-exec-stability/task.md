# 流程稳定执行

<!-- tiller-task:v1 {"version":1,"id":"20261027-flow-exec-stability","type":"feature","size":"standard","created":"2026-10-27T00:23:18.888Z","base":"55162d869c7872d33db9c577be0f5f9c813812db","scope":["src","test","resources","scripts",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/project.json","AGENTS.md",".tiller/index.md",".tiller/context",".tiller/task"],"format":"structured","slug":"flow-exec-stability","summary":"统一交付通道与过程卫生自检","requirementFile":".tiller/specs/modules/workflow/flow-exec-stability.md"} -->

## 需求

### 使用场景

维护 tiller 的人与执行 AI 按官方路径交付功能时，需要一条稳定、可拦截、可自检的主路径：创建真实 PR、合入清理幂等、过程卫生可检查，避免「草稿再手搓 API」、默认分支直改 specs、双套 AC 编号或合入后再改共享任务记录。

### 目标

需求来源：`.tiller/specs/modules/workflow/flow-exec-stability.md`

1. 单一交付通道：`tiller pr` 经平台 HTTP API 推送任务分支并创建真实 PR/MR（非仅草稿）；与既有 `merge` squash、`push` API 路径统一；缺 token 时给出清晰中文提示。
2. 可执行阶段机与硬门禁：保持并强化过程卫生（specs 经任务 worktree、requirement-file 仅 specs、AC-n 由文件导入）；文档/usage/AGENTS/CLI 只描述主路径，不示范草稿手搓或默认分支直推 specs。
3. 单一数据模型：任务 AC ≡ specs 路径作用域 `AC-n`；CASE 挂需求文件、关联 AC 为「无」；覆盖只认 verify 图；新写入禁止 `LIB-` 前缀、「对照」平行列表与「验收条件（稳定）」作主标题（历史别名可解析）。
4. worktree/close 幂等：在任务 worktree 根执行 merge/close 时也能干净删除本地/远端分支；远端已删或 422 视为成功或安静 warning；重复 close 安全。
5. 验收与记录闭环：accept 必须在 pr 前；合入后不再改写共享 `.tiller/task/<id>/task.md`；PR 五段正文与 verify 摘要由 tiller 生成。
6. 自检入口：提供 `doctor`（或等价）过程卫生扫描（基线、默认分支 specs 脏改、AC 覆盖缺口提示、残留任务分支等），全流程演示可将其视为绿条。

版本保持 0.5.0。

### 业务范围

- 做：增强 `pr`/`platform-api` 交付通道；`branch-cleanup`/`close`/`merge` 幂等；`doctor` 自检；文档与受管镜像只留主路径；CASE 与测试；必要时 decisions 补记；整合既有 case-req-link / ac-criteria-link / specs-worktree-gate 正确行为，不回退。
- 不做：升版本；CloudAgent；依赖平台 CLI；改 CASE↔AC 关联模型为用例内写 AC 号；强制重写全部历史 task.md。
- 假设：token 仍为 `GITHUB_TOKEN`/`GH_TOKEN` 或 `GITLAB_TOKEN`/`GL_TOKEN`；本地 git 二进制负责 worktree/commit；网页合入后仍可手动 close。

### 关键行为

1. `tiller pr <id>` 在已验收且任务记录已提交时：生成五段说明 → 推送任务分支（若需要）→ API 创建 PR/MR → 返回 URL 与编号；可选 `--draft-only` 仅输出草稿不联网。
2. `tiller merge` / `tiller close` 在 cwd 为任务 worktree 根时：先拆 worktree，再从主仓删除本地分支；远端分支已不存在不失败。
3. `tiller doctor [path]`（名称以实现为准）输出过程卫生结论；严重项非零退出，可供演示绿条。
4. 文档不再把「只出草稿再手搓 API」写为主路径。

### 异常与边界

- 缺 token / API 失败：pr 失败并提示配置 token；不静默降级为成功。
- 分支已推送且 PR 已存在：幂等返回已有 PR 或给出明确中文提示（实现选一种并测稳）。
- 重复 close：本机目录已不存在时成功或明确已清理。
- 历史「验收条件（稳定）」标题仅作解析别名；新模板与示例只用「验收条件」。

### 验收条件

- AC-1: tiller pr 在具备 token 时经平台 API 推送任务分支并创建真实 PR/MR，返回 URL；缺 token 有中文提示；--draft-only（或等价）可仅生成草稿；文档主路径不再要求手搓 API
- AC-2: 过程卫生与数据模型保持并强化：specs 经任务合入门禁、requirement-file/AC-n 导入、无 LIB-/对照/「验收条件（稳定）」新主路径写法；usage/rules/AGENTS/CLI 只描述主路径
- AC-3: 在任务 worktree 根执行 merge/close 可干净删除本地与远端任务分支；远端已删安静处理；重复 close 安全；合入后 close 不改写共享 task.md
- AC-4: doctor（或等价自检）可扫描过程卫生（含基线状态、默认分支 specs 脏改、残留任务分支等可测项）并以退出码表达是否通过
- AC-5: 全量 build/lint/typecheck/test 与 package smoke 通过，版本 0.5.0

## 设计

### 方案

- **单一交付通道**：扩展 `draftPullRequest` / CLI `pr`：默认在验收且记录已提交后，调用既有 `pushBranch` + `createPullRequest`/`createMergeRequest` 创建真实 PR/MR，返回 URL/编号；保留 `--draft-only` 仅输出五段草稿。`merge` 继续 API squash；文档与 help 主路径改为 `accept → pr（真实 PR）→ merge/close`，删除「只出草稿再手搓 API」示范。
- **阶段机与门禁 / 单一数据模型**：保留 specs-worktree-gate、requirement-file/AC-n 导入；扫文档与模板，确保新主路径无 `LIB-`、「对照」平行列表、「验收条件（稳定）」作标题；历史别名解析可保留。
- **worktree/close 幂等**：`cleanupTaskBranches` / `closeFlow` 在传入路径为任务 worktree 时解析到主仓根再删本地分支；先 `cleanupTaskWorktrees` 再删分支；远端 404/422/已不存在视为已清理；重复 close 对本机缺失目录成功返回。
- **记录闭环**：维持 accept→pr 门禁与合入后 close 不改写共享 task.md；PR 五段与 verify 摘要继续由 tiller 生成。
- **doctor**：新增 `tiller doctor [path]`（或 `check --doctor`），扫描 init 基线、默认分支上未提交/未合入的 specs 脏改、可识别的残留任务分支等，以退出码表达是否通过；任务级 `check` 行为保持。

### 失败处理

- 缺 token / API 失败：pr 非零退出并中文提示，不伪造成功。
- 本地分支因仍被其它 worktree 占用：先拆本任务 worktree；仍失败则 warning，不回滚已合入。
- doctor 发现严重项：非零退出并列路径/分支名。

### 取舍

- 增强 tiller 自有 `pr`/`merge`，不引入第二套外部脚本通道。
- doctor 独立命令，避免无任务 id 时滥用 `check`。
- `--draft-only` 保留离线/预览能力，默认联网创建。

### 影响与风险

- 影响：`src/pr.ts`、`cli.ts`、`branch-cleanup.ts`、`flow.ts`、`platform-api.ts`（若需）、tests、resources/rules/usage/AGENTS、受管镜像 digests。
- 风险：已有自动化若解析「仅草稿」输出需适配；缓解：保留 `--draft-only` 与稳定五段字段，JSON 增加 `url`/`number`。
- 不回退 case-req-link / ac-criteria-link / specs-worktree-gate。

### 验证入口

- `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T01:01:33.788Z | 55162d869c78 | 优化你说的这些 |
| 设计 | boon yu | 2026-10-27T01:01:33.867Z | 55162d869c78 | 优化你说的这些 |
| 交付验收 | boon yu | 2026-10-27T01:02:24.397Z | c816bc86f1f6 | 优化你说的这些 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"4447ae58b77b95eb23dd9fba6d43f328d70baf0b62738b169c16e3567f6ec531","commit":"55162d869c7872d33db9c577be0f5f9c813812db","by":"boon yu","quote":"优化你说的这些","at":"2026-10-27T01:01:33.788Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"8c5d15130c95625ae75e813a60259a755ead2aec9f62fecbd7f0e372006a03a0","commit":"55162d869c7872d33db9c577be0f5f9c813812db","by":"boon yu","quote":"优化你说的这些","at":"2026-10-27T01:01:33.867Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"fbd52529dd1bc05db31c5c0a2c38e5e3b28cfdafcb7a7cd066f49e49cf697140","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a","by":"boon yu","quote":"优化你说的这些","at":"2026-10-27T01:02:24.397Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-279 pr 经 API 创建真实 PR 并返回 URL$' \u002d\u002dtest-reporter=./.tiller/local/verify-DDFhuE/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-DDFhuE/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-279 pr 经 API 创建真实 PR 并返回 URL
- 用例：CASE-279
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-17.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:07.484Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-284 pr draft-only 仅输出草稿不联网$' \u002d\u002dtest-reporter=./.tiller/local/verify-pCmPrN/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-pCmPrN/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-284 pr draft-only 仅输出草稿不联网
- 用例：CASE-284
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-18.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:12.450Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-282 docs use the real pr path without a hand-built API alternative$' \u002d\u002dtest-reporter=./.tiller/local/verify-OvfDZO/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-OvfDZO/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-282 docs use the real pr path without a hand-built API alternative
- 用例：CASE-282
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-19.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:14.382Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-282 docs use the real pr path without a hand-built API alternative$' \u002d\u002dtest-reporter=./.tiller/local/verify-ROjJ28/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ROjJ28/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-282 docs use the real pr path without a hand-built API alternative
- 用例：CASE-282
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-20.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:14.929Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-280 worktree 根 close 可删本地任务分支$' \u002d\u002dtest-reporter=./.tiller/local/verify-I9s8e0/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I9s8e0/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-280 worktree 根 close 可删本地任务分支
- 用例：CASE-280
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-21.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:15.479Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-283 合入后 close 不改共享 task\\.md 且重复 close 安全$' \u002d\u002dtest-reporter=./.tiller/local/verify-avIFVk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-avIFVk/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-283 合入后 close 不改共享 task.md 且重复 close 安全
- 用例：CASE-283
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-22.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:17.475Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-281 doctor 过程卫生扫描与退出码$' \u002d\u002dtest-reporter=./.tiller/local/verify-mRUisz/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mRUisz/report.jsonl test/doctor.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-4
- 测试：test/doctor.test.mjs::CASE-281 doctor 过程卫生扫描与退出码
- 用例：CASE-281
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-23.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:19.297Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-113 CASE-157 migration preserves the 0\\.5\\.0 release contract and full verification entry$' \u002d\u002dtest-reporter=./.tiller/local/verify-U07yiJ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-U07yiJ/report.jsonl test/work-migration.test.mjs","exitCode":0,"tree":"7d851dc17dde2cbb186471bbcdc23f286dfe24bfec49c1b2f991d61a8d17a905","commit":"c816bc86f1f6ebe8daaa66396e6d70658b46651a"} -->
- 条件：AC-5
- 测试：test/work-migration.test.mjs::CASE-113 CASE-157 migration preserves the 0.5.0 release contract and full verification entry
- 用例：CASE-113, CASE-157
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-flow-exec-stability/logs/run-24.log
- 提交：c816bc86f1f6
- 时间：2026-10-27T01:02:20.590Z

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
- 112 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 133 条用例及经过它的场景 CASE-055, CASE-001。
