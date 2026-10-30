# README 说明 token 设置到环境变量

<!-- tiller-task:v1 {"version":1,"id":"20261030-readme-token-env-96c","type":"documentation","size":"small","created":"2026-10-30T15:33:09.135Z","base":"da1bb0a0243b4ab7bde2860a5a23987560c719b7","scope":["README.md"],"format":"structured","slug":"readme-token-env-96c"} -->

## 需求

### 使用场景

- 用户按 README 初始化工程时，需要明确知道 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`）应设置到环境变量中，而不是写到配置或命令行参数。
- `--apply` 只需说明会自动完成整个初始化流程，不展开为额外教程。
- 本次仅修正 README 文案，不改变 CLI、受管资源或其他文档。

### 目标

1. README「初始化工程」中的 token 句改为明确说明设置到环境变量中，并保留现有 token 名称与“无需安装其他命令行工具”。
2. 保持 `tiller init . --apply` 仅一句“会自动完成整个初始化流程”，不增加流程细节。
3. 定向回归 CASE-109、CASE-167、CASE-234、CASE-242。

背景：#61 tip `da1bb0a` 已合入短版 `--apply` 一句；#96c 追加要求明确 token 设置位置。

### 业务范围

- 做：只修改 `README.md` 的初始化 token 句，使环境变量设置语义明确。
- 不做：不修改 CLI 行为、测试、`resources/`、`.tiller/usage.md`、token 名称或其他 README 章节；不展开 `--apply` 流程。
- 假设：现有 `--apply` 单句已满足上一条反馈；已授权自动 squash 合入。

### 关键行为

- AC-1：README 初始化说明以“设置到环境变量中”描述 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`），并保留无需安装其他命令行工具
- AC-2：README 的 `--apply` 仍只用一句“会自动完成整个初始化流程”说明，不扩展流程细节
- AC-3：README 仍为面向用户的介绍与快速开始，AI 执行流程和用户关键确认不变
- AC-4：README 仍说明 REST API 与 token、不以平台 CLI 为主路径，本次产品改动仅 README.md

### 异常与边界

- 只允许改动 README 目标句；不得顺带改动 token 名称、API 描述或 `--apply` 句子。
- 任一验收条件或其定向回归失败时不得声明完成。

### 验收条件

- AC-1: README 初始化说明以“设置到环境变量中”描述 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`），并保留无需安装其他命令行工具
- AC-2: README 的 `--apply` 仍只用一句“会自动完成整个初始化流程”说明，不扩展流程细节
- AC-3: README 仍为面向用户的介绍与快速开始，AI 执行流程和用户关键确认不变
- AC-4: README 仍说明 REST API 与 token、不以平台 CLI 为主路径，本次产品改动仅 README.md

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-30T15:33:33.851Z | da1bb0a0243b | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"1e8ee884cedf785df4f1298b77d5fe0c3b452ad2d326929633bda63e844b6484","commit":"da1bb0a0243b4ab7bde2860a5a23987560c719b7","by":"ChukiChen","quote":"","at":"2026-10-30T15:33:33.851Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
