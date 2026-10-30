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

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"4fb9e2d02475885951504518baa880690a7393ced1579fc4b48bf7fbc071a37c","commit":"134f95b77c40f7f7078e4398ff07ea05ae7540fd","by":"boon yu","quote":"可以；修改含 README；完了自动合并不必再问。现在还不能叫正式 release，用 snapshot / pre-release。","at":"2026-10-30T15:56:18.701Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
