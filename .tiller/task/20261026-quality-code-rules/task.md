# 补充代码质量与安全通用规则

<!-- tiller-task:v1 {"version":1,"id":"20261026-quality-code-rules","type":"feature","size":"small","created":"2026-10-26T07:28:41.616Z","base":"6003b5b14903463c8296278e17027b868d600e80","scope":["resources",".tiller","src","test"],"format":"structured","slug":"quality-code-rules","summary":"补充代码质量与安全通用规则","requirementFile":".tiller/local/20261026-quality-code-rules-req.md"} -->

## 需求

### 面向谁与问题

使用 tiller 做 AI 协作开发的人。当前规则对代码质量（命名、扩展性、避免过度设计）与通用安全约定不够完整；用户要求先补规则层，暂不自动化 check。可借鉴 OpenCode AGENTS 的简单、边界校验、反过度设计原则，但不抄 Bun/Effect/TUI 等专属口味。

### 目标

补齐可执行的代码质量与安全通用规则，使实现与交付时有明确对照；resources 与 `.tiller/rules` 镜像一致；新规则纳入受管清单；版本保持 0.5.0。

需求来源：`.tiller/local/20261026-quality-code-rules-req.md`

### 业务范围

- 做：
  1. 新建 `resources/rules/quality/code.md` 与 `.tiller/rules/quality/code.md`（内容一致）。
  2. 扩写 `documents.md`（双份）安全段。
  3. 在 `implementation.md`、`delivery.md`、`rules/index.md`（双份）轻量交叉引用。
  4. 将 `rules/quality/code.md` 纳入 `src/project-metadata.ts` RULES，并更新 digests/`project.json`。
  5. CASE-246 起与测试；全量门禁；版本 0.5.0。
- 不做：不改 `flow.ts` check 自动化；不引入 OpenCode 工具链专属规则；不升版本号。
- 假设与待确认：规则供 AI/人阅读遵守；机械化门禁留后续任务。

### 关键行为

1. `quality/code.md` 覆盖命名、结构、扩展性、反过度设计、可读性、边界校验一次、保持简单、不为假想风险 silently 加复杂度。
2. `documents.md` 安全段在密钥/绝对路径外补充日志/PR 无凭据、输入校验与授权边界、可信依赖、危险操作显式确认、无具体威胁不做过度加固。
3. `implementation.md` / `delivery.md` / `rules/index.md` 引用代码质量与安全约定。
4. 新文件进入受管清单；upgrade/init 可安装；双份镜像一致。
5. CASE-246+ 有测试引用；全量门禁通过。

### 异常与边界

- 主观质量条目写约定，本轮不做硬 fail 扫描。
- resources 与 `.tiller/rules` 内容必须一致。
- 不为假想竞态/安全边角 silently 加复杂度：先说明代价再动手。

### 验收条件

- AC-1: 新建 resources 与 .tiller 的 rules/quality/code.md，含命名、结构、扩展性、反过度设计、可读性、边界校验一次、保持简单、不为假想风险 silently 加复杂度
- AC-2: documents.md（双份）安全段扩展：日志/PR 无凭据、输入校验与授权边界、可信依赖、危险操作显式确认、无具体威胁不做过度加固；保留原有密钥/绝对路径要求
- AC-3: implementation.md、delivery.md、rules/index.md（双份）有轻量交叉引用指向代码质量与安全
- AC-4: code.md 纳入受管 RULES；digests/project.json 按受管流程更新；CASE-246 起覆盖；全量门禁通过；版本 0.5.0

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T07:29:11.172Z | 6003b5b14903 | — |
| 交付验收 | boon yu | 2026-10-26T07:39:02.202Z | 3a64a741e486 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"a3e34c29cfa499ed9d22de9811e6526f1078bf9fc99c7d414dd7b67c4fd6b1f1","commit":"6003b5b14903463c8296278e17027b868d600e80","by":"boon yu","quote":"","at":"2026-10-26T07:29:11.172Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"020e7a9e65b6bd7e39974036e37365e4488c8384c197ef0699503257e62cd31f","commit":"3a64a741e4866db54ed4e9451858e826dec13b31","by":"boon yu","quote":"","at":"2026-10-26T07:39:02.202Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-246 code quality and security rules stay mirrored and managed$' \u002d\u002dtest-reporter=./.tiller/local/verify-mAjMxQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mAjMxQ/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"b96fbbf4bf3cd21c5544adbd7da17c36b3de4f2171c2f98920430a9a76f51d50","commit":"865a5cb41c48c1d9390ae91c4fa0d1261c7645b0"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-246 code quality and security rules stay mirrored and managed
- 用例：CASE-246
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-quality-code-rules/logs/run-1.log
- 提交：865a5cb41c48
- 时间：2026-10-26T07:38:56.322Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-246 code quality and security rules stay mirrored and managed$' \u002d\u002dtest-reporter=./.tiller/local/verify-mAjMxQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mAjMxQ/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"b96fbbf4bf3cd21c5544adbd7da17c36b3de4f2171c2f98920430a9a76f51d50","commit":"865a5cb41c48c1d9390ae91c4fa0d1261c7645b0"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-246 code quality and security rules stay mirrored and managed
- 用例：CASE-246
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-quality-code-rules/logs/run-1.log
- 提交：865a5cb41c48
- 时间：2026-10-26T07:38:56.322Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-246 code quality and security rules stay mirrored and managed$' \u002d\u002dtest-reporter=./.tiller/local/verify-mAjMxQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mAjMxQ/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"b96fbbf4bf3cd21c5544adbd7da17c36b3de4f2171c2f98920430a9a76f51d50","commit":"865a5cb41c48c1d9390ae91c4fa0d1261c7645b0"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-246 code quality and security rules stay mirrored and managed
- 用例：CASE-246
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-quality-code-rules/logs/run-1.log
- 提交：865a5cb41c48
- 时间：2026-10-26T07:38:56.322Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-246 code quality and security rules stay mirrored and managed$' \u002d\u002dtest-reporter=./.tiller/local/verify-mAjMxQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mAjMxQ/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"b96fbbf4bf3cd21c5544adbd7da17c36b3de4f2171c2f98920430a9a76f51d50","commit":"865a5cb41c48c1d9390ae91c4fa0d1261c7645b0"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-246 code quality and security rules stay mirrored and managed
- 用例：CASE-246
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-quality-code-rules/logs/run-1.log
- 提交：865a5cb41c48
- 时间：2026-10-26T07:38:56.322Z

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
- 本次改动涉及模块 initialization：建议回归该模块 64 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 31 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 109 条用例及经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/modules/initialization/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/initialization/design.md`（“## <方案>” + 取舍与影响）；`.tiller/specs/modules/standards/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/standards/design.md`（“## <方案>” + 取舍与影响）。纯过程性变更可忽略。
