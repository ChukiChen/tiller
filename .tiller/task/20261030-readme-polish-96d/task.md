# README 开篇与 token 文案润色

<!-- tiller-task:v1 {"version":1,"id":"20261030-readme-polish-96d","type":"documentation","size":"small","created":"2026-10-30T15:35:32.817Z","base":"755d71700f61ce50878844461f2cf54272716bc2","scope":["README.md"],"format":"structured","slug":"readme-polish-96d","summary":"润色 README 开篇，并确认 token 环境变量与 --apply 文案"} -->

## 需求

### 使用场景

- 用户阅读 README 开篇与初始化说明时，应看到不限定存储媒介的“可追溯的记录”，并明确 token 设置到环境变量中。
- `tiller init . --apply` 仍保持一句说明，不展开为额外教程。
- 本次只润色 README 文案，不改变 CLI、测试、受管资源或其他文档。

### 目标

1. README 开篇改为把目标、范围、验收条件与验证结果“留成可追溯的记录”，去掉对 Git 记录的限定。
2. 保留并核对 token 设置到环境变量的说明，以及 `--apply` 的单句说明。
3. 定向回归 CASE-109、CASE-167、CASE-234、CASE-242。

背景：tip `755d717` 已包含 `--apply` 与 token 环境变量文案；本次实际代码差异仅开篇一句，但不重复改写已经正确的两处。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

- 做：只修改 `README.md`，润色开篇的“可追溯的记录”表述。
- 不做：不修改 CLI 行为、测试、`resources/`、`.tiller/usage.md`、token 名称、token 句、`--apply` 句或其他 README 章节。
- 假设：tip 已有 token 环境变量与 `--apply` 单句文案且符合要求；本次已授权自动 squash 合入。

### 关键行为

- AC-1：README 开篇写目标、范围、验收条件与验证结果留成可追溯的记录，不再限定为 Git 记录
- AC-2：README 说明把 GITHUB_TOKEN（或 GH_TOKEN）或 GITLAB_TOKEN（或 GL_TOKEN）设置到环境变量中，并保留无需安装其他命令行工具
- AC-3：README 保持 tiller init . --apply 仅一句会自动完成整个初始化流程
- AC-4：README 仍为面向用户的介绍与快速开始，且产品改动仅 README.md

### 异常与边界

- 仅允许改动 README 开篇目标句；token 句与 `--apply` 句保持现状。
- 任一验收条件或定向回归失败时不得声明完成。

### 验收条件

- AC-1: README 开篇写目标、范围、验收条件与验证结果留成可追溯的记录，不再限定为 Git 记录
- AC-2: README 说明把 GITHUB_TOKEN（或 GH_TOKEN）或 GITLAB_TOKEN（或 GL_TOKEN）设置到环境变量中，并保留无需安装其他命令行工具
- AC-3: README 保持 tiller init . --apply 仅一句会自动完成整个初始化流程
- AC-4: README 仍为面向用户的介绍与快速开始，且产品改动仅 README.md

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-30T15:35:44.153Z | 755d71700f61 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"4d447bd8a0af415d590adaae7ee4684677749b3596cf9d502050d54880fddbbe","commit":"755d71700f61ce50878844461f2cf54272716bc2","by":"ChukiChen","quote":"","at":"2026-10-30T15:35:44.153Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
