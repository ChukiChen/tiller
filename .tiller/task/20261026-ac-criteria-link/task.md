# 验收条件编号与 requirement-file 导入

<!-- tiller-task:v1 {"version":1,"id":"20261026-ac-criteria-link","type":"feature","size":"standard","created":"2026-10-26T14:28:58.342Z","base":"016c6a2636107710954ef949596ca89979ba8f94","scope":["src","test","resources","scripts",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/project.json",".tiller/usage.md"],"format":"structured","slug":"ac-criteria-link","summary":"验收条件只用AC-n并由requirement-file导入","requirementFile":".tiller/specs/modules/workflow/ac-criteria-link.md"} -->

## 需求

### 使用场景

维护 tiller 的人与执行 AI 写模块需求、用 `start --requirement-file` 开任务时，需要一套不重复的验收条件编号：条件写在 `.tiller/specs/...`，任务只引用同一套 `AC-n`，不要再发明模块前缀编号或第二套「对照」列表。

### 目标

需求来源：`.tiller/specs/modules/workflow/ac-criteria-link.md`

1. 标题只用「验收条件」，不用「验收条件（稳定）」。
2. specs 内条件编号为普通 `AC-1` / `AC-2`…，由文件路径区分模块，不发明 `LIB-AC-*` 或其它模块前缀 ID。
3. 任务通过需求来源路径引用这些条件；任务正文的验收条件与 specs 使用同一套 `AC-n` 正文，不写「对照 …」平行列表。
4. `start --requirement-file` 从 specs 文件的验收条件节导入 `AC-n`；解析可将历史「验收条件（稳定）」视为「验收条件」别名；新模板与示例不再输出「（稳定）」或 `LIB-AC`。
5. 用例仍挂 specs 需求，关联 AC 为「无」。版本保持 0.5.0。

### 业务范围

- 做：`parseRequirementFile` / `start` 导入与标题别名；模板、rules、usage、decisions、相关 specs 示例与引导；CASE 与测试；修正本仓中带「（稳定）」或引导发明模块前缀 AC 的示例页。
- 不做：升版本；批量改写全部历史 task.md；把叙述性能力小节（如 FLOW-02）改成 AC 列表。
- 假设：verify 仍按任务 `AC-n`；用例关联 AC 继续为「无」。

### 关键行为

1. specs / 骨架 / 新渲染的验收条件标题为「验收条件」。
2. `--requirement-file` 含 `## 验收条件`（或历史别名「验收条件（稳定）」）且含 `- AC-n: …` 时，任务验收条件采用文件中的 `AC-n` 正文。
3. 任务 `### 验收条件` 列出同一套 `AC-n`，可含需求来源路径，不出现「对照 LIB-AC / VER-*」类第二套编号。
4. 文档与 rules 写明：编号按路径作用域使用 `AC-n`，禁止模块前缀 ID 与「对照」双编号。

### 异常与边界

- 仅 `--requirement`、无文件验收条件时：仍用 `--criterion` 声明 `AC-n`。
- 文件无验收条件节或无可解析 `AC-n`：仍要求 `--criterion`。
- 文件与 `--criterion` 同时给出：以文件导入的 `AC-n` 为准，或要求一致；不得生成「对照」平行列表。
- 历史任务正文、历史「验收条件（稳定）」标题可读；新写入只用「验收条件」。

### 验收条件

- AC-1: 新模板、骨架与渲染的验收条件标题仅为「验收条件」，不出现「验收条件（稳定）」
- AC-2: start --requirement-file 从 specs 文件验收条件节导入 AC-n 正文到任务；历史「验收条件（稳定）」可作别名解析；任务不生成对照平行列表或 LIB- 前缀编号
- AC-3: rules、usage、decisions 与相关 specs 示例引导「路径作用域 AC-n、任务只引用、用例关联 AC 为无」；全量门禁通过且版本 0.5.0

## 设计

### 方案

- **编号模型**：`.tiller/specs/...` 的「验收条件」使用普通 `AC-1`/`AC-2`…；模块靠文件路径区分，不发明 `LIB-AC-*` 等前缀。任务「需求来源」指向该路径，`### 验收条件` 复用同一套 `AC-n` 正文，禁止「对照 …」第二套列表。
- **导入**：`parseRequirementFile` 识别「验收条件」，并将历史「验收条件（稳定）」映射为同一节；抽出 `- AC-n: …`。`start --requirement-file` 在文件含可解析 AC 时以文件为准生成任务条件；无 AC 时仍要求 `--criterion`。同时给出 `--criterion` 时不得并排生成对照列表（文件优先或一致校验）。
- **引导**：骨架/rules/usage/decisions 与本仓示例页（如 case-req-link、req-scene-heading）去掉「（稳定）」标题与引导发明模块前缀 AC 的写法；叙述性能力小节（FLOW-02 等）可保留，但不放进验收条件列表冒充 AC 编号。
- **用例**：继续「需求」挂 specs、「关联 AC：无」；覆盖靠 verify。

### 失败处理

- 文件无 AC 且未给 `--criterion`：失败并提示补 criterion 或在 specs 写 AC-n。
- 非法/非 specs 路径：保持既有错误。
- 历史别名仅解析，不写回「（稳定）」。

### 取舍

- 不以 VER-*/FLOW-*-AC-* 作为任务/导入用的稳定 AC 编号（那些可留作叙述小节标题）；验收列表统一 `AC-n`。
- 不强制改写全部历史 task.md；新渲染与新示例走新约定。
- 保留 `--criterion` 以支持无文件或文件无 AC 的场景。

### 影响与风险

- 影响：`src/flow.ts` 解析/start、CLI 是否允许省略 criterion、tests（含旧「文件内 AC 不覆盖命令行」期望）、resources/rules、decisions、相关 specs 示例。
- 风险：依赖「命令行覆盖文件 AC」的旧脚本需改为与文件一致或省略 criterion。
- 缓解：CASE 覆盖导入、别名、标题；文档写明新行为。

### 验证入口

- `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T14:29:45.105Z | 016c6a263610 | 优化吧 |
| 设计 | boon yu | 2026-10-26T14:29:45.199Z | 016c6a263610 | 优化吧 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"0ef88eef0bc7d8469d1d45e32c07c923db63fdca1ed74d7f420f18197ed95d37","commit":"016c6a2636107710954ef949596ca89979ba8f94","by":"boon yu","quote":"优化吧","at":"2026-10-26T14:29:45.105Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"3464a6bc29f7a0bba889941335500ac0564a394e8edb18ddb29c7348b79f4297","commit":"016c6a2636107710954ef949596ca89979ba8f94","by":"boon yu","quote":"优化吧","at":"2026-10-26T14:29:45.199Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-273 acceptance heading is always 验收条件 without the legacy stable suffix$' \u002d\u002dtest-reporter=./.tiller/local/verify-xgiCey/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xgiCey/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"8ddcd3204b66411b75d2e1ebf5a6aca9500fc5eb51d333bb80b3724a7cd3d124","commit":"016c6a2636107710954ef949596ca89979ba8f94"} -->
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-273 acceptance heading is always 验收条件 without the legacy stable suffix
- 用例：CASE-273
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-ac-criteria-link/logs/run-1.log
- 提交：016c6a263610
- 时间：2026-10-26T14:47:17.640Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-274 requirement-file imports AC-n from canonical or legacy headings without a parallel list$' \u002d\u002dtest-reporter=./.tiller/local/verify-k6iZg5/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-k6iZg5/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"8ddcd3204b66411b75d2e1ebf5a6aca9500fc5eb51d333bb80b3724a7cd3d124","commit":"016c6a2636107710954ef949596ca89979ba8f94"} -->
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-274 requirement-file imports AC-n from canonical or legacy headings without a parallel list
- 用例：CASE-274
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-ac-criteria-link/logs/run-2.log
- 提交：016c6a263610
- 时间：2026-10-26T14:47:18.780Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-275 rules and examples guide path-scoped AC-n without prefixed acceptance IDs$' \u002d\u002dtest-reporter=./.tiller/local/verify-S9TluH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-S9TluH/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"8ddcd3204b66411b75d2e1ebf5a6aca9500fc5eb51d333bb80b3724a7cd3d124","commit":"016c6a2636107710954ef949596ca89979ba8f94"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-275 rules and examples guide path-scoped AC-n without prefixed acceptance IDs
- 用例：CASE-275
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-ac-criteria-link/logs/run-3.log
- 提交：016c6a263610
- 时间：2026-10-26T14:47:20.169Z

## 自检

- [x] 需求确认有效
- [ ] 设计确认有效
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
- 过程卫生：需求、设计确认提交 016c6a263610 后，工作区仍有未提交业务改动：resources/rules/activities/requirements.md、resources/rules/quality/verification.md、resources/usage.md、src/cli.ts、src/core.ts、src/flow.ts、test/case-redesign.test.mjs、test/doc-templates.test.mjs 等 10 项。请先提交或移出本任务。
- 改动超出范围：.tiller/usage.md
- 交付范围存在未提交改动：.tiller/cases/modules/standards/interface.md、.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、.tiller/project.json、.tiller/rules/activities/requirements.md、.tiller/rules/quality/verification.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/verification/case-req-link.md、.tiller/specs/modules/verification/requirements.md、.tiller/specs/modules/workflow/ac-criteria-link.md、.tiller/specs/modules/workflow/req-scene-heading.md、.tiller/specs/modules/workflow/requirements.md、.tiller/specs/requirements.md、resources/rules/activities/requirements.md、resources/rules/quality/verification.md、resources/usage.md、src/cli.ts、src/core.ts、src/flow.ts、test/case-redesign.test.mjs、test/doc-templates.test.mjs、test/review-release.test.mjs、test/rules.test.mjs

提示：
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 103 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 35 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 126 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
