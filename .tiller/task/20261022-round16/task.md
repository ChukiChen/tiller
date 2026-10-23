# 用例改为测试设计资产，测试名引用用例 ID

<!-- tiller-task:v1 {"version":1,"id":"20261022-round16","type":"feature","size":"standard","created":"2026-10-22T13:46:50.460Z","base":"67726fff2f9e9e1946081d42b7fa7ca8fb325983","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".gitlab",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{},"format":"structured","slug":"case-redesign","summary":"用例改为测试设计资产，测试名引用用例 ID"} -->

## 需求

### 目标

当前用例被迫关联 test_ref（测试后生成），且缺少测试设计关键信息（前置条件、步骤、输入、预期结果）。本轮将用例改为测试设计资产：用例写在测试之前，Markdown 含前置条件、步骤、输入数据、预期结果、类型、优先级与关联 AC；关联方向改为测试名引用用例 ID，由 tiller 扫描测试反查覆盖；并支持 `verify --case`、分阶段 `check`，以及历史用例内容与测试名回填。

### 范围

- 做：用例结构与存储（Markdown 测试设计字段）、`case add`/相关命令去掉 test_ref 与 `case link`、测试名引用 CASE-xxx 的扫描反查、`verify --case`、分阶段 `check`、历史用例与测试名回填、规则/usage/README/specs/用例目录同步。
- 不做：实现本仓库 node:test 以外的测试框架适配、改写已验收任务的验收结论或提交历史、版本号变更、新增冗余归档文档。
- 涉及模块：workflow（case、verify、check、accept）、verification、standards（规则、usage、必读预算）、cases 目录与相关 specs。

### 验收条件

- AC-1: 用例 Markdown 结构含前置条件、步骤、输入、预期结果、类型、优先级、关联 AC；case add（及必要的编辑命令）不再要求 test_ref；创建用例可不依赖已有测试。
- AC-2: 测试名（或约定标记）引用 CASE-xxx；tiller 扫描测试建立 case→tests 反查；用例文件无 test_ref；无 case link。
- AC-3: 用例无引用 → 待实现；测试引用不存在的 CASE-id → 明确错误；一测可多用例。
- AC-4: verify 支持 --case CASE-xxx（执行覆盖该用例的测试，走第15轮私有报告核实路径）；与现有 --test/--criterion 共存。
- AC-5: check 分阶段——设计后要求 AC 有带预期结果的用例；verify/accept 要求每用例有通过的引用测试。
- AC-6: 历史用例与测试名回填；规则/README/usage/specs/用例目录同步；全量 build/lint/typecheck/test/test:package 通过；历史任务不因本轮新规则出现新阻断类型（验证过期属既有行为）。

## 设计

### 方案

- 用例即测试设计资产：用例在写测试之前登记，存储为 Markdown（或等价结构化内容），字段至少含前置条件/条件、步骤、输入数据、预期结果、类型、优先级、关联 AC。`case add`（及必要的编辑命令）不再要求 `--test`/`test_ref`；创建用例可不依赖已有测试文件。
- 关联方向 test→case：测试名称（或约定可扫描标记）包含用例 ID，例如 `test('CASE-082 …')` 或名称中带 `CASE-082`。tiller 扫描测试源，建立每个用例被哪些测试覆盖的反查表。用例文件不保存 `test_ref`；删除 `case link` 命令及相关语义。
- 一对多：一个测试可覆盖多个用例 ID；一个用例可被多个测试覆盖。没有任何测试引用的用例状态为「待实现」。测试引用了不存在的 CASE-id 时明确报错（check/verify 等路径）。
- `verify --case CASE-xxx`：解析覆盖该用例的测试集合并执行，走第15轮自主构造 node:test + 私有报告核实路径。保留 `--test` / `--criterion` 用法，语义与第15轮兼容。
- 分阶段 check：设计确认后/设计阶段——每个 AC 至少有用例，且用例具备预期结果等关键字段。verify/accept 阶段——每个用例至少有一个引用它的测试，且相关验证通过。缺失用例 ID 为错误。
- 历史补全：回填历史用例的前置条件/步骤/输入/预期等；历史测试名称补上对应 CASE-xxx（或等价可扫描标记）。新用例编号从 CASE-098 起（若仓库更高则顺延）。被本轮行为改变的旧用例直接改，不另存旧版；过时的 test_ref / case link 语义直接删除，不归档。
- 文档同步：规则、README、usage、specs、用例目录说明与本语义一致；必读约 7000 字符预算，清晰优先可略超；版本保持 0.5.0。

### 取舍

- 关联存在测试侧而非用例侧：符合「用例先行、测试后写」的时序，避免用例被迫挂空 test_ref；代价是依赖约定的命名/标记与扫描实现，需覆盖一测多用例与待实现状态。
- 分阶段 check 而非一律要求测试：设计阶段即可要求 AC 有带预期结果的用例，实现/验证阶段再要求引用测试通过，避免过早阻断设计确认。
- 删除 test_ref / case link 而非兼容双写：减少双源真相；历史内容一次性回填迁移。

### 影响与风险

- 受影响：`case add` 参数与用例文件格式、用例索引/扫描、`verify` 新增 `--case`、`check`/`accept` 分阶段规则、仓库内历史用例与测试名、规则与文档。
- 需回归：workflow 的 case/verify/check/accept/pr，verification 相关用例，standards 必读预算与文档一致性，历史任务的 `check`（对比阻断类型，验证过期属既有行为）。
- 风险：测试名扫描漏检/误检；一测多用例时 verify --case 选择集合；历史回填工作量大导致遗漏；用例存储从 JSON 迁到 Markdown 时的兼容与索引。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 对象摘要：69ab516bee9f85d9bdb74b67ac0b06b3d79cf86371423a3777baae058b3ac165
- 时间：2026-10-22T13:47:05.956Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 对象摘要：6629fdb0d7766a6193b7db2f7c04ac7870713ee175931fa3541273fc521b56bb
- 时间：2026-10-22T13:47:06.036Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 对象摘要：581679b911361b73639c4a1bfaac84b9a4581d73d087113aba8e221c3ca99724
- 时间：2026-10-22T23:41:26.040Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/case-redesign.test.mjs::CASE-098 case add registers a complete test design before any test exists
- 用例：CASE-098
- 命令：node '--test-name-pattern=^CASE-098 case add registers a complete test design before any test exists$' --test-reporter=./.tiller/local/verify-kNi8Rr/reporter.mjs --test-reporter-destination=.tiller/local/verify-kNi8Rr/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-1.log
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:40:52.011Z

### run-2
- 条件：AC-2
- 测试：test/case-redesign.test.mjs::CASE-099 test scan derives case to test links without stored test refs
- 用例：CASE-099
- 命令：node '--test-name-pattern=^CASE-099 test scan derives case to test links without stored test refs$' --test-reporter=./.tiller/local/verify-w849zu/reporter.mjs --test-reporter-destination=.tiller/local/verify-w849zu/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-2.log
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:40:53.017Z

### run-3
- 条件：AC-3
- 测试：test/case-redesign.test.mjs::CASE-100 pending cases unknown ids and many-to-many coverage are explicit
- 用例：CASE-100
- 命令：node '--test-name-pattern=^CASE-100 pending cases unknown ids and many-to-many coverage are explicit$' --test-reporter=./.tiller/local/verify-TBjj3N/reporter.mjs --test-reporter-destination=.tiller/local/verify-TBjj3N/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-3.log
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:40:53.894Z

### run-4
- 条件：AC-4
- 测试：test/case-redesign.test.mjs::CASE-101 verify case executes every covering test
- 用例：CASE-101
- 命令：node '--test-name-pattern=^CASE-101 verify case executes every covering test$' --test-reporter=./.tiller/local/verify-3b57mc/reporter.mjs --test-reporter-destination=.tiller/local/verify-3b57mc/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-4.log
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:40:54.662Z

### run-5
- 条件：AC-5
- 测试：test/case-redesign.test.mjs::CASE-102 check enforces cases after design and tests after verification
- 用例：CASE-102
- 命令：node '--test-name-pattern=^CASE-102 check enforces cases after design and tests after verification$' --test-reporter=./.tiller/local/verify-SOZ4qn/reporter.mjs --test-reporter-destination=.tiller/local/verify-SOZ4qn/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-5.log
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:40:55.889Z

### run-6
- 条件：AC-6
- 测试：test/case-redesign.test.mjs::CASE-103 repository history and docs use the new case model
- 用例：CASE-103
- 命令：node '--test-name-pattern=^CASE-103 repository history and docs use the new case model$' --test-reporter=./.tiller/local/verify-uCeNAG/reporter.mjs --test-reporter-destination=.tiller/local/verify-uCeNAG/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-6.log
- 提交：67726fff2f9e9e1946081d42b7fa7ca8fb325983
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:40:57.583Z

### run-7
- 条件：AC-1
- 测试：test/case-redesign.test.mjs::CASE-098 case add registers a complete test design before any test exists
- 用例：CASE-098
- 命令：node '--test-name-pattern=^CASE-098 case add registers a complete test design before any test exists$' --test-reporter=./.tiller/local/verify-QkQmtL/reporter.mjs --test-reporter-destination=.tiller/local/verify-QkQmtL/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-7.log
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:41:14.228Z

### run-8
- 条件：AC-2
- 测试：test/case-redesign.test.mjs::CASE-099 test scan derives case to test links without stored test refs
- 用例：CASE-099
- 命令：node '--test-name-pattern=^CASE-099 test scan derives case to test links without stored test refs$' --test-reporter=./.tiller/local/verify-tLeNV4/reporter.mjs --test-reporter-destination=.tiller/local/verify-tLeNV4/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-8.log
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:41:15.230Z

### run-9
- 条件：AC-3
- 测试：test/case-redesign.test.mjs::CASE-100 pending cases unknown ids and many-to-many coverage are explicit
- 用例：CASE-100
- 命令：node '--test-name-pattern=^CASE-100 pending cases unknown ids and many-to-many coverage are explicit$' --test-reporter=./.tiller/local/verify-AjOKlp/reporter.mjs --test-reporter-destination=.tiller/local/verify-AjOKlp/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-9.log
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:41:16.053Z

### run-10
- 条件：AC-4
- 测试：test/case-redesign.test.mjs::CASE-101 verify case executes every covering test
- 用例：CASE-101
- 命令：node '--test-name-pattern=^CASE-101 verify case executes every covering test$' --test-reporter=./.tiller/local/verify-6lCave/reporter.mjs --test-reporter-destination=.tiller/local/verify-6lCave/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-10.log
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:41:16.802Z

### run-11
- 条件：AC-5
- 测试：test/case-redesign.test.mjs::CASE-102 check enforces cases after design and tests after verification
- 用例：CASE-102
- 命令：node '--test-name-pattern=^CASE-102 check enforces cases after design and tests after verification$' --test-reporter=./.tiller/local/verify-z2msT5/reporter.mjs --test-reporter-destination=.tiller/local/verify-z2msT5/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-11.log
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:41:17.949Z

### run-12
- 条件：AC-6
- 测试：test/case-redesign.test.mjs::CASE-103 repository history and docs use the new case model
- 用例：CASE-103
- 命令：node '--test-name-pattern=^CASE-103 repository history and docs use the new case model$' --test-reporter=./.tiller/local/verify-xLAVrU/reporter.mjs --test-reporter-destination=.tiller/local/verify-xLAVrU/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round16/run-12.log
- 提交：460717b9db703571aebd314b3b634b4f6890a8dd
- 代码树摘要：da8e2e70b5673fb98ccf7d9c32cb297b679d4994538c056c21ace5ccee32c8ba
- 时间：2026-10-22T23:41:19.495Z

## 关闭

### close
- 状态：已关闭
- 原因：已验收，纳入 20261023-hygiene-p1p2 卫生收尾关闭
- 时间：2026-10-23T07:28:49.396Z

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
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 19 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 9 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 26 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 47 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 91 个测试用例（请确认对应功能已删除；详情见 Git diff）。
