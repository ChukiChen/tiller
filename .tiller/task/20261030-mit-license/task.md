# 为 tiller 增加 MIT 许可证

<!-- tiller-task:v1 {"version":1,"id":"20261030-mit-license","type":"documentation","size":"small","created":"2026-10-30T15:42:05.580Z","base":"eab0dfa10058bd13041e82d2c37d01cccf236108","scope":["LICENSE","package.json","README.md","test/rules.test.mjs",".tiller/cases/modules/workflow/behavior.md"],"format":"structured","summary":"新增标准 MIT LICENSE，并同步包元信息与 README 链接"} -->

## 需求

### 使用场景

- 仓库使用者、贡献者和 npm 包使用者需要从根目录明确获知 tiller 以 MIT 许可证授权。
- 维护者需要在包元信息、README 与许可证正文之间保持一致，避免分发时出现许可证信息缺失或冲突。
- 本次交付经维护者授权自动创建 PR 并立即 squash 合入，不需要再次确认合入。

### 目标

1. 在仓库根目录新增完整、标准的 MIT LICENSE，版权持有人为 ChukiChen，年份为 2026。
2. 在 package.json 中声明 `"license": "MIT"`。
3. 在 README 末尾以一行链接指向 LICENSE，保持快速开始简短。
4. 增加许可证发布契约回归断言，完成验证后通过 PR squash 合入。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

- 做：新增 LICENSE；修改 package.json 的 license 字段；在 README 末尾增加一行许可证链接；在现有发布契约测试与 CASE-314 中补充许可证断言。
- 不做：不修改 CLI、src、resources、工作流规则、构建脚本、依赖版本、包版本、package-lock 或其他业务行为；不清理既有无关 worktree 或分支。
- 假设：用户已选择 MIT，授权使用 ChukiChen/2026，并明确授权创建 PR 后立即 squash 合入。
- 基线：`eab0dfa10058bd13041e82d2c37d01cccf236108` 为本任务起点。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：LICENSE 包含完整标准 MIT 正文，版权行为 Copyright (c) 2026 ChukiChen
- AC-2：package.json 的 license 字段为 MIT
- AC-3：README 保持简短并包含 License: MIT 链接到 LICENSE
- AC-4：改动仅限许可证文件、包元信息、README、许可证回归断言及对应用例，不修改流程代码

### 异常与边界

- LICENSE 必须是完整标准 MIT 正文，不得使用占位符、附加限制或与 package.json 冲突的许可证。
- README 只增加一行链接，不扩展快速开始或重复许可证全文。
- 不因许可证变更调整版本号、发布包内容规则或流程实现。
- 任一验收条件失败、验证无法执行或 PR 未确认合入时不得声明交付完成。

### 验收条件

- AC-1: LICENSE 包含完整标准 MIT 正文，版权行为 Copyright (c) 2026 ChukiChen
- AC-2: package.json 的 license 字段为 MIT
- AC-3: README 保持简短并包含 License: MIT 链接到 LICENSE
- AC-4: 改动仅限许可证文件、包元信息、README、许可证回归断言及对应用例，不修改流程代码

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-30T15:42:21.200Z | eab0dfa10058 | 选 MIT；改完自动合并，不必再问。 |
| 交付验收 | ChukiChen | 2026-10-30T15:43:32.479Z | dd681b574d31 | 改完自动合并，不必再问。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"5a2c1b0a97740a84dbec2066bd7c660050f3241fb221858615c9f5554269386f","commit":"eab0dfa10058bd13041e82d2c37d01cccf236108","by":"ChukiChen","quote":"选 MIT；改完自动合并，不必再问。","at":"2026-10-30T15:42:21.200Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"39ff72a3a8b2f39db3eb6c7b7810b0b1f3f355978cdc37da54c361b22605a68f","commit":"dd681b574d315ab7101b80532677ce92def3a250","by":"ChukiChen","quote":"改完自动合并，不必再问。","at":"2026-10-30T15:43:32.479Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约、许可证与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-I21VgN/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I21VgN/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6762ac0da226ae93158993b257b4e3b856e5029ed4202168a4dea71d1a1ebca6","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约、许可证与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-2.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:42:50.684Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约、许可证与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-I21VgN/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I21VgN/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6762ac0da226ae93158993b257b4e3b856e5029ed4202168a4dea71d1a1ebca6","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约、许可证与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-2.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:42:50.684Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约、许可证与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-I21VgN/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I21VgN/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6762ac0da226ae93158993b257b4e3b856e5029ed4202168a4dea71d1a1ebca6","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约、许可证与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-2.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:42:50.684Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约、许可证与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-I21VgN/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I21VgN/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"6762ac0da226ae93158993b257b4e3b856e5029ed4202168a4dea71d1a1ebca6","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约、许可证与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-2.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:42:50.684Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-hqjfdk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-hqjfdk/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"467181293986203883fe38bc3060176945c91c0c5b5cfb49136d7aaf7c712aa4","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-5.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:43:08.533Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-hqjfdk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-hqjfdk/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"467181293986203883fe38bc3060176945c91c0c5b5cfb49136d7aaf7c712aa4","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-5.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:43:08.533Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-hqjfdk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-hqjfdk/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"467181293986203883fe38bc3060176945c91c0c5b5cfb49136d7aaf7c712aa4","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-5.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:43:08.533Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-314 0\\.5\\.0 发布契约与完整质量门禁保持覆盖$' \u002d\u002dtest-reporter=./.tiller/local/verify-hqjfdk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-hqjfdk/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"467181293986203883fe38bc3060176945c91c0c5b5cfb49136d7aaf7c712aa4","commit":"d3faf2bddd7972cfb5ba833e0ff1b3ff220c53a8"} -->
- 条件：AC-4
- 测试：test/rules.test.mjs::CASE-314 0.5.0 发布契约与完整质量门禁保持覆盖
- 用例：CASE-314
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-mit-license/logs/run-5.log
- 提交：d3faf2bddd79
- 时间：2026-10-30T15:43:08.533Z

## 自检

- [x] 需求确认有效
- [x] 该任务无需设计确认
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
- 165 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 141 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例；建议同时回归经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 52 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 181 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/modules/initialization/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/initialization/design.md`（“## <方案>” + 取舍与影响）；`.tiller/specs/modules/standards/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/standards/design.md`（“## <方案>” + 取舍与影响）。纯过程性变更可忽略。
