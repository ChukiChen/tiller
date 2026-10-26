# 需求首节标题改为使用场景

<!-- tiller-task:v1 {"version":1,"id":"20261026-req-scene-heading","type":"feature","size":"small","created":"2026-10-26T13:45:45.673Z","base":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9","scope":["src","test","resources","scripts",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/project.json"],"format":"structured","slug":"req-scene-heading","summary":"结构化需求首节改为使用场景","requirementFile":".tiller/specs/modules/workflow/req-scene-heading.md"} -->

## 需求

### 使用场景

维护 tiller 的人与执行 AI 写任务需求、读模板与规则时，需要第一节标题表达场景与背景。用户已选定「使用场景」作为该槽位固定标题。

### 目标

需求来源：`.tiller/specs/modules/workflow/req-scene-heading.md`

将结构化需求模板、校验键、规则与文档中该节标题统一为「使用场景」；占位说明与标题对齐；章节顺序保持：使用场景、目标、业务范围、关键行为、异常与边界、验收条件。版本保持 0.5.0。

稳定条件：

- FLOW-SCENE-1：`start` / 骨架 / `REQUIREMENT_SECTIONS` 与确认校验列表使用「使用场景」作为第一节标题键
- FLOW-SCENE-2：rules、模块说明、workflow/initialization 规格与 decisions 中描述该槽位的措辞改为「使用场景」
- FLOW-SCENE-3：相关测试与 package-smoke 断言新标题；占位改为「写主要使用场景与背景依据」类短文；历史 `.tiller/task/*/task.md` 可保留旧标题

### 业务范围

- 做：更新 `src/core.ts`、`src/flow.ts`、resources/rules、受管 `.tiller/rules`、相关 specs 描述、测试与 smoke；解析可将历史标题映射到「使用场景」以免旧 requirement-file 落入 extras；新增 CASE 覆盖渲染/校验
- 不做：升版本；批量改写历史已关闭任务正文；改其它需求章节名
- 假设：用户已确认标题用词为「使用场景」

### 关键行为

1. 新建任务与 init 骨架首节标题为「使用场景」
2. confirm requirements 校验该节键名为「使用场景」
3. `--requirement-file` 若仍写旧标题，解析映射到新键（可选兼容）或仓库内 specs 已改写

### 异常与边界

- 历史任务记录中的旧标题不强制改写
- 不改「目标」等其它节名

### 验收条件

- AC-1: start与骨架与REQUIREMENT_SECTIONS及确认校验以使用场景为第一节标题键（FLOW-SCENE-1）
- AC-2: rules与相关specs/decisions措辞改为使用场景；占位与标题对齐（FLOW-SCENE-2）
- AC-3: 测试与package-smoke断言新标题；历史task可保留旧标题；全量门禁通过且版本0.5.0（FLOW-SCENE-3）

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T14:00:24.630Z | adbd6f45f28b | 使用场景 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"f3af69aeed252a8312382168387e44b122434edfec19b78fba36e46c44f85e30","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9","by":"boon yu","quote":"使用场景","at":"2026-10-26T14:00:24.630Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-192 CASE-270 structured requirements keep business scope separate from target paths$' \u002d\u002dtest-reporter=./.tiller/local/verify-ZBcRjU/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ZBcRjU/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"6484547042d0ae6db4e3444b3e046bbf2977624315cc7ba3fd7f8c449fdbf1d7","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-192 CASE-270 structured requirements keep business scope separate from target paths
- 用例：CASE-270
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-req-scene-heading/logs/run-1.log
- 提交：adbd6f45f28b
- 时间：2026-10-26T14:00:45.433Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-193 CASE-270 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section$' \u002d\u002dtest-reporter=./.tiller/local/verify-vw92RT/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-vw92RT/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"6484547042d0ae6db4e3444b3e046bbf2977624315cc7ba3fd7f8c449fdbf1d7","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-193 CASE-270 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section
- 用例：CASE-270
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-req-scene-heading/logs/run-2.log
- 提交：adbd6f45f28b
- 时间：2026-10-26T14:00:45.433Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-195 CASE-270 CASE-272 init creates complete requirement and design section skeletons without long examples$' \u002d\u002dtest-reporter=./.tiller/local/verify-42XOIO/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-42XOIO/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"6484547042d0ae6db4e3444b3e046bbf2977624315cc7ba3fd7f8c449fdbf1d7","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-195 CASE-270 CASE-272 init creates complete requirement and design section skeletons without long examples
- 用例：CASE-270
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-req-scene-heading/logs/run-3.log
- 提交：adbd6f45f28b
- 时间：2026-10-26T14:00:45.433Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-195 CASE-270 CASE-272 init creates complete requirement and design section skeletons without long examples$' \u002d\u002dtest-reporter=./.tiller/local/verify-7egGPo/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-7egGPo/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"6484547042d0ae6db4e3444b3e046bbf2977624315cc7ba3fd7f8c449fdbf1d7","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9"} -->
- 条件：AC-2
- 测试：test/doc-templates.test.mjs::CASE-195 CASE-270 CASE-272 init creates complete requirement and design section skeletons without long examples
- 用例：CASE-272
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-req-scene-heading/logs/run-4.log
- 提交：adbd6f45f28b
- 时间：2026-10-26T14:00:54.817Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-107 CASE-265 CASE-271 start requirement-file preserves structured multiline content and source$' \u002d\u002dtest-reporter=./.tiller/local/verify-ndQaHm/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ndQaHm/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"6484547042d0ae6db4e3444b3e046bbf2977624315cc7ba3fd7f8c449fdbf1d7","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9"} -->
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-107 CASE-265 CASE-271 start requirement-file preserves structured multiline content and source
- 用例：CASE-271
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-req-scene-heading/logs/run-5.log
- 提交：adbd6f45f28b
- 时间：2026-10-26T14:00:56.733Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-wBtAnh/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-wBtAnh/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6484547042d0ae6db4e3444b3e046bbf2977624315cc7ba3fd7f8c449fdbf1d7","commit":"adbd6f45f28b3050c45e30be60a68e8a62fcfaa9"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-req-scene-heading/logs/run-6.log
- 提交：adbd6f45f28b
- 时间：2026-10-26T14:00:59.470Z

## 自检

- [x] 需求确认有效
- [x] 该任务无需设计确认
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [ ] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 过程卫生：需求确认提交 adbd6f45f28b 后，工作区仍有未提交业务改动：resources/rules/activities/requirements.md、resources/rules/quality/documents.md、scripts/package-smoke.mjs、src/core.ts、src/flow.ts、test/case-redesign.test.mjs、test/doc-templates.test.mjs、test/flow-cli.test.mjs 等 11 项。请先提交或移出本任务。
- AC-1 尚无验证。
- AC-2 尚无验证。
- AC-3 尚无验证。
- 交付范围存在未提交改动：.tiller/cases/modules/standards/interface.md、.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、.tiller/project.json、.tiller/rules/activities/requirements.md、.tiller/rules/quality/documents.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/initialization/design.md、.tiller/specs/modules/verification/case-req-link.md、.tiller/specs/modules/workflow/design.md、.tiller/specs/modules/workflow/req-scene-heading.md、.tiller/specs/modules/workflow/requirements.md、resources/rules/activities/requirements.md、resources/rules/quality/documents.md、scripts/package-smoke.mjs、src/core.ts、src/flow.ts、test/case-redesign.test.mjs、test/doc-templates.test.mjs、test/flow-cli.test.mjs、test/helpers.mjs、test/review-release.test.mjs、test/rules.test.mjs

提示：
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 100 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 34 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 124 条用例及经过它的场景 CASE-055, CASE-001。
- 需求“业务范围·做”包含交付路径 `src/core.ts`；业务范围应写约束，交付路径请只记录在任务范围（--target）：`.tiller/task/20261026-req-scene-heading/task.md`。
- 需求“业务范围·做”包含交付路径 `src/flow.ts`；业务范围应写约束，交付路径请只记录在任务范围（--target）：`.tiller/task/20261026-req-scene-heading/task.md`。
- 需求“业务范围·做”包含交付路径 `resources/rules`；业务范围应写约束，交付路径请只记录在任务范围（--target）：`.tiller/task/20261026-req-scene-heading/task.md`。
- 需求“业务范围·做”包含交付路径 `.tiller/rules`；业务范围应写约束，交付路径请只记录在任务范围（--target）：`.tiller/task/20261026-req-scene-heading/task.md`。
- 修改的测试文件移除了 4 个测试用例（请确认对应功能已删除；详情见 Git diff）。
