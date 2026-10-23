# 卫生收尾 P1/P2（关任务、空AC决定、规则刷新、清分支、README）

<!-- tiller-task:v1 {"version":1,"id":"20261023-hygiene-p1p2","type":"improvement","size":"standard","created":"2026-10-23T07:27:45.269Z","base":"553eecc514efa633dbda3e3bda60352fceab3c0d","scope":[".tiller/plans",".tiller/rules",".tiller/context",".tiller/specs",".tiller/task","README.md","AGENTS.md",".tiller/cases","test"],"preExisting":{".tiller/plans/20261023-hygiene.md":"c13907d42958f28aad17eb90b6e11b4f3968cf426ce813f5bbfa5027d51cf308"},"format":"structured","slug":"hygiene-p1p2","summary":"卫生收尾与全局 plan","requirementFile":".tiller/local/hygiene-p1p2-goal.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/hygiene-p1p2-goal.md`

按已确认全局规划 20261023-hygiene 完成本轮卫生收尾（对应条目 P-1～P-5）；P-6（LICENSE/npm/CI/quickstart）仅保留在规划中，本轮不实现。 P-1：对近期已验收且尚未关闭的任务执行 tiller close（含 20261022-round*、20261022-first-batch、20261023-migrate-work、20261023-case-backfill、20261023-specs-pure-req 等已验收任务）；不关闭仍在进行或未验收的任务；不为迁移遗留的「已开始」任务伪造验收。 P-2：历史用例空 AC 的 check warn 明确接受为长期状态；在 decisions（或同等项目决定入口）记录该决定；禁止伪造 AC 回填。 P-3：刷新 .tiller/rules/project.md 与 .tiller/context/project.md，使其反映当前 0.5.0 产品事实（无 archive、无过时 work 流程、与纯化后规格一致）。 P-4：仅删除本地陈旧分支（如本地 codex/*、已合并的 round11–13 等本地分支）；禁止 force 删远端；main 与当前工作分支保留。 P-5：README 按纯化后的需求口径削减实现细节（参数表、内部路径、框架细节让位给能力说明），并与当前 CLI/流程一致。 版本保持 0.5.0。可新增用例自 CASE-163 起并挂本任务 AC。

### 范围

- 做：`.tiller/plans`、`.tiller/rules`、`.tiller/context`、`.tiller/specs`、`.tiller/task`、`README.md`、`AGENTS.md`、`.tiller/cases`、`test`
- 不做：`.tiller/plans`、`.tiller/rules`、`.tiller/context`、`.tiller/specs`、`.tiller/task`、`README.md`、`AGENTS.md`、`.tiller/cases`、`test` 以外的文件
- 涉及模块或文件：`.tiller/plans`、`.tiller/rules`、`.tiller/context`、`.tiller/specs`、`.tiller/task`、`README.md`、`AGENTS.md`、`.tiller/cases`、`test`

### 验收条件

- AC-1: 近期已验收任务均已 close；resume/status 不再把它们列为待关闭验收项
- AC-2: 已记录接受历史空 AC 长期 warn 的决定；无伪造 AC 回填；相关 check 行为与文档一致
- AC-3: rules/project.md 与 context/project.md 已对齐 0.5.0 现状，无过时 archive/work 引导
- AC-4: 本地陈旧分支已删除（保留 main 与本任务分支）；未强制删除远端分支
- AC-5: README 已按纯化需求削减实现细节且与当前能力一致；全量 build/lint/typecheck/test/test:package 通过；版本仍 0.5.0

## 设计

### 方案

- 规划：仓库已有确认规划 `.tiller/plans/20261023-hygiene.md`（P-1～P-6）。本任务交付 P-1～P-5（因条目均为 small、本任务需 standard 设计确认，故不挂 `--item`，在正文与简报中对照规划条目）；P-6 仅保留在规划，本轮零实现。
- P-1 关闭：用 `node .tiller/run.cjs close <id> --reason "..."` 关闭已验收任务清单（至少：20261022-first-batch、20261022-round8/9/11～17、20261023-migrate-work、20261023-case-backfill、20261023-specs-pure-req）。不对迁移遗留「已开始」任务伪造验收或 close（除非用户另有 abandon 授权，本轮不做）。
- P-2 空 AC：在 `.tiller/specs/decisions.md`（或既有决定索引）新增条目，写明接受历史用例未绑 AC 的 check 长期 warn、禁止伪造回填；必要时在 rules/usage 用一句话指向该决定。不批量改历史 cases 的 AC 字段。
- P-3 刷新：重写/修订 `.tiller/rules/project.md` 与 `.tiller/context/project.md`，去掉 archive、过时 work 目录流程、与 0.5.0/纯化 specs 不符的叙述；保留仍有效的本仓交付约定。
- P-4 分支：仅 `git branch -D` 删除本地陈旧分支（如 `codex/*`、`backup/*`、已合并的 `feat/20261022-round11*` / `round12` / `fix/...round13` 等本地副本）；保留 `main` 与 `chore/20261023-hygiene-p1p2`；不 `push --delete`、不 force 远端。
- P-5 README：对照纯化后的总体/模块需求，删减 README 中参数表、内部实现路径、框架/报告细节；保留能力与怎么用的短说明；同步 AGENTS 仅当明显过时。
- 用例：若需锁定上述行为，自 CASE-163 起 `case add` 并挂本任务 AC；测试名含 CASE。
- 全量一次：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`；版本 0.5.0。
- 禁止：commit/push、confirm/verify/accept、伪造 AC、删远端分支、实现 P-6。

### 取舍

- 单任务覆盖 P-1～P-5，避免为卫生项拆五次启动；规划条目 P-6 显式后置。
- 空 AC 用「接受长期 warn + 决定」而非回填，避免假历史。
- 分支清理只动本地，远端留给发布/维护轮次。
- 不挂 plan `--item`：条目粒度 small 与本任务 standard（需设计确认）冲突；以规划正文 + 本任务 AC 对照交付。

### 影响与风险

- 受影响：plans、task 关闭状态、decisions、rules/context、README、可能的 cases/test、本地 git 分支列表。
- 风险：误关未验收任务——先 resume 核对 stage=已验收；误删当前分支——脚本显式保留；文档刷新过度——对照 0.5.0 纯化 specs。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 用户原话：补充全局PLAN, 进行P1、P2；用codex执行
- 原话用途：可选附注，不替代已写明的正文
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 对象摘要：473c445485df3c0761e779633f10daf2d51d9387758bcb24e1fc6d95a1d71e4f
- 时间：2026-10-23T07:27:58.792Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 用户原话：补充全局PLAN, 进行P1、P2；用codex执行
- 原话用途：可选附注，不替代已写明的正文
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 对象摘要：b1c30d656f957d43cb93dcd7674dc4651e2ac3091dc0a4e30369c87eb32444c3
- 时间：2026-10-23T07:27:58.864Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 提交：1b51ec6fe75c5d95685c92c60c315d808e1107b2
- 对象摘要：a962e35ff3dffa12ccb1f07b570082efd3975f6df25c34cfd0f61298d23309ac
- 时间：2026-10-23T07:42:08.598Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-163 recent accepted tasks are closed without fabricating legacy acceptance
- 用例：CASE-163
- 命令：node '--test-name-pattern=^CASE-163 recent accepted tasks are closed without fabricating legacy acceptance$' --test-reporter=./.tiller/local/verify-fNvm2F/reporter.mjs --test-reporter-destination=.tiller/local/verify-fNvm2F/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-hygiene-p1p2/run-1.log
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 代码树摘要：61762edef92e36a27ee28fc2722822c15e3a31ee417a756c43eb282ea78ab196
- 时间：2026-10-23T07:41:12.175Z

### run-2
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-164 historical empty AC cases stay warned without fabricated backfill
- 用例：CASE-164
- 命令：node '--test-name-pattern=^CASE-164 historical empty AC cases stay warned without fabricated backfill$' --test-reporter=./.tiller/local/verify-RbX6rv/reporter.mjs --test-reporter-destination=.tiller/local/verify-RbX6rv/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-hygiene-p1p2/run-2.log
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 代码树摘要：61762edef92e36a27ee28fc2722822c15e3a31ee417a756c43eb282ea78ab196
- 时间：2026-10-23T07:41:24.046Z

### run-3
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-165 project rules and context match 0.5.0 without stale workflow guidance
- 用例：CASE-165
- 命令：node '--test-name-pattern=^CASE-165 project rules and context match 0\.5\.0 without stale workflow guidance$' --test-reporter=./.tiller/local/verify-5ySml9/reporter.mjs --test-reporter-destination=.tiller/local/verify-5ySml9/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-hygiene-p1p2/run-3.log
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 代码树摘要：61762edef92e36a27ee28fc2722822c15e3a31ee417a756c43eb282ea78ab196
- 时间：2026-10-23T07:41:24.589Z

### run-4
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-166 local stale branches are removed while main remains
- 用例：CASE-166
- 命令：node '--test-name-pattern=^CASE-166 local stale branches are removed while main remains$' --test-reporter=./.tiller/local/verify-fffTTb/reporter.mjs --test-reporter-destination=.tiller/local/verify-fffTTb/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-hygiene-p1p2/run-4.log
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 代码树摘要：61762edef92e36a27ee28fc2722822c15e3a31ee417a756c43eb282ea78ab196
- 时间：2026-10-23T07:41:25.060Z

### run-5
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-167 README keeps capabilities and removes implementation detail
- 用例：CASE-167
- 命令：node '--test-name-pattern=^CASE-167 README keeps capabilities and removes implementation detail$' --test-reporter=./.tiller/local/verify-PmSaJl/reporter.mjs --test-reporter-destination=.tiller/local/verify-PmSaJl/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-hygiene-p1p2/run-5.log
- 提交：553eecc514efa633dbda3e3bda60352fceab3c0d
- 代码树摘要：61762edef92e36a27ee28fc2722822c15e3a31ee417a756c43eb282ea78ab196
- 时间：2026-10-23T07:41:25.553Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 56 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 20 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 32 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 57 条用例及经过它的场景 CASE-055, CASE-001。

## 交付备注

- 执行本轮 close 时发现：close 写入器会重排已识别段并丢弃任务中的自定义 H2 段；`20261023-case-backfill` 的「映射」段已从基线恢复。该工具缺陷未在本任务扩围修复，建议后续单独立项。
