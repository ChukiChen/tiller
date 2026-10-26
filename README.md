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

审阅后合入初始化 PR/MR，再回到主干执行 `git pull`，让本地包含初始化改动。使用 `tiller merge <初始化任务编号>` 合入时，命令成功后会自动清理本机初始化目录；如果从网页合入，则需要手动运行 `tiller close <初始化任务编号> --reason "初始化基线已合入"`。

### 用 AI 开发一个功能

用 Codex 等 AI 编程工具打开工程，说明你想实现的功能。AI 会按工程内的 tiller 约定开任务、写清需求与验收条件、完成实现并运行验证。你可以在每项人工节点审阅范围和结果；standard 任务还会先确认设计。

确认交付后，用 `tiller pr <任务编号>` 生成 PR/MR 草稿并推送分支，再由 tiller 合入：

```bash
tiller merge <任务编号>
```

`tiller merge` 会使用已安装并登录的 `gh` 或 `glab`，以 squash 方式合入对应 PR/MR，成功后自动清理本机任务目录。如果直接在网页上合入，则需要再运行：

```bash
tiller close <任务编号> --reason "已合入"
```
