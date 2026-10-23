# 第9轮：确认去原话化与结构化任务正文

<!-- tiller-task:v1 {"version":1,"id":"20261022-round9","type":"feature","size":"standard","created":"2026-10-22T05:22:30.723Z","base":"7e0d0c2c172ea73ca39805cc3b84da5b56bf4e02","scope":["src","test","resources","scripts","README.md","AGENTS.md",".tiller/cases",".tiller/context",".tiller/index.md",".tiller/project.json",".tiller/rules",".tiller/specs",".tiller/usage.md"],"preExisting":{"src/cases.ts":"9ce8eb9afba52fc756f900e1079f8a5c59fff950aed9d0f17100ae268b8b2535","src/cli.ts":"c181013ca53b25c5a71e2d3f1c49882efcf45e7e295431655bebd2911d21165a","src/flow.ts":"29b720e0850584382cb0e590b57d16656410fae6488a6a4769e61ce862b29510","src/plans.ts":"28ceb66d9b44c1c29c83f2b9a103ab7a99b2d06b3e1b8c3c1b50a332b889a01d","test/first-batch.test.mjs":"c9c9bf0c33451036398b065a518fc385ecdb067bcbc9fe0bebde0fb58184d5f8","test/flow-cli.test.mjs":"6456023cda6d2b76a210abfce44992e03b126b59ff4eb599aceb10b7362ac404","src/confirmer.ts":"6545b63817ebc7d6795989c0d4410ef33494d4330e3e6208d3635b15c9272ad8"},"format":"structured"} -->

## 需求

### 目标

把确认从聊天原话改为绑定结构化需求与设计正文，并让新任务以可执行模板记录目标、范围、AC、方案、取舍及影响。

### 范围

- 做：`confirm`、`accept` 与 `plan confirm` 的确认记录；task.md 结构化模板与解析；相关文档、规则、specs、cases 与测试
- 不做：版本号变更、其他模块或功能
- 涉及模块或文件：workflow 的确认与任务记录，standards 的文档同步，verification 的用例校验

### 验收条件

- AC-1: confirm、accept 和 plan confirm 可省略原话，并记录确认人、时间、对象摘要和当时提交
- AC-2: start 生成结构化需求模板；需求确认校验目标、范围、AC，设计确认校验方案与影响，取舍可为空并提示
- AC-3: 需求与设计使用独立摘要，只改设计不使需求确认失效，改需求会使需求确认失效
- AC-4: 旧格式 task.md 和旧 quote 确认仍可读取、保持有效并可被后续写入保留
- AC-5: CLI 帮助、README、规则、specs、cases 与具名测试同步，版本号保持 0.5.0

## 设计

### 方案

在 task 元信息标记结构化格式，需求下使用目标、范围、验收条件三级标题；standard 任务预置方案、取舍、影响与风险。确认记录改为可选原话，新增确认人与确认部分，需求与设计继续使用独立摘要。旧记录没有格式标记时沿用旧正文与旧确认解析。

### 取舍

保留 `--quote` 作为可选附注，兼容既有调用和真实原话证据；不为旧任务自动改写正文，避免旧确认因格式迁移失效。

### 影响与风险

- 受影响：`confirm`、`accept`、`plan confirm`、task 解析与渲染、帮助和规则文档。
- 需回归：workflow 的阶段、确认失效、关闭/重开用例，以及 standards 的文档一致性与 verification 的 AC 映射。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 对象摘要：a9d8064eb6b40d96c89e477d59bbf616768c7ad4bed821db6585476c32cbf669
- 时间：2026-10-22T07:39:21.415Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 对象摘要：407c5111b195fefe156cf36bb83dd118616ca7ff7e780dea4f351c130b110f35
- 时间：2026-10-22T07:39:21.499Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 对象摘要：18b30a5718b1f30f0ee29e2a2f63643a1e9e668f33d459132573db2c48de9a20
- 时间：2026-10-22T07:39:52.102Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::structured task template validates written requirements and records confirmer without a quote
- 用例：CASE-060, CASE-062
- 命令：node --test --test-name-pattern="structured task template validates written requirements and records confirmer without a quote" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:37:50.231Z

### run-2
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::plan confirmation records a confirmer without a quote
- 用例：CASE-061
- 命令：node --test --test-name-pattern="plan confirmation records a confirmer without a quote" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:37:53.504Z

### run-3
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::small flow produces one task file and records verified acceptance without raw logs
- 用例：CASE-066, CASE-001
- 命令：node --test --test-name-pattern="small flow produces one task file and records verified acceptance without raw logs" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:37:57.117Z

### run-4
- 条件：AC-2
- 测试：test/flow-cli.test.mjs::structured task template validates written requirements and records confirmer without a quote
- 用例：CASE-060, CASE-062
- 命令：node --test --test-name-pattern="structured task template validates written requirements and records confirmer without a quote" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:38:00.002Z

### run-5
- 条件：AC-3
- 测试：test/flow-cli.test.mjs::requirement and design confirmations use independent digests
- 用例：CASE-063
- 命令：node --test --test-name-pattern="requirement and design confirmations use independent digests" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:38:03.592Z

### run-6
- 条件：AC-4
- 测试：test/flow-cli.test.mjs::legacy task text and quoted confirmation remain readable and valid
- 用例：CASE-064
- 命令：node --test --test-name-pattern="legacy task text and quoted confirmation remain readable and valid" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:38:06.686Z

### run-7
- 条件：AC-5
- 测试：test/rules.test.mjs::structured confirmation guidance is synchronized across help and durable docs
- 用例：CASE-065
- 命令：node --test --test-name-pattern="structured confirmation guidance is synchronized across help and durable docs" test/rules.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：c8c5e4879482b83b9bb3f17680118f85098fee78cd8ff8170bee28a8163fab49
- 来源：executed
- 时间：2026-10-22T07:38:09.345Z

### run-8
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::structured task template validates written requirements and records confirmer without a quote
- 用例：CASE-060, CASE-062
- 命令：node --test --test-name-pattern="structured task template validates written requirements and records confirmer without a quote" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:27.287Z

### run-9
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::plan confirmation records a confirmer without a quote
- 用例：CASE-061
- 命令：node --test --test-name-pattern="plan confirmation records a confirmer without a quote" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:30.466Z

### run-10
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::small flow produces one task file and records verified acceptance without raw logs
- 用例：CASE-066, CASE-001
- 命令：node --test --test-name-pattern="small flow produces one task file and records verified acceptance without raw logs" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:34.152Z

### run-11
- 条件：AC-2
- 测试：test/flow-cli.test.mjs::structured task template validates written requirements and records confirmer without a quote
- 用例：CASE-060, CASE-062
- 命令：node --test --test-name-pattern="structured task template validates written requirements and records confirmer without a quote" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:36.992Z

### run-12
- 条件：AC-3
- 测试：test/flow-cli.test.mjs::requirement and design confirmations use independent digests
- 用例：CASE-063
- 命令：node --test --test-name-pattern="requirement and design confirmations use independent digests" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:40.512Z

### run-13
- 条件：AC-4
- 测试：test/flow-cli.test.mjs::legacy task text and quoted confirmation remain readable and valid
- 用例：CASE-064
- 命令：node --test --test-name-pattern="legacy task text and quoted confirmation remain readable and valid" test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:44.175Z

### run-14
- 条件：AC-5
- 测试：test/rules.test.mjs::structured confirmation guidance is synchronized across help and durable docs
- 用例：CASE-065
- 命令：node --test --test-name-pattern="structured confirmation guidance is synchronized across help and durable docs" test/rules.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:46.843Z

## 关闭

### close
- 状态：已关闭
- 原因：已验收，纳入 20261023-hygiene-p1p2 卫生收尾关闭
- 时间：2026-10-23T07:28:47.391Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。
- AC-1 引用的历史用例 CASE-001 未绑定来源 AC；可在本次修改该用例时补上 criteria: ["20261022-round9#AC-1"]。
- 本次改动涉及模块 initialization：建议回归该模块 14 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 3 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
