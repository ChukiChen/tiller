# 本机 local 按任务聚合与 close 清旁路

<!-- tiller-plan:v1 {"version":1,"id":"20261026-local-task-layout","created":"2026-10-26T02:41:12.429Z","title":"本机 local 按任务聚合与 close 清旁路","goal":"local 以 task-id 聚合 worktrees/logs/旁路；close/abandon 整目录清理；旧布局 close 兼容","requirements":[".tiller/specs/requirements.md",".tiller/specs/modules/workflow/requirements.md"],"items":[{"id":"P-1","title":"task-id-first 布局与 start 写新路径","size":"standard","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-2","title":"close/abandon 整目录清理与旧布局兼容","size":"standard","dependencies":["P-1"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-3","title":"文档用例与测试对齐","size":"standard","dependencies":["P-2"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]}],"confirmations":[{"object":"规划正文（目标、关联需求与任务条目）","quote":"那就按刚才的讨论增加清理并优化目录","by":"boon yu","commit":"edf6a24c0722790e557e2e4ebc3a802b5d406568","subject":"5f193db45a15795a2d49176e433a02381c74a2bfb6e7f317966a531bcc05c8c9","at":"2026-10-26T02:41:12.508Z"}]} -->

## 目标

local 以 task-id 聚合 worktrees/logs/旁路；close/abandon 整目录清理；旧布局 close 兼容

## 关联需求

- .tiller/specs/requirements.md
- .tiller/specs/modules/workflow/requirements.md

## 任务条目

### P-1 task-id-first 布局与 start 写新路径
- 粒度：standard
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-2 close/abandon 整目录清理与旧布局兼容
- 粒度：standard
- 依赖：P-1
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-3 文档用例与测试对齐
- 粒度：standard
- 依赖：P-2
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

## 确认

### requirements
- 确认部分：规划
- 对象：规划正文（目标、关联需求与任务条目）
- 确认人：boon yu
- 用户原话：那就按刚才的讨论增加清理并优化目录
- 原话用途：可选附注，不替代已写明的正文
- 提交：edf6a24c0722790e557e2e4ebc3a802b5d406568
- 对象摘要：5f193db45a15795a2d49176e433a02381c74a2bfb6e7f317966a531bcc05c8c9
- 时间：2026-10-26T02:41:12.508Z
