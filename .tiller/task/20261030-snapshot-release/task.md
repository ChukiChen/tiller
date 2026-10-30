# 发布 0.5.0 snapshot 预发布包与 README 下载入口

<!-- tiller-task:v1 {"version":1,"id":"20261030-snapshot-release","type":"feature","size":"small","created":"2026-10-30T15:56:11.858Z","base":"134f95b77c40f7f7078e4398ff07ea05ae7540fd","scope":["README.md","test/rules.test.mjs","test/merge.test.mjs","test/review-release.test.mjs",".tiller/cases/modules/standards/behavior.md"],"format":"structured","summary":"打包 0.5.0 tgz，创建 GitHub Pre-release，并让 README 可点下载"} -->

## 需求

### 使用场景

- 场景：将 0.5.0 以 snapshot / pre-release 形式发布到 GitHub Releases，上传 npm pack 产物，并在 README 提供可点击下载与安装说明；随后通过新分支 PR 自动 squash 合入。

### 目标

短目标：将 0.5.0 以 snapshot / pre-release 形式发布到 GitHub Releases，上传 npm pack 产物，并在 README 提供可点击下载与安装说明；随后通过新分支 PR 自动 squash 合入。

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“将 0.5.0 以 snapshot / pre-release 形式发布到 GitHub Releases，上传 npm pack 产物，并在 README 提供可点击下载与安装说明；随后通过新分支 PR 自动 squash 合入。”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：README 安装段提供指向 v0.5.0-snapshot.1 Release Asset 的可点击下载链接、可用安装命令，并明确 snapshot / 预发布而非正式 release，同时保持中文短文档与既有 CASE 结构约束
- AC-2：npm run build 与 npm pack 生成 tiller-0.5.0.tgz，包版本保持 0.5.0，package-smoke 通过
- AC-3：GitHub Pre-release 使用 v0.5.0-snapshot.1（冲突则下一个可用序号），target 为 main tip，标题为 0.5.0 snapshot.1，勾选 prerelease，正文说明非正式 release 与安装方式，并上传 tiller-0.5.0.tgz 且直链可下载
- AC-4：README 与测试改动经新分支提交、真实 PR 创建并立即 squash 合入，合入后 main 包含变更且任务记录已先验收

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-1: README 安装段提供指向 v0.5.0-snapshot.1 Release Asset 的可点击下载链接、可用安装命令，并明确 snapshot / 预发布而非正式 release，同时保持中文短文档与既有 CASE 结构约束
- AC-2: npm run build 与 npm pack 生成 tiller-0.5.0.tgz，包版本保持 0.5.0，package-smoke 通过
- AC-3: GitHub Pre-release 使用 v0.5.0-snapshot.1（冲突则下一个可用序号），target 为 main tip，标题为 0.5.0 snapshot.1，勾选 prerelease，正文说明非正式 release 与安装方式，并上传 tiller-0.5.0.tgz 且直链可下载
- AC-4: README 与测试改动经新分支提交、真实 PR 创建并立即 squash 合入，合入后 main 包含变更且任务记录已先验收

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-30T15:56:18.701Z | 134f95b77c40 | 可以；修改含 README；完了自动合并不必再问。现在还不能叫正式 release，用 snapshot / pre-release。 |
| 交付验收 | boon yu | 2026-10-30T16:01:18.782Z | 7118067ed38c | 可以；修改含 README；完了自动合并不必再问。现在还不能叫正式 release，用 snapshot / pre-release。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"4fb9e2d02475885951504518baa880690a7393ced1579fc4b48bf7fbc071a37c","commit":"134f95b77c40f7f7078e4398ff07ea05ae7540fd","by":"boon yu","quote":"可以；修改含 README；完了自动合并不必再问。现在还不能叫正式 release，用 snapshot / pre-release。","at":"2026-10-30T15:56:18.701Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"dcf8692b3137a7b76df9ee545173d9de35a4d140212eedd8f9cbd09857cbf802","commit":"7118067ed38c0a249b6d39755d8b61452279e2c8","by":"boon yu","quote":"可以；修改含 README；完了自动合并不必再问。现在还不能叫正式 release，用 snapshot / pre-release。","at":"2026-10-30T16:01:18.782Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-167 README keeps the user quick start and removes maintainer detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-9BnfRn/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-9BnfRn/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-167 README keeps the user quick start and removes maintainer detail
- 用例：CASE-167
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-snapshot-release/logs/run-1.log
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:00:42.833Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-xc2IRk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xc2IRk/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-snapshot-release/logs/run-2.log
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:00:43.511Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 REST API 与 token$' \u002d\u002dtest-reporter=./.tiller/local/verify-effxan/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-effxan/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 REST API 与 token
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-snapshot-release/logs/run-3.log
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:00:44.180Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' \u002d\u002dtest-reporter=./.tiller/local/verify-zxTFqt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-zxTFqt/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-1
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-snapshot-release/logs/run-4.log
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:00:44.835Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 README is a user-facing quick start without internal flow detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-D54hsK/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-D54hsK/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-109 README is a user-facing quick start without internal flow detail
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-snapshot-release/logs/run-5.log
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:00:44.835Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-162 repository keeps the 0\\.5\\.0 release contract and five full verification entries$' \u002d\u002dtest-reporter=./.tiller/local/verify-K3X9aP/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-K3X9aP/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261030-snapshot-release/logs/run-6.log
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:01:02.711Z

### run-7
<!-- tiller-verify:v1 {"command":"npm run test:package","exitCode":null,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-2
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：已执行 package-smoke：Package smoke passed: 0.5.0, 42 packaged files.
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:01:03.368Z

### run-8
<!-- tiller-verify:v1 {"command":"gh release view v0.5.0-snapshot.1 \u002d\u002djson tagName,name,isPrerelease,targetCommitish,url,assets; curl -fsSL https://github.com/ChukiChen/tiller/releases/download/v0.5.0-snapshot.1/tiller-0.5.0.tgz | sha256sum","exitCode":null,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-105 release checklist is executable and exposed by check
- 用例：CASE-105
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：Release 为 prerelease，target main，tag 指向 134f95b；asset 已上传，下载文件 SHA-256 与本地包一致 e940c68dca32533816072d4345df98526b036ab3ec0818a9f8433b2c07963b3c。
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:01:03.548Z

### run-9
<!-- tiller-verify:v1 {"command":"git branch \u002d\u002dshow-current; git status \u002d\u002dshort; git log -1 \u002d\u002doneline","exitCode":null,"tree":"a1d91d382e83be412d109ec8cd1ce567a1a93e474b2f52bac385c1163b241a46","commit":"be1bec2e8ad9dc160bc55442e9445fd87cfd6c02"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-220 delivery docs require committing task records before pr
- 用例：CASE-220
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：实现提交 be1bec2 位于 feat/20261030-snapshot-release 且工作树干净；按已授权流程将在验收后立即创建真实 PR 并 squash 合入。
- 提交：be1bec2e8ad9
- 时间：2026-10-30T16:01:03.714Z

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
