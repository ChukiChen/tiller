# 对齐 snapshot 包文件名并去除刻意的非正式说明

<!-- tiller-task:v1 {"version":1,"id":"20261031-soften-snapshot-99","type":"improvement","size":"small","created":"2026-10-30T16:02:45.083Z","base":"c951103a3ae0df0b83f925d8a6ba7807512d5d88","scope":["README.md","test",".tiller/cases/modules/standards",".tiller/cases/modules/workflow/interface.md"],"format":"structured","summary":"README 与 Release 去掉刻意的非正式 release 说明，snapshot 资产文件名与 tag 对齐，版本保持 0.5.0"} -->

## 需求

### 使用场景

- 场景：README 安装段只保留 Node.js 版本要求与指向 snapshot 资产的下载/安装命令；GitHub Release 正文只保留安装示例，使用带 snapshot 的资产文件名，保持标题与 prerelease 不变；相关 README 用例回归通过，并经新分支 PR squash 合入。

### 目标

短目标：移除 README 与 Release 正文中刻意的非正式 release 说明，下载与安装统一指向 `tiller-0.5.0-snapshot.1.tgz`；构建产物重命名为该文件名并替换旧 Release 资产；相关 README 用例回归通过，经新分支 PR 立即 squash 合入，版本保持 0.5.0。

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“移除 README 与 Release 正文中刻意的非正式 release 说明，下载与安装统一指向 `tiller-0.5.0-snapshot.1.tgz`；构建产物重命名为该文件名并替换旧 Release 资产；相关 README 用例回归通过，经新分支 PR 立即 squash 合入，版本保持 0.5.0。”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：README 安装段不再出现“不是正式 release/非正式”对照句；下载链接、npm 安装 URL 与本地示例均使用 `tiller-0.5.0-snapshot.1.tgz`。
- AC-2：GitHub Release v0.5.0-snapshot.1 保持 prerelease，正文只保留指向新文件名的安装示例；新资产 `tiller-0.5.0-snapshot.1.tgz` 可下载，旧资产 `tiller-0.5.0.tgz` 不再并存。
- AC-3：`npm run build` 与 `npm pack` 生成的 `tiller-0.5.0.tgz` 被重命名为 `tiller-0.5.0-snapshot.1.tgz`，`package.json` 版本保持 0.5.0，打包冒烟通过且安装包不进入 Git。
- AC-4：CASE-109、CASE-167、CASE-234、CASE-242 相关测试通过；变更经新分支 PR 立即 squash 合入，LICENSE 与流程门禁代码不变。

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-1: README 安装段不再出现“不是正式 release/非正式”对照句；下载链接、npm 安装 URL 与本地示例均使用 `tiller-0.5.0-snapshot.1.tgz`。
- AC-2: GitHub Release v0.5.0-snapshot.1 保持 prerelease，正文只保留指向新文件名的安装示例；新资产 `tiller-0.5.0-snapshot.1.tgz` 可下载，旧资产 `tiller-0.5.0.tgz` 不再并存。
- AC-3: `npm run build` 与 `npm pack` 生成的 `tiller-0.5.0.tgz` 被重命名为 `tiller-0.5.0-snapshot.1.tgz`，`package.json` 版本保持 0.5.0，打包冒烟通过且安装包不进入 Git。
- AC-4: CASE-109、CASE-167、CASE-234、CASE-242 相关测试通过；变更经新分支 PR 立即 squash 合入，LICENSE 与流程门禁代码不变。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-30T16:05:22.492Z | 825b371367e3 | 这是 0.5.0 的 snapshot 预发布，不是正式 release。太刻意，要改掉；tiller-0.5.0.tgz 包名也带上 snapshot；自动合入，不必再问。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"b7376fe875e7ffefc4c22dc6d9a79a853bce6f5e9bf35886fd501fc93a1dd515","commit":"825b371367e36299be987df74c421d8ea50349fa","by":"boon yu","quote":"这是 0.5.0 的 snapshot 预发布，不是正式 release。太刻意，要改掉；tiller-0.5.0.tgz 包名也带上 snapshot；自动合入，不必再问。","at":"2026-10-30T16:05:22.492Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-8rox5u/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-8rox5u/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-1.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:01.506Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-242 README 以 AI 执行为主并使用 REST API 与 token$' \u002d\u002dtest-reporter=./.tiller/local/verify-fxqkRM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-fxqkRM/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-242 README 以 AI 执行为主并使用 REST API 与 token
- 用例：CASE-242
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-2.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:02.318Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 README is a user-facing quick start without internal flow detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-v8TT7b/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-v8TT7b/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-109 README is a user-facing quick start without internal flow detail
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-3.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:03.610Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' \u002d\u002dtest-reporter=./.tiller/local/verify-7Tmetp/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-7Tmetp/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-1
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-4.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:04.559Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-167 README keeps the user quick start and removes maintainer detail$' \u002d\u002dtest-reporter=./.tiller/local/verify-q9vHpq/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-q9vHpq/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-1
- 测试：test/rules.test.mjs::CASE-167 README keeps the user quick start and removes maintainer detail
- 用例：CASE-167
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-5.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:05.521Z

### run-6
<!-- tiller-verify:v1 {"command":"gh release view v0.5.0-snapshot.1 \u002d\u002djson tagName,name,isPrerelease,body,assets; curl -fsSL https://github.com/ChukiChen/tiller/releases/download/v0.5.0-snapshot.1/tiller-0.5.0-snapshot.1.tgz | sha256sum","exitCode":null,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-105 release checklist is executable and exposed by check
- 用例：CASE-105
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：Release v0.5.0-snapshot.1 仍为 prerelease；正文只含新文件名安装示例；资产仅剩 tiller-0.5.0-snapshot.1.tgz，旧 tiller-0.5.0.tgz 已删除；直链下载 SHA-256 与本地包一致 d63305d0a886d259a3e50e22453cd3056355ff2eb6e36a9e0e4457eccb49e259。
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:16.611Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-162 repository keeps the 0\\.5\\.0 release contract and five full verification entries$' \u002d\u002dtest-reporter=./.tiller/local/verify-lKOmUT/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-lKOmUT/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-7.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:16.871Z

### run-8
<!-- tiller-verify:v1 {"command":"npm run build && npm pack \u002d\u002dpack-destination <临时目录>; mv <临时目录>/tiller-0.5.0.tgz <临时目录>/tiller-0.5.0-snapshot.1.tgz; npm run test:package","exitCode":null,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-3
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：npm run build 与 npm pack 产出 tiller-0.5.0.tgz 后重命名为 tiller-0.5.0-snapshot.1.tgz；test:package 通过，42 个打包文件；package.json 版本保持 0.5.0；安装包只写入临时目录，未进入 Git。
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:17.605Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-220 delivery docs require committing task records before pr$' \u002d\u002dtest-reporter=./.tiller/local/verify-HV6NCt/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-HV6NCt/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"3b71fd04662d34a59a80238614c09d8734a79141908ab429db2fdc9bc3239545","commit":"47e911a10fcc400177302b45d8c59cb5fdece45b"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-220 delivery docs require committing task records before pr
- 用例：CASE-220
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261031-soften-snapshot-99/logs/run-9.log
- 提交：47e911a10fcc
- 时间：2026-10-30T16:07:17.863Z

## 自检

交付前运行 check；验收后运行 accept。
