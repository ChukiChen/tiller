# 精简确认自检并修分支命名

<!-- tiller-plan:v1 {"version":1,"id":"20261024-taskmd-cleanup","created":"2026-10-24T09:24:06.311Z","title":"精简确认自检并修分支命名","goal":"压缩确认段、收起关单后自检噪声、需求设计去噪保钉、修复 start 双 slug 分支名；check/accept 门禁不变","requirements":[".tiller/specs/modules/workflow/requirements.md",".tiller/specs/requirements.md"],"items":[{"id":"P-1","title":"确认表与旁路及旧解析","size":"standard","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-2","title":"关单后自检收起","size":"standard","dependencies":["P-1"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-3","title":"需求设计去噪规则与模板","size":"standard","dependencies":["P-1"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-4","title":"修复双 slug 分支命名","size":"small","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]}],"confirmations":[{"object":"规划正文（目标、关联需求与任务条目）","quote":"那跟上面的一起优化，包括4","by":"boon yu","commit":"940c0b7691a4c2e8157d1fdf1431af3c384b5b07","subject":"d5a301fdea79db03aa3aa5cb1faffeb915b01c2e129df23172d84e15eaba0e6d","at":"2026-10-24T09:24:11.370Z"}]} -->

## 目标

压缩确认段、收起关单后自检噪声、需求设计去噪保钉、修复 start 双 slug 分支名；check/accept 门禁不变

## 关联需求

- .tiller/specs/modules/workflow/requirements.md
- .tiller/specs/requirements.md

## 任务条目

### P-1 确认表与旁路及旧解析
- 粒度：standard
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-2 关单后自检收起
- 粒度：standard
- 依赖：P-1
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-3 需求设计去噪规则与模板
- 粒度：standard
- 依赖：P-1
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-4 修复双 slug 分支命名
- 粒度：small
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

## 确认

### requirements
- 确认部分：规划
- 对象：规划正文（目标、关联需求与任务条目）
- 确认人：boon yu
- 用户原话：那跟上面的一起优化，包括4
- 原话用途：可选附注，不替代已写明的正文
- 提交：940c0b7691a4c2e8157d1fdf1431af3c384b5b07
- 对象摘要：d5a301fdea79db03aa3aa5cb1faffeb915b01c2e129df23172d84e15eaba0e6d
- 时间：2026-10-24T09:24:11.370Z
