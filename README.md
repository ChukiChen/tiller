# tiller

tiller 是一套面向 AI 协作开发的标准工作流与 CLI。它帮助你和 AI 一起完成需求、设计、实现、测试与合入，把目标、范围、验收条件和验证结果留在可追溯的 Git 记录中。你负责确认目标与交付，AI 按约定推进具体工作。

## 快速开始

### 安装

需要 Node.js 22 或以上：

```bash
npm install -g ./tiller-0.5.0.tgz
```

### 初始化工程

在已有 Git 提交的工程根目录运行：

```bash
tiller init .
```

tiller 会写入 `AGENTS.md` 和 `.tiller` 下的工作约定，并创建初始化 PR/MR，标题为 `chore(tiller): 完成工程初始化`。

tiller 需要 PATH 中可执行的 Git。初始化使用 tokenized HTTPS git 推送分支，并通过 GitHub/GitLab REST API 创建 PR/MR；创建与合入使用平台 API，请设置 `GITHUB_TOKEN`（或 `GH_TOKEN`）或 `GITLAB_TOKEN`（或 `GL_TOKEN`），无需安装其他命令行工具。

审阅后合入初始化 PR/MR，再回到主干执行 `git pull`，让本地包含初始化改动。合入与本机清理由 AI 按 tiller 约定完成。也可使用 `tiller init . --apply`，会自动完成整个初始化流程。

### 用 AI 开发一个功能

用 Codex 等 AI 编程工具打开工程，说明你想实现的功能。AI 会按工程内的 tiller 约定执行 `start` →（standard 任务先完成设计确认）→ 实现 → `verify` → `pr` → `merge`/`close`，并写清需求、验收条件和可追溯的验证结果。

你主要负责在关键节点确认：需求范围、standard 任务的设计，以及最终交付验收。技术实现、测试与合入操作由 AI 推进。
