# PR 前同步任务记录

<!-- tiller-task:v1 {"version":1,"id":"20261026-pr-task-sync","type":"feature","size":"standard","created":"2026-10-26T03:08:40.869Z","base":"f853f382197358bb11ebb56812c29b2848a27ed9","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","slug":"pr-task-sync","summary":"PR 前强制同步任务记录","requirementFile":".tiller/local/20261026-pr-task-sync-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 交付流程的人。现状：check/accept/close 会改写 task.md，相关 cases/specs 回写也可能只在工作区；pr 只读当前文件与 Git 生成草稿，不检查这些任务记录是否已进入任务分支提交。结果是 PR 合入后主仓仍可能缺确认/验证事实，或像 20261026-local-task-layout 那样收尾后留下未提交的 task.md。

### 目标

开 PR（tiller pr）时，要求本任务的任务记录（至少 .tiller/task/<id>/）相对任务分支 HEAD 已提交；文档写明先提交含确认/验证的任务记录再 pr。合入后 accept/close 若再改 task.md，仍须另行提交——主修是 PR 时同步。顺带把已关闭任务 20261026-local-task-layout 遗留的未提交 task.md（验收+关闭段）纳入本 PR 合入。

需求来源：`.tiller/local/20261026-pr-task-sync-req.md`

### 业务范围

- 做：pr 对未提交任务记录硬门禁；文档/rules/usage/decisions 同步；测试与用例；清理已关闭任务遗留 dirty task.md。
- 不做：不自动 git commit；不改托管平台联网开 PR；不强制 accept/close 自动提交；不引入 allow-dirty-records（首版）；不改版本号；不合入本 PR。
- 假设与待确认：合入后 accept/close 的补提交靠文档约定即可，本任务不实现自动提交。

### 关键行为

1. 用户或代理在 verify/check（及必要 cases/specs 回写）后，先提交含本任务 task.md 等记录的改动，再运行 pr。
2. pr <id> 若发现本任务 .tiller/task/<id>/ 或 scope 内 .tiller/cases/、.tiller/specs/ 相对 HEAD 有未提交改动，则失败并列出路径；干净时生成既有五段草稿。
3. 本 PR 合入后，已关闭任务 20261026-local-task-layout 的验收与关闭记录出现在主仓，不再以脏工作区形式残留。

### 异常与边界

- 无 Git / 无法读工作树：与现有 pr 行为对齐（跳过门禁或保留既有 warning），并在用例中固定。
- 仅其他任务的 .tiller/task/<other>/ 脏：不阻断本任务 pr；遗留清理作为本任务显式改动提交。
- check 写自检导致本任务 task.md 变脏：符合预期，须在 pr 前提交。

### 验收条件

- AC-1: pr 在本任务 task.md（或 .tiller/task/<id>/ 下文件）相对 HEAD 有未提交改动时默认失败，错误信息列出路径；干净时可生成五段草稿
- AC-2: 文档（usage、delivery rules、必要时 decisions/workflow specs）写明 PR 前须提交任务记录，以及 accept/close 后仍可能需补提交
- AC-3: 已关闭任务 20261026-local-task-layout 的验收与关闭内容随本任务分支提交，合入后主仓不再遗留该脏文件
- AC-4: 用例与测试覆盖脏阻断与干净通过；全量 build/lint/typecheck/test/test:package 通过；版本保持 0.5.0

## 设计

### 方案

1. **`pr` 门禁（主修）**：在 `draftPullRequest`（及 CLI）生成草稿前，检查相对 `HEAD` 的未提交改动中，是否包含：
   - 本任务记录目录 `.tiller/task/<id>/`（含 `task.md`）；
   - 以及任务 `scope` 内、同属 tiller 共享记录且常随交付回写的路径：至少 `.tiller/cases/`、`.tiller/specs/`（若 scope 覆盖到）。
   命中则默认 **失败**（错误码如 `PR_TASK_RECORDS_DIRTY`），列出相对路径；干净则照常输出五段草稿。不自动 `git commit`。
2. **探测实现**：复用 flow 已有 Git porcelain/diff 能力；与 `check` 的 `taskRecordPath` 豁免相反——`pr` **专门**盯任务记录是否已进分支，避免「草稿读到未入库事实」。
3. **文档**：usage、delivery rules、decisions（及必要时 workflow specs）写明：`verify`/`check`（及 cases/specs 回写）之后、`pr` 之前须提交任务记录；合入后 `accept`/`close` 若再改 `task.md`，须另作收尾提交（本版本不自动提交）。
4. **遗留清理（AC-3）**：将主工作区未提交的 `.tiller/task/20261026-local-task-layout/task.md`（验收+关闭）纳入本任务分支提交，随 PR 合入主仓。

### 失败处理

- 脏记录：阻断 `pr`，提示先提交列出的路径后重试；不改工作区。
- 无 Git / 无法读工作树：与现有 `pr`/commit 检查一致，跳过门禁并保留既有 warning，或明确提示（与 `taskCommits` 行为对齐，选更可测的一种并在用例固定）。
- 仅其他任务的 `.tiller/task/<other>/` 脏：不阻断本任务 `pr`（除非该路径落入本任务显式改动且被纳入本次提交意图；门禁范围限于本任务 id + scope 内 cases/specs）。

### 取舍

- **失败优于仅警告**：用户要求 PR 时同步，软警告易被忽略（与此前回写 warning 同类问题）。
- **不自动提交**：保留「本地提交须授权」原则；门禁促使人/代理显式提交。
- **不在本次让 accept/close 自动 commit**：主修 PR 时点；收尾提交用文档约定，避免扩大授权面。
- **不引入 `--allow-dirty-records`（首版）**：需要逃生阀时再加；首版保持简单硬门禁。

### 影响与风险

- 影响：`src/pr.ts`、CLI、`test/pr.test.mjs`（及必要 flow 辅助）、resources/受管 usage 与 delivery rules、decisions；可能触及 workflow specs。
- 兼容：旧流程若 `check` 后不提交 task.md 再 `pr` 会失败——这是预期纠偏。
- 风险：`check` 写自检使 task.md 变脏属正常，须在 pr 前多一次提交；文档需写清以免误判为回归。
- 安全：仅读 Git 状态与路径列表，不执行提交、不触网。

### 验证入口

- 定向：`node --test test/pr.test.mjs`（及改动的辅助测试）。
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T03:09:50.469Z | f853f3821973 | 请调整 |
| 设计 | boon yu | 2026-10-26T03:09:53.514Z | f853f3821973 | 请调整 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"3c1ffc164dd208bea2164371ceb209c9ee12b562b590ebdcf4d1f6d37709400d","commit":"f853f382197358bb11ebb56812c29b2848a27ed9","by":"boon yu","quote":"请调整","at":"2026-10-26T03:09:50.469Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"ccb58b6c8cb8e1c5c371a0621e35ced8ec60540f2f7caf011b283faffb3b6fc8","commit":"f853f382197358bb11ebb56812c29b2848a27ed9","by":"boon yu","quote":"请调整","at":"2026-10-26T03:09:53.514Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-216 pr blocks uncommitted task records and lists relative paths$' \u002d\u002dtest-reporter=./.tiller/local/verify-bQN5Q2/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-bQN5Q2/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"1e7f05956a6d9d1ad17e1a381750bd1e5bc888572f29927a5715fbc06734ba96","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-216 pr blocks uncommitted task records and lists relative paths
- 用例：CASE-216
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-5.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:27:34.119Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-217 pr generates the five-section draft after task records are committed$' \u002d\u002dtest-reporter=./.tiller/local/verify-qa5qaa/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-qa5qaa/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"1e7f05956a6d9d1ad17e1a381750bd1e5bc888572f29927a5715fbc06734ba96","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-217 pr generates the five-section draft after task records are committed
- 用例：CASE-217
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-6.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:27:35.423Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-218 another dirty task does not block this task pr$' \u002d\u002dtest-reporter=./.tiller/local/verify-Nd0vV4/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Nd0vV4/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"1e7f05956a6d9d1ad17e1a381750bd1e5bc888572f29927a5715fbc06734ba96","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-218 another dirty task does not block this task pr
- 用例：CASE-218
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-7.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:27:36.643Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-219 pr skips the record gate with a warning when Git is unavailable$' \u002d\u002dtest-reporter=./.tiller/local/verify-TTwBCj/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-TTwBCj/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"1e7f05956a6d9d1ad17e1a381750bd1e5bc888572f29927a5715fbc06734ba96","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-219 pr skips the record gate with a warning when Git is unavailable
- 用例：CASE-219
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-8.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:27:37.754Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-220 delivery docs require committing task records before pr$' \u002d\u002dtest-reporter=./.tiller/local/verify-mtXMLU/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mtXMLU/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"1e7f05956a6d9d1ad17e1a381750bd1e5bc888572f29927a5715fbc06734ba96","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-2
- 测试：test/pr.test.mjs::CASE-220 delivery docs require committing task records before pr
- 用例：CASE-220
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-9.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:27:38.837Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-221 closed task accept/close records are committed on this branch$' \u002d\u002dtest-reporter=./.tiller/local/verify-5kybuh/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-5kybuh/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"c971ce6e55c02649647384c99447dfb3386243376c26239b2a18e2ef0ef201d2","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-3
- 测试：test/pr.test.mjs::CASE-221 closed task accept/close records are committed on this branch
- 用例：CASE-221
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-10.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:28:14.626Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-222 package stays 0\\.5\\.0 and pr dirty-record coverage exists$' \u002d\u002dtest-reporter=./.tiller/local/verify-5heFf1/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-5heFf1/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"c971ce6e55c02649647384c99447dfb3386243376c26239b2a18e2ef0ef201d2","commit":"bd8fe19439da3890de170afcf4e03858ae5e888e"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-222 package stays 0.5.0 and pr dirty-record coverage exists
- 用例：CASE-222
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-pr-task-sync/logs/run-11.log
- 提交：bd8fe19439da
- 时间：2026-10-26T03:28:15.123Z

## 自检

- [ ] 需求确认有效
- [ ] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 需求确认后需求正文、范围或验收条件已变化，需要重新确认。
- 设计确认后需求或设计已变化，需要重新确认。
- 过程卫生：需求、设计确认提交 f853f3821973 后，工作区仍有未提交业务改动：test/pr.test.mjs。请先提交或移出本任务。
- AC-1 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- AC-2 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。
- 交付范围存在未提交改动：.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、test/pr.test.mjs

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 59 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 23 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 98 条用例及经过它的场景 CASE-055, CASE-001。
