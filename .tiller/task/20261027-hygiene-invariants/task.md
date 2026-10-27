# 一轮收口合入后不变式与入口摩擦

<!-- tiller-task:v1 {"version":1,"id":"20261027-hygiene-invariants","type":"feature","size":"standard","created":"2026-10-27T11:46:47.742Z","base":"b963f40c861ecaa73f49e4220d787dbedb3e424c","scope":["src","test",".tiller","resources","scripts"],"format":"structured","slug":"hygiene-invariants"} -->

## 需求

### 使用场景

一轮狗粮后主路径通，但仍因入口与合入后副作用反复出软摩擦。维护者要求一次性收口：锁合入后不变式，并补齐短目标落地、commit scope 误报。安装后 tiller 在 PATH，用户与测试都按**一个 tiller**用，不依赖 runtime bind。

### 目标

需求来源：`.tiller/specs/modules/workflow/hygiene-invariants.md`

一轮实现合入后工作区不变式与入口摩擦修复；版本 0.5.0。

### 业务范围

- 做：不变式测试；`--requirement` 生成可 confirm 的结构化骨架；commit/check 模块 scope 误报修复；CASE/文档；测试与狗粮按 PATH 单一 CLI。
- 不做：升版本；自动/手动 runtime bind 主路径或验收；把 `--requirement` 改成多行全文通道；取消 case 挂模块规格；合入本 PR。
- 假设：用户描述足够时可填章节；过短则骨架+待补清单；PATH 即可用。

### 关键行为

1. merge/close 后 primary 无 tiller 未跟踪任务树，干净时可 ff。
2. `start --requirement` 得到结构化需求骨架（短目标写入），可走 confirm。
3. 产品与 CASE/狗粮按 PATH 单一 tiller；不验收、不引导 runtime bind。
4. `feat(specs):` 等不再误报模块缺失。

### 异常与边界

见 specs；`--requirement-file` 优先；可选 bind 不得进主路径文档。

### 验收条件

- AC-1: merge/close 后的自动化测试断言 primary 无因 tiller materialize/种子产生的未跟踪任务树，且在干净工作区可快进；相关不变式有 CASE
- AC-2: 仅 `--requirement` 启动的任务，其 task.md 需求含结构化章节且短目标已写入，无需空白模板手搓才能进入 confirm 路径（或失败时明确缺节）
- AC-3: 主路径文档与 dogfood/CASE 按 PATH 单一 tiller 使用；不把 runtime bind（自动或手动）列为 init/合入后必做或验收；若测试涉及 CLI，通过 PATH/`npx`/打包入口调用，不依赖 bind 状态
- AC-4: check 对 `feat(specs):` / 工作流类 commit 不再误报模块缺失；真实缺失模块仍提示
- AC-5: 0.5.0；全量测试与 package smoke 通过

## 设计

### 方案

- 不变式：在 close/merge 测试与/或 doctor 增加「primary 无未跟踪 task 树」断言；复用 #45 行为并文档化。
- 短目标落地：`startFlow` 在无 requirement-file 时用模板写入结构化需求，把 `--requirement` 填入目标/使用场景首段。
- 单一 tiller：文档与 soft/dogfood 去掉「init 后 runtime bind」步骤；测试用 PATH/打包入口，不断言 bind。
- commit scope：check 解析模块名时，对非 `specs/modules` 下的约定 scope（specs/workflow/standards 等）跳过缺失模块告警或映射到合法模块。

### 影响面

`src/flow.ts`、`src` check/commit 提示、`test/*`、usage/decisions、cases；**不**为 AC 去接 `markInitBaselineMerged`→bind。

### 影响与风险

- 影响：改 `start` 骨架、check 的 commit scope 识别、合入后不变式测试与主路径文档；不引入 runtime bind 钩子。
- 风险：骨架过短被当成可确认——须列出待补节；scope 白名单过宽可能漏报真缺模块——只豁免约定全局/工作流名。
- 回退：骨架不覆盖 `--requirement-file`；去掉 bind 主路径不改变 PATH 安装行为。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T11:57:46.593Z | b963f40c861e | — |
| 设计 | boon yu | 2026-10-27T11:57:51.992Z | e9b7c568316b | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"d066360c18b0c252472bbe6e7c47004dbad445fc1d621a26e095cae9fd0d67b3","commit":"b963f40c861ecaa73f49e4220d787dbedb3e424c","by":"boon yu","quote":"","at":"2026-10-27T11:57:46.593Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"0ab84f469fe48421d8c93713cdcc4a5338a68dbf9d64c6c30cfec2a5702f1400","commit":"e9b7c568316b7f341d7bb6d1f1aa9ee7085d9b3d","by":"boon yu","quote":"","at":"2026-10-27T11:57:51.992Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-310 merge and close leave no untracked task seed and a clean primary can fast-forward$' \u002d\u002dtest-reporter=./.tiller/local/verify-Ybdv5Q/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Ybdv5Q/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"fea7cb6091688f241ab1e1e8473e50ea9332b389740ba142c6f641cbb764cb26","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-310 merge and close leave no untracked task seed and a clean primary can fast-forward
- 用例：CASE-310
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-1.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:20:49.024Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative$' \u002d\u002dtest-reporter=./.tiller/local/verify-nWfiA6/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-nWfiA6/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"fea7cb6091688f241ab1e1e8473e50ea9332b389740ba142c6f641cbb764cb26","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-2
- 测试：test/doc-templates.test.mjs::CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative
- 用例：CASE-311
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-2.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:20:52.495Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-313 main path uses one PATH tiller without init runtime binding$' \u002d\u002dtest-reporter=./.tiller/local/verify-ZPTijm/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ZPTijm/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"fea7cb6091688f241ab1e1e8473e50ea9332b389740ba142c6f641cbb764cb26","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-313 main path uses one PATH tiller without init runtime binding
- 用例：CASE-313
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-3.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:20:53.720Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-312 check does not report conventional global or workflow commit scopes as missing modules$' \u002d\u002dtest-reporter=./.tiller/local/verify-IPiQqt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-IPiQqt/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"fea7cb6091688f241ab1e1e8473e50ea9332b389740ba142c6f641cbb764cb26","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-312 check does not report conventional global or workflow commit scopes as missing modules
- 用例：CASE-312
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-4.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:20:54.613Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-wfiWsK/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-wfiWsK/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"fea7cb6091688f241ab1e1e8473e50ea9332b389740ba142c6f641cbb764cb26","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-5.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:20:55.793Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-310 merge and close leave no untracked task seed and a clean primary can fast-forward$' \u002d\u002dtest-reporter=./.tiller/local/verify-ougGYl/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ougGYl/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"2d7d7351c7c2caa2cca961e260275e220a12b256b8d87319ee40deb143b0fcf6","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-310 merge and close leave no untracked task seed and a clean primary can fast-forward
- 用例：CASE-310
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-6.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:28:28.860Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative$' \u002d\u002dtest-reporter=./.tiller/local/verify-2Podkt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-2Podkt/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"2d7d7351c7c2caa2cca961e260275e220a12b256b8d87319ee40deb143b0fcf6","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-2
- 测试：test/doc-templates.test.mjs::CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative
- 用例：CASE-311
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-7.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:28:32.449Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-313 main path uses one PATH tiller without init runtime binding$' \u002d\u002dtest-reporter=./.tiller/local/verify-QllWSu/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-QllWSu/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"2d7d7351c7c2caa2cca961e260275e220a12b256b8d87319ee40deb143b0fcf6","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-313 main path uses one PATH tiller without init runtime binding
- 用例：CASE-313
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-8.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:28:33.705Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-312 check does not report conventional global or workflow commit scopes as missing modules$' \u002d\u002dtest-reporter=./.tiller/local/verify-ere7Di/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ere7Di/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"2d7d7351c7c2caa2cca961e260275e220a12b256b8d87319ee40deb143b0fcf6","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-312 check does not report conventional global or workflow commit scopes as missing modules
- 用例：CASE-312
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-9.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:28:34.649Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-KNj9hg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-KNj9hg/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"2d7d7351c7c2caa2cca961e260275e220a12b256b8d87319ee40deb143b0fcf6","commit":"2189bbe6862e74296a39485a9f083bc973f5ec4c"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-10.log
- 提交：2189bbe6862e
- 时间：2026-10-27T12:28:35.886Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-310 merge and close leave no untracked task seed and a clean primary can fast-forward$' \u002d\u002dtest-reporter=./.tiller/local/verify-IFqSN6/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-IFqSN6/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"8318560e0047c9f1e74b80145b2b1266fa0fc6bf1e21b502450a16d87ed89c5e","commit":"74c95646cba430aaa07daabccd3917ac528abdb0"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-310 merge and close leave no untracked task seed and a clean primary can fast-forward
- 用例：CASE-310
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-11.log
- 提交：74c95646cba4
- 时间：2026-10-27T12:29:09.975Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative$' \u002d\u002dtest-reporter=./.tiller/local/verify-Dp7wuy/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Dp7wuy/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"8318560e0047c9f1e74b80145b2b1266fa0fc6bf1e21b502450a16d87ed89c5e","commit":"74c95646cba430aaa07daabccd3917ac528abdb0"} -->
- 条件：AC-2
- 测试：test/doc-templates.test.mjs::CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative
- 用例：CASE-311
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-12.log
- 提交：74c95646cba4
- 时间：2026-10-27T12:29:13.373Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-313 main path uses one PATH tiller without init runtime binding$' \u002d\u002dtest-reporter=./.tiller/local/verify-dRGJFF/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-dRGJFF/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"8318560e0047c9f1e74b80145b2b1266fa0fc6bf1e21b502450a16d87ed89c5e","commit":"74c95646cba430aaa07daabccd3917ac528abdb0"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-313 main path uses one PATH tiller without init runtime binding
- 用例：CASE-313
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-13.log
- 提交：74c95646cba4
- 时间：2026-10-27T12:29:14.575Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-312 check does not report conventional global or workflow commit scopes as missing modules$' \u002d\u002dtest-reporter=./.tiller/local/verify-X902wj/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-X902wj/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"8318560e0047c9f1e74b80145b2b1266fa0fc6bf1e21b502450a16d87ed89c5e","commit":"74c95646cba430aaa07daabccd3917ac528abdb0"} -->
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-312 check does not report conventional global or workflow commit scopes as missing modules
- 用例：CASE-312
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-14.log
- 提交：74c95646cba4
- 时间：2026-10-27T12:29:15.532Z

### run-15
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-oDd5MY/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-oDd5MY/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"8318560e0047c9f1e74b80145b2b1266fa0fc6bf1e21b502450a16d87ed89c5e","commit":"74c95646cba430aaa07daabccd3917ac528abdb0"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-hygiene-invariants/logs/run-15.log
- 提交：74c95646cba4
- 时间：2026-10-27T12:29:16.692Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [ ] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 弱化测试断言：test/doc-templates.test.mjs::CASE-193 CASE-270 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section

提示：
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 142 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 69 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 161 条用例及经过它的场景 CASE-055, CASE-001。
- 任务设计“取舍”仅空白或占位：`.tiller/task/20261027-hygiene-invariants/task.md`。
