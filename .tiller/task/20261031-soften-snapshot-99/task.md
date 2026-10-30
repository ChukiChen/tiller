# 弱化 snapshot 预发布的非正式措辞

<!-- tiller-task:v1 {"version":1,"id":"20261031-soften-snapshot-99","type":"feature","size":"small","created":"2026-10-30T16:02:45.083Z","base":"c951103a3ae0df0b83f925d8a6ba7807512d5d88","scope":["README.md","test",".tiller/cases/modules/standards",".tiller/cases/modules/workflow/interface.md"],"format":"structured","summary":"README 与 Release 正文去掉刻意的非正式 release 对照句"} -->

## 需求

### 使用场景

- 场景：README 安装段只保留 Node.js 版本要求与可点击下载/安装命令；GitHub Release 正文删除非正式 release 声明，保留安装命令，保持标题与 prerelease 不变；相关 README 用例回归通过，并经新分支 PR squash 合入。

### 目标

短目标：README 安装段只保留 Node.js 版本要求与可点击下载/安装命令；GitHub Release 正文删除非正式 release 声明，保留安装命令，保持标题与 prerelease 不变；相关 README 用例回归通过，并经新分支 PR squash 合入。

交付结果须满足下列验收条件。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->
- 做：完成短目标“README 安装段只保留 Node.js 版本要求与可点击下载/安装命令；GitHub Release 正文删除非正式 release 声明，保留安装命令，保持标题与 prerelease 不变；相关 README 用例回归通过，并经新分支 PR squash 合入。”，并满足验收条件。
- 不做：超出该短目标与验收条件的额外行为变更。
- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：README 安装段不再出现“不是正式 release/非正式”对照句，保留 Node.js 22、可点击下载链接与 npm 安装命令。
- AC-2：GitHub Release v0.5.0-snapshot.1 正文不再出现非正式 release 声明，保留安装命令，标题仍为 0.5.0 snapshot.1 且保持 prerelease。
- AC-3：CASE-109、CASE-167、CASE-234、CASE-242 相关测试通过；变更经新分支 PR 立即 squash 合入，版本、LICENSE 与流程门禁代码不变。

### 异常与边界

- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。
- 未满足任一验收条件时不得声明完成。

### 验收条件

- AC-1: README 安装段不再出现“不是正式 release/非正式”对照句，保留 Node.js 22、可点击下载链接与 npm 安装命令。
- AC-2: GitHub Release v0.5.0-snapshot.1 正文不再出现非正式 release 声明，保留安装命令，标题仍为 0.5.0 snapshot.1 且保持 prerelease。
- AC-3: CASE-109、CASE-167、CASE-234、CASE-242 相关测试通过；变更经新分支 PR 立即 squash 合入，版本、LICENSE 与流程门禁代码不变。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-30T16:05:08.122Z | 2d6ee8ec5bbb | 这是 0.5.0 的 snapshot 预发布，不是正式 release。太刻意，要改掉；tiller-0.5.0.tgz 包名也带上 snapshot；自动合入，不必再问。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"7bbfee950921a9423f0fd223a81cf9512d88ef919cc13c0a68c0cbc80ca9fd78","commit":"2d6ee8ec5bbbdd7826f15b0d7bbb76776cbec411","by":"boon yu","quote":"这是 0.5.0 的 snapshot 预发布，不是正式 release。太刻意，要改掉；tiller-0.5.0.tgz 包名也带上 snapshot；自动合入，不必再问。","at":"2026-10-30T16:05:08.122Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
