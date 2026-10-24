# 精简 task.md 验证段

<!-- tiller-plan:v1 {"version":1,"id":"20261024-slim-verify-render","created":"2026-10-24T06:19:11.376Z","title":"精简 task.md 验证段","goal":"verify 写入 task.md 的验证记录改为人读摘要；完整命令与输出只留在任务日志；旧格式仍可解析；check/accept 语义不变","requirements":[".tiller/specs/modules/workflow/requirements.md",".tiller/specs/requirements.md"],"items":[{"id":"P-1","title":"瘦身验证渲染并兼容旧解析","size":"standard","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-2","title":"同步 usage/rules/cases 与测试断言","size":"standard","dependencies":["P-1"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]}],"confirmations":[{"object":"规划正文（目标、关联需求与任务条目）","quote":"可以","by":"boon yu","commit":"0c48fb82158f353ea523769c40f7d049f8648d6a","subject":"bdfa33db53ba13d37376e6490d8c68fdeef3b71fa1a2b918e0fb447fe6748bea","at":"2026-10-24T06:19:15.091Z"}]} -->

## 目标

verify 写入 task.md 的验证记录改为人读摘要；完整命令与输出只留在任务日志；旧格式仍可解析；check/accept 语义不变

## 关联需求

- .tiller/specs/modules/workflow/requirements.md
- .tiller/specs/requirements.md

## 任务条目

### P-1 瘦身验证渲染并兼容旧解析
- 粒度：standard
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-2 同步 usage/rules/cases 与测试断言
- 粒度：standard
- 依赖：P-1
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

## 确认

### requirements
- 确认部分：规划
- 对象：规划正文（目标、关联需求与任务条目）
- 确认人：boon yu
- 用户原话：可以
- 原话用途：可选附注，不替代已写明的正文
- 提交：0c48fb82158f353ea523769c40f7d049f8648d6a
- 对象摘要：bdfa33db53ba13d37376e6490d8c68fdeef3b71fa1a2b918e0fb447fe6748bea
- 时间：2026-10-24T06:19:15.091Z
