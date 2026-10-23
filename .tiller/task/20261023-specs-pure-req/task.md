# 规格需求去技术化

<!-- tiller-task:v1 {"version":1,"id":"20261023-specs-pure-req","type":"documentation","size":"standard","created":"2026-10-23T06:58:59.138Z","base":"ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5","scope":[".tiller/specs",".tiller/rules",".tiller/usage.md",".tiller/cases",".tiller/index.md","README.md","AGENTS.md",".tiller/task","test"],"preExisting":{},"format":"structured","slug":"specs-pure-req","summary":"需求去技术化并下沉设计","requirementFile":".tiller/local/specs-pure-req-goal.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/specs-pure-req-goal.md`

纯化 tiller 规格需求：总体与四个模块（workflow、verification、initialization、standards）的 requirements.md 只保留可观察的业务能力与验收方向；把 CLI 参数、实现路径、node:test/报告/适配器、源码模块名、提交/分支字符串格式等技术契约下沉到对应 design.md。语气对齐已确认示例（不要「范围内/范围外」专节；可用「验收方向」；verification 模块名保留）。版本保持 0.5.0。优先搬迁文字到设计，不删除仍有效的产品规则；仅当 rules/usage/README/cases 表述与纯化后的需求矛盾时才同步改写。

### 范围

- 做：`.tiller/specs`、`.tiller/rules`、`.tiller/usage.md`、`.tiller/cases`、`.tiller/index.md`、`README.md`、`AGENTS.md`、`.tiller/task`、`test`
- 不做：`.tiller/specs`、`.tiller/rules`、`.tiller/usage.md`、`.tiller/cases`、`.tiller/index.md`、`README.md`、`AGENTS.md`、`.tiller/task`、`test` 以外的文件
- 涉及模块或文件：`.tiller/specs`、`.tiller/rules`、`.tiller/usage.md`、`.tiller/cases`、`.tiller/index.md`、`README.md`、`AGENTS.md`、`.tiller/task`、`test`

### 验收条件

- AC-1: 总体与四模块 requirements.md 不含 CLI 开关、作为需求正文的仓库实现路径、或测试框架/报告内部细节；仅保留能力与验收方向（无范围内/范围外专节）
- AC-2: 对应 design.md 承接迁出的技术契约，不丢失仍可执行的产品行为约束
- AC-3: rules/usage/README 中引用旧「技术当需求」表述已更新或仍准确；cases 判定标准仍有效或已按纯化口径调整
- AC-4: 全量 build/lint/typecheck/test/test:package 通过；package.json 版本仍为 0.5.0

## 设计

### 方案

- 改写目标文件：`.tiller/specs/requirements.md`；`.tiller/specs/modules/{workflow,verification,initialization,standards}/requirements.md`；对应五份 `design.md`（总体 + 四模块）。模块目录名 `verification` 保留。
- 需求口径：只写可观察能力与「验收方向」；不要「范围内/范围外」专节；不要 CLI 开关表、仓库实现路径当需求、node:test/私有报告/适配器、源码模块名、提交/分支字符串格式。语气对齐用户已确认的示例（总体与模块各一版）。
- 设计承接：从需求正文迁出的技术契约写入对应 `design.md`（可并入既有 CLI/模块职责章节），保证仍可执行的行为约束不丢；优先搬迁，不删仍有效的产品规则。
- 测试叙述：为 CASE-159～162 在 `test/` 增加或调整断言（含用例库计数）；不改 `src/`。
- 连带同步：仅当 `.tiller/rules`、`.tiller/usage.md`、`README.md`、`AGENTS.md`、`.tiller/index.md` 或 `.tiller/cases` 的表述把上述技术细节当作「需求必须」且与纯化后正文矛盾时才改写；cases 预期仍有效则保留。新用例若需要从 CASE-159 起（当前最高 CASE-158），并挂到本任务 AC。
- 不做实现代码大改：默认不改 `src/`；若文档断言测试因措辞失败，优先改文档/用例/测试叙述，而非产品行为。
- 结束跑全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`；`package.json` / `resourceVersion` 保持 0.5.0。

### 取舍

- 纯化需求、技术下沉设计，而不是删掉技术契约；产品仍需要那些契约，只是分层。
- 不重命名 verification 模块；不引入「范围内/范围外」任务式写法进规格需求。
- 不扩大到重构 CLI 或改版本号；不伪造确认/验证/验收。

### 影响与风险

- 受影响：specs 需求与设计、可能的 rules/usage/README/cases、本任务记录。
- 风险：搬迁遗漏导致设计缺约束——逐文件对照迁出清单；过度纯化删掉可观察验收——对照用户示例保留验收方向；文档测试对旧措辞敏感——按 AC-3 同步叙述。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 提交：ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5
- 对象摘要：e44996e161ce25066635874c873cf7e897d50bbbc49997093f2114a183c0fc3d
- 时间：2026-10-23T07:19:48.324Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 提交：ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5
- 对象摘要：0e2c6e4dbf0ee3e629789c290d3bf777c3707b2ea3b32e2916082a7027ac473f
- 时间：2026-10-23T07:19:48.399Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 提交：7582c08ebbef58c3da6c7419b6dc10539f01bf14
- 对象摘要：e3963beb93626560c4eddd1b11fabd0527eb9115868f4a07a2d2b2c6e9f9b259
- 时间：2026-10-23T07:20:08.604Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-159 repository spec requirements stay business-observable and exclude technical contracts
- 用例：CASE-159
- 命令：node '--test-name-pattern=^CASE-159 repository spec requirements stay business-observable and exclude technical contracts$' --test-reporter=./.tiller/local/verify-ANL3rx/reporter.mjs --test-reporter-destination=.tiller/local/verify-ANL3rx/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-1.log
- 提交：ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5
- 代码树摘要：0e00618e69be3f5d1609338c7a5dea6976de3c26e45a0744c253c558c2115cc8
- 时间：2026-10-23T07:19:15.844Z

### run-2
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-160 migrated technical contracts remain locatable in module and overall designs
- 用例：CASE-160
- 命令：node '--test-name-pattern=^CASE-160 migrated technical contracts remain locatable in module and overall designs$' --test-reporter=./.tiller/local/verify-sLPwmn/reporter.mjs --test-reporter-destination=.tiller/local/verify-sLPwmn/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-2.log
- 提交：ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5
- 代码树摘要：0e00618e69be3f5d1609338c7a5dea6976de3c26e45a0744c253c558c2115cc8
- 时间：2026-10-23T07:19:16.325Z

### run-3
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-161 guidance and case references remain consistent with purified requirements
- 用例：CASE-161
- 命令：node '--test-name-pattern=^CASE-161 guidance and case references remain consistent with purified requirements$' --test-reporter=./.tiller/local/verify-hS84BK/reporter.mjs --test-reporter-destination=.tiller/local/verify-hS84BK/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-3.log
- 提交：ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5
- 代码树摘要：0e00618e69be3f5d1609338c7a5dea6976de3c26e45a0744c253c558c2115cc8
- 时间：2026-10-23T07:19:16.830Z

### run-4
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 命令：node '--test-name-pattern=^CASE-162 repository keeps the 0\.5\.0 release contract and five full verification entries$' --test-reporter=./.tiller/local/verify-wLbKkR/reporter.mjs --test-reporter-destination=.tiller/local/verify-wLbKkR/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-4.log
- 提交：ab6cc62baa4f0771c5198107d5e2b72ddb5e0bb5
- 代码树摘要：0e00618e69be3f5d1609338c7a5dea6976de3c26e45a0744c253c558c2115cc8
- 时间：2026-10-23T07:19:17.349Z

### run-5
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-159 repository spec requirements stay business-observable and exclude technical contracts
- 用例：CASE-159
- 命令：node '--test-name-pattern=^CASE-159 repository spec requirements stay business-observable and exclude technical contracts$' --test-reporter=./.tiller/local/verify-sgNAeo/reporter.mjs --test-reporter-destination=.tiller/local/verify-sgNAeo/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-5.log
- 提交：7582c08ebbef58c3da6c7419b6dc10539f01bf14
- 代码树摘要：741541997243290b552dc1ba4ff46b734308296c7946e71a8379dea3b6d496c9
- 时间：2026-10-23T07:19:58.967Z

### run-6
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-160 migrated technical contracts remain locatable in module and overall designs
- 用例：CASE-160
- 命令：node '--test-name-pattern=^CASE-160 migrated technical contracts remain locatable in module and overall designs$' --test-reporter=./.tiller/local/verify-QD3X0z/reporter.mjs --test-reporter-destination=.tiller/local/verify-QD3X0z/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-6.log
- 提交：7582c08ebbef58c3da6c7419b6dc10539f01bf14
- 代码树摘要：741541997243290b552dc1ba4ff46b734308296c7946e71a8379dea3b6d496c9
- 时间：2026-10-23T07:19:59.480Z

### run-7
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-161 guidance and case references remain consistent with purified requirements
- 用例：CASE-161
- 命令：node '--test-name-pattern=^CASE-161 guidance and case references remain consistent with purified requirements$' --test-reporter=./.tiller/local/verify-oi5frS/reporter.mjs --test-reporter-destination=.tiller/local/verify-oi5frS/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-7.log
- 提交：7582c08ebbef58c3da6c7419b6dc10539f01bf14
- 代码树摘要：741541997243290b552dc1ba4ff46b734308296c7946e71a8379dea3b6d496c9
- 时间：2026-10-23T07:19:59.983Z

### run-8
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 命令：node '--test-name-pattern=^CASE-162 repository keeps the 0\.5\.0 release contract and five full verification entries$' --test-reporter=./.tiller/local/verify-X3yNCe/reporter.mjs --test-reporter-destination=.tiller/local/verify-X3yNCe/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-specs-pure-req/run-8.log
- 提交：7582c08ebbef58c3da6c7419b6dc10539f01bf14
- 代码树摘要：741541997243290b552dc1ba4ff46b734308296c7946e71a8379dea3b6d496c9
- 时间：2026-10-23T07:20:00.514Z

## 关闭

### close
- 状态：已关闭
- 原因：已验收，纳入 20261023-hygiene-p1p2 卫生收尾关闭
- 时间：2026-10-23T07:28:50.731Z

## 自检

- [x] 需求确认有效
- [x] 该任务无需设计确认
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
- 提交 7582c08 不符合提交信息规范：docs(specs): 需求去技术化并下沉设计（模块 specs 不在 specs/modules 中）。
- 本次改动涉及模块 initialization：建议回归该模块 56 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 17 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 32 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 55 条用例及经过它的场景 CASE-055, CASE-001。
