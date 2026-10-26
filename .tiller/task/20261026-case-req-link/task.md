# 用例锚定稳定需求并取消 task#AC 回指

<!-- tiller-task:v1 {"version":1,"id":"20261026-case-req-link","type":"feature","size":"standard","created":"2026-10-26T12:14:54.693Z","base":"72448eba9010e6666b684fa7881a39aa95b21f86","scope":["src","test","resources",".tiller/rules",".tiller/cases",".tiller/usage.md",".tiller/specs/decisions.md",".tiller/specs","scripts",".tiller/project.json"],"format":"structured","slug":"case-req-link","summary":"用例改为挂稳定需求，去掉 task#AC 回指","requirementFile":".tiller/specs/modules/verification/case-req-link.md"} -->

## 需求

### 面向谁与问题

维护 tiller 的人与执行 AI。现行 `case add` / check 强制全局用例写入「关联 AC：`<任务>#AC-n`」，把稳定的测试设计钉在**短暂任务**上；正确方向应是 **task → 需求**（任务引用 `.tiller/specs/...` 稳定需求），用例挂在稳定需求上，覆盖由 verify 的 AC→测试→CASE 与用例的「需求」字段承担。与已去掉用例「源码」字段同一精神：用例不依赖短暂交付物。

### 目标

需求来源：`.tiller/specs/modules/verification/case-req-link.md`

稳定条件：`verification/requirements.md` 中 VER-CASE-REQ-1～3；`workflow/requirements.md` 中 FLOW-SPEC-AC-1～2。

1. 新用例不再要求或写入「关联 AC：`<任务>#AC-n`」作为任务来源；字段可省略或仅允许「无」，不伪造 criteria。
2. `case add` / CLI / help / 模板 / rules（QUALITY-VERIFY、activities、usage）去掉对任务 criteria 回指的要求。
3. `check` / verify / accept：AC 覆盖不依赖用例内嵌 `taskId#AC`；覆盖来自任务 verify（AC→test→CASE）与用例「需求」指向 specs；`task.md` 明确引用所实现的稳定需求路径。
4. `start` / 任务渲染：任务记录/引用需求文件或 specs 路径（task → 需求）。若 `--requirement-file` 把结构化需求压成一行，一并修复。
5. 历史已含 `task#AC` 的用例：不大批量伪造；保持可读，或迁为「无」且 check 对缺失/历史作非阻断 warning（与既有历史债立场一致）——取更小且一致的改法。
6. 全量门禁：build/lint/typecheck/test + test:package；为新行为增加 CASE-*。

版本保持 0.5.0。

### 业务范围

- 做：
  1. `case add`：去掉对 `--criterion` / 来源 AC 的必填；新用例「关联 AC」写「无」（或不再写该行若解析允许缺省为无）；仍要求「需求」指向存在的 specs 路径（可用 `--spec`）。
  2. 解析：`关联 AC：无` / 空 / 缺省合法；历史 `task#AC` 仍可读不报硬错；新写入不再产生 task#AC。
  3. `evaluateCriterion` / check：取消「用例 criteria 必须回指 `task#AC`」硬门槛；AC 覆盖以 verify 记录（含 CASE）+ 通过测试为准；设计阶段在需求/设计确认后仍要求相关全局用例存在且最终有测试引用，但用例通过「需求」与模块挂靠，不靠 taskId。
  4. `start`：`--requirement-file` 保留多行结构并保证「需求来源：`路径`」；任务正文能看出实现哪份稳定需求；CLI/usage/rules/decisions/受管资源同步。
  5. 历史用例：parser 兼容；library/check 对空 criteria 或历史 task#AC 以 warning 提示迁移，不阻断已验收历史任务。
  6. 用例先行 + 测试 + 文档同步；全量质量门禁。
- 不做：升版本；把 AC 稳定编号迁入 specs 的大重构（若有更优设计可小步，但不强制本波）；批量改写全部历史关联 AC 为伪造新 ID；CloudAgent。
- 假设：verify 仍按任务 AC 编号；测试名/注释继续引用 CASE；模块 specs 路径约定不变。

### 关键行为

1. `tiller case add <task> ...` 无需 `--criterion`；生成用例「关联 AC：无」，「需求」指向 `.tiller/specs/...`。
2. `check`/`accept`：仅有 verify（AC↔CASE↔通过测试）即可覆盖 AC，不因用例未写 `task#AC` 失败。
3. `start --requirement-file` 后 task.md「需求」保留文件多行要点并含需求来源路径。
4. 历史含 `task#AC` 的用例仍可被解析；新流程不再新增此类绑定。

### 异常与边界

- 仍传 `--criterion`：可拒绝（推荐）或忽略并 warning 后写「无」；不得再写入 task#AC。
- 缺「需求」/无效 specs 路径：case add 仍失败。
- 已验收历史任务：不因本波规则变严而判失败。
- 空 criteria 历史债：warning，与去源码后的历史立场一致。

### 验收条件

- AC-1: case add 不再要求 --criterion；新用例关联 AC 为无或 specs 稳定条件；需求指向稳定 specs；help/CLI 一致（对照 VER-CASE-REQ-1/3）
- AC-2: check/verify/accept 覆盖不依赖用例内 taskId#AC；由任务对 specs 条件的引用 + verify（条件→test→CASE）承担；文档写明 task→specs、用例→specs（对照 VER-CASE-REQ-2）
- AC-3: start --requirement-file 保留多行结构；需求来源必须为 `.tiller/specs/...`（对照 FLOW-SPEC-AC-1）；拒绝 ephemeral `.tiller/local/…-req.md`
- AC-4: 历史 task#AC/空 criteria 可读不硬阻断；版本 0.5.0；全量门禁通过
- AC-5: 稳定 AC 正文落在 `.tiller/specs/...`；任务只引用这些条件，不把 taskId#AC 当用例锚（对照 FLOW-SPEC-AC-2、VER-CASE-REQ-*）
- AC-6: requirement-file 指向 local 时失败并提示迁入 specs；指向 specs 时多行保留且「需求来源」为 specs 路径

## 设计

### 方案

- **链接模型**：稳定 AC 与需求正文在 `.tiller/specs/...`（本波含 `verification/case-req-link.md` 与 VER-CASE-REQ-*、FLOW-SPEC-AC-*）；task 只引用；用例「需求」/可选稳定关联挂 specs；「关联 AC」为「无」或 specs 稳定条件，禁止 `taskId#AC`。`--requirement-file` 仅允许 specs 路径。
- **覆盖路径**：`verify` 记录 AC→测试→CASE；`check`/`accept` 以该记录与测试扫描为准，取消「用例 criteria 必须回指 task#AC」硬门槛。
- **case add**：`--criterion` 不再必填；若仍传入则拒绝或 warning 后写「无」，禁止再写入 task#AC；继续要求 `--spec`/默认模块 requirements 路径存在。
- **start --requirement-file**：保留文件多行结构（若已是结构化小节则嵌入对应段，否则原样放入目标下），始终写入「需求来源：`路径`」，验收条件仍由 `--criterion` 生成。
- **历史**：解析兼容 `task#AC` 与「无」；library/check 对空 criteria 或历史 task#AC 给 warning，不阻断已验收任务。

### 失败处理

- 缺稳定需求路径：case add 失败并中文提示。
- 误传 `--criterion`：明确错误或 warning，不产生 task#AC。
- requirement-file 过大/空/非相对路径：保持既有错误码。

### 取舍

- 不把 AC 编号迁入 specs（避免本波大重构）；稳定锚是需求文件路径，任务 AC 仍是交付验收单元。
- 历史用例不批量改写为「无」，避免无意义 diff；新写入一律「无」。
- 拒绝保留「可选 task#AC」双轨，以免继续钉任务。

### 影响与风险

- 影响：`src/cases.ts`、`src/flow.ts` evaluateCriterion、`src/cli.ts`、resources/usage/rules、`.tiller/cases` 新条目、decisions、相关测试。
- 风险：旧测试断言 `关联 AC：task#AC` 需改；外部工程若仍依赖回指需按新模型用 verify 绑定。
- 缓解：兼容历史解析；文档与 CASE 覆盖新行为。

### 验证入口

- `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`
- 针对 case add 无 criterion、check 无回指、requirement-file 多行、历史兼容的单元/集成测试。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T12:56:20.152Z | dd9d2db9e210 | — |
| 设计 | boon yu | 2026-10-26T12:56:20.245Z | dd9d2db9e210 | — |
| 交付验收 | boon yu | 2026-10-26T12:56:51.008Z | dd9d2db9e210 | 开启PR |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"e6f9af198b60075640b5c438e5a51402280f646ba206bb9c4d4f26e454cab44c","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d","by":"boon yu","quote":"","at":"2026-10-26T12:56:20.152Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"f367c310a3754e88a217b52f26eee2d197a7241e84b14f8d06db82c8d2056619","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d","by":"boon yu","quote":"","at":"2026-10-26T12:56:20.245Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"ded485c1a39d1e55ecd31ff8fb7c2c681c267c4a223bd8613f5a8c2ede420550","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d","by":"boon yu","quote":"开启PR","at":"2026-10-26T12:56:51.008Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-263 case add needs no criterion, writes no task AC and rejects the old option$' \u002d\u002dtest-reporter=./.tiller/local/verify-RRxdba/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-RRxdba/report.jsonl test/case-redesign.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-1
- 测试：test/case-redesign.test.mjs::CASE-263 case add needs no criterion, writes no task AC and rejects the old option
- 用例：CASE-263
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-15.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:37.175Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-054 CASE-264 check accepts verified coverage without a task AC back-reference$' \u002d\u002dtest-reporter=./.tiller/local/verify-PqiLby/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-PqiLby/report.jsonl test/first-batch.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-2
- 测试：test/first-batch.test.mjs::CASE-054 CASE-264 check accepts verified coverage without a task AC back-reference
- 用例：CASE-054, CASE-264
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-16.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:38.499Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-267 guidance and decisions use task-to-specs and case-to-specs links$' \u002d\u002dtest-reporter=./.tiller/local/verify-dGSKxG/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-dGSKxG/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-267 guidance and decisions use task-to-specs and case-to-specs links
- 用例：CASE-267
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-17.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:40.059Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-107 CASE-265 start requirement-file preserves structured multiline content and source$' \u002d\u002dtest-reporter=./.tiller/local/verify-VjMKoa/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-VjMKoa/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-107 CASE-265 start requirement-file preserves structured multiline content and source
- 用例：CASE-107, CASE-265
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-18.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:40.600Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-266 historical task AC and empty criteria stay readable without hard blocking$' \u002d\u002dtest-reporter=./.tiller/local/verify-GRDwCC/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-GRDwCC/report.jsonl test/case-redesign.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-4
- 测试：test/case-redesign.test.mjs::CASE-266 historical task AC and empty criteria stay readable without hard blocking
- 用例：CASE-266
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-19.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:41.984Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-268 stable AC bodies live in specs and tasks link specs$' \u002d\u002dtest-reporter=./.tiller/local/verify-Pdp7B7/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Pdp7B7/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-268 stable AC bodies live in specs and tasks link specs
- 用例：CASE-268
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-20.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:42.658Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-269 requirement-file rejects local paths and keeps specs multiline source$' \u002d\u002dtest-reporter=./.tiller/local/verify-bUkLZP/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-bUkLZP/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"75c2e3d6f98e18fa18daef9b8ba1bcbedd33a0029a673495217fbf718f7a0ad5","commit":"dd9d2db9e2105fea1201b84ced6a97c96ea9023d"} -->
- 条件：AC-6
- 测试：test/review-release.test.mjs::CASE-269 requirement-file rejects local paths and keeps specs multiline source
- 用例：CASE-269
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-case-req-link/logs/run-21.log
- 提交：dd9d2db9e210
- 时间：2026-10-26T12:56:43.191Z

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
- 97 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 33 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 122 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 4 个测试用例（请确认对应功能已删除；详情见 Git diff）。
