# 任务开工 worktree 与关闭清日志

<!-- tiller-plan:v1 {"version":1,"id":"20261024-task-worktrees","created":"2026-10-24T04:07:08.130Z","title":"任务开工 worktree 与关闭清日志","goal":"start 为任务创建 local worktree（含 workspace 多仓）；close/abandon 拆除 worktree 并删除该任务 verify 日志","requirements":[".tiller/specs/requirements.md",".tiller/specs/modules/workflow/requirements.md"],"items":[{"id":"P-1","title":"project 模式 start 建 worktree","size":"standard","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-2","title":"workspace 多仓隔离检出","size":"standard","dependencies":["P-1"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-3","title":"close/abandon 拆 worktree 并清日志","size":"standard","dependencies":["P-2"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]}],"confirmations":[{"object":"规划正文（目标、关联需求与任务条目）","quote":"可以，开始吧","by":"boon yu","commit":"14e73196e74a3bc80594db46aa1c44b80c7e6ceb","subject":"7b25547994fb5e4c599a05a9d2b16edc844770ac01d884e56e30d92b19c62ece","at":"2026-10-24T04:07:08.217Z"}]} -->

## 目标

start 为任务创建 local worktree（含 workspace 多仓）；close/abandon 拆除 worktree 并删除该任务 verify 日志

## 关联需求

- .tiller/specs/requirements.md
- .tiller/specs/modules/workflow/requirements.md

## 任务条目

### P-1 project 模式 start 建 worktree
- 粒度：standard
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-2 workspace 多仓隔离检出
- 粒度：standard
- 依赖：P-1
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-3 close/abandon 拆 worktree 并清日志
- 粒度：standard
- 依赖：P-2
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

## 确认

### requirements
- 确认部分：规划
- 对象：规划正文（目标、关联需求与任务条目）
- 确认人：boon yu
- 用户原话：可以，开始吧
- 原话用途：可选附注，不替代已写明的正文
- 提交：14e73196e74a3bc80594db46aa1c44b80c7e6ceb
- 对象摘要：7b25547994fb5e4c599a05a9d2b16edc844770ac01d884e56e30d92b19c62ece
- 时间：2026-10-24T04:07:08.217Z
