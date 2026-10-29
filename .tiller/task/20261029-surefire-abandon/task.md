# 修复 Surefire 默认报告与 abandon 清理

<!-- tiller-task:v1 {"version":1,"id":"20261029-surefire-abandon","type":"improvement","size":"standard","created":"2026-10-29T08:05:02.791Z","base":"aa1c4f3c087460c89954071e564e26b308806400","scope":["AGENTS.md","src","test",".tiller/specs",".tiller/cases",".tiller/context",".tiller/usage.md",".tiller/rules","resources",".tiller/project.json"],"format":"structured","summary":"junit-maven 读取默认 Surefire 报告；abandon 只清理本机","requirementFile":".tiller/specs/modules/workflow/surefire-abandon.md"} -->

## 需求

### 使用场景

- 场景：Maven Surefire 3.2.5 忽略 `-Dsurefire.reportsDirectory` 时，开发者仍需要以本次默认报告核实 Java 测试；取消任务时只需清理本机隔离环境。
- 场景：已验收但未合入的任务需要放弃时，primary 不应为了记录放弃而新增任务文件或提交。

### 目标

需求来源：`.tiller/specs/modules/workflow/surefire-abandon.md`

实现 Maven 默认 Surefire 报告取证与 abandon 纯本机清理，并同步当前规格、用例、文档与回归测试。

设计见 `.tiller/specs/modules/workflow/surefire-abandon-design.md`，验收以引用的 specs AC 为准。

### 业务范围

- 做：修正 Maven 报告来源与陈旧报告隔离；收敛 abandon 为只清本机；同步 specs、CASE、usage、context 与测试。
- 不做：修复 NEW-03 Gradle 问题；改变正常 close 的合入证明；新增放弃记录落盘或跳过 check 的旁路。
- 假设与待确认：本次 Maven XML 写到仓库根下的 `target/surefire-reports`；多模块工程把实际报告模块登记为仓库根。

### 关键行为

- AC-1：junit-maven 从 Maven 默认 `target/surefire-reports` 读取本次 XML，通过、失败与精确选择器只跑一个测试均由私有证据核实。
- AC-2：`close --abandon` 只清理本机 worktree、任务目录与分支，不写 primary `task.md`/CASE，也不产生放弃提交；正常 `close` 不变。

### 异常与边界

- 默认报告缺失、损坏、零匹配或多匹配时不可核实，不能回退旧报告或伪造通过。
- abandon 后 worktree 记录消失属预期；`resume` 不再列出该任务，相关命令按记录不存在失败。
- 正常 close 缺合入证明时继续拒绝清理。

### 验收条件

- AC-1: `junit-maven` 从 Maven 默认 `target/surefire-reports` 读取本次 XML，通过、失败与精确选择器只跑一个测试均由私有证据核实
- AC-2: `close --abandon` 只清理本机 worktree、任务目录与分支，不写 primary `task.md`/CASE，也不产生放弃提交；正常 `close` 不变

## 设计

### 方案

- 运行器报告读取增加业务仓库根上下文；Maven 执行前清空默认 `target/surefire-reports`，执行后只读取该目录 XML。
- 删除 abandon 的共享任务持久化与提交，只复用现有 worktree、任务目录和分支清理；正常 close 路径不变。

### 失败处理

- 默认报告缺失、损坏或不唯一时不可核实，Maven 非零退出保留；abandon 清理按幂等处理，不再承诺 reopen。

### 取舍

- 不继续依赖无效的 reportsDirectory 参数；不以 primary 任务种子或放弃提交换取可恢复性。

### 影响与风险

- 影响 Maven 报告读取、abandon 收尾及相关 CASE/文档；Gradle、pytest 与正常 close 保持兼容。多模块 Maven 需登记实际报告模块为仓库根。

### 验证入口

- `node --test` 运行 `test/java-runners.test.mjs` 与 `test/task-worktrees.test.mjs` 的 CASE 引用测试；再执行 `npm test`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 设计 | ChukiChen | 2026-10-29T08:24:09.446Z | 4570eb7884f6 | — |
| 需求 | ChukiChen | 2026-10-29T09:02:50.481Z | 356a82e28e19 | — |

<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"fdd1544f2efdeabbe6ce1e63d9924df12806a573571b1b7dce02e09be1637bef","commit":"4570eb7884f6b793095a7c74854b83f95c78f26f","by":"ChukiChen","quote":"","at":"2026-10-29T08:24:09.446Z"} -->
<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"706cfaad716493a8c2538773e0b37470e1ff3ee0e7b3dc0c95fea65f413580a7","commit":"356a82e28e19f02c4d88d8132aa85f080701379e","by":"ChukiChen","quote":"","at":"2026-10-29T09:02:50.481Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-354 Maven default Surefire reports verify pass, failure and exact selection$' \u002d\u002dtest-reporter=./.tiller/local/verify-gJDuVt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-gJDuVt/report.jsonl test/java-runners.test.mjs","exitCode":0,"tree":"4408f9a9f00392ad3020805859086dd89a1ae4fd25707ea7b7964a3bde181e52","commit":"356a82e28e19f02c4d88d8132aa85f080701379e"} -->
- 条件：AC-1
- 测试：test/java-runners.test.mjs::CASE-354 Maven default Surefire reports verify pass, failure and exact selection
- 用例：CASE-354
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-surefire-abandon/logs/run-1.log
- 提交：356a82e28e19
- 时间：2026-10-29T09:02:19.969Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 abandon ignores primary write blockers and only cleans local task facts$' \u002d\u002dtest-reporter=./.tiller/local/verify-97mjvg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-97mjvg/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"4408f9a9f00392ad3020805859086dd89a1ae4fd25707ea7b7964a3bde181e52","commit":"356a82e28e19f02c4d88d8132aa85f080701379e"} -->
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-317 abandon ignores primary write blockers and only cleans local task facts
- 用例：CASE-317
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-surefire-abandon/logs/run-2.log
- 提交：356a82e28e19
- 时间：2026-10-29T09:02:28.569Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 改动超出范围：.tiller/project.json

提示：
- 165 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 141 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 66 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例；建议同时回归经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 52 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 174 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 5 个测试用例（请确认对应功能已删除；详情见 Git diff）。
