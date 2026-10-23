# 流程硬化：约定变门禁与引导

<!-- tiller-plan:v1 {"version":1,"id":"20261023-flow-hardening","created":"2026-10-23T12:02:19.829Z","title":"流程硬化：约定变门禁与引导","goal":"把流程测试暴露的软约定落成可检查的 warning 或 standard 门禁，并分批交付；本轮先做高优先级过程与引导，不审测试语义、不做身份认证。","requirements":[".tiller/specs/modules/workflow/requirements.md",".tiller/specs/modules/verification/requirements.md",".tiller/specs/modules/initialization/requirements.md",".tiller/specs/modules/standards/requirements.md"],"items":[{"id":"P-1","title":"任务 ID 日期前缀与示例统一","size":"small","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-2","title":"过程卫生检查与 accept 门禁","size":"standard","dependencies":[],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-3","title":"Java/Gradle runner 探测与 case skeleton","size":"standard","dependencies":[],"requirements":[".tiller/specs/modules/initialization/requirements.md"]},{"id":"P-4","title":"受管文件未跟踪检查与 init 首提提示","size":"small","dependencies":[],"requirements":[".tiller/specs/modules/standards/requirements.md"]},{"id":"P-5","title":"设计/模块过薄与 decisions 空壳 warning","size":"standard","dependencies":["P-2"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]},{"id":"P-6","title":"日志可读输出与过时 verify 提示","size":"standard","dependencies":["P-2"],"requirements":[".tiller/specs/modules/verification/requirements.md"]},{"id":"P-7","title":"其余中低优先级约定硬化","size":"standard","dependencies":["P-1","P-2","P-3","P-4","P-5","P-6"],"requirements":[".tiller/specs/modules/workflow/requirements.md"]}],"confirmations":[{"object":"规划正文（目标、关联需求与任务条目）","quote":"开始优化吧","by":"boon yu","commit":"4129d9f4c3d6aafcb7166cc5bf43ef87e2b048da","subject":"b457c186d9db12fcd87b8ef6e1bab60b64830cf1bf4ef65a1b256f896c56e199","at":"2026-10-23T12:02:19.904Z"}]} -->

## 目标

把流程测试暴露的软约定落成可检查的 warning 或 standard 门禁，并分批交付；本轮先做高优先级过程与引导，不审测试语义、不做身份认证。

## 关联需求

- .tiller/specs/modules/workflow/requirements.md
- .tiller/specs/modules/verification/requirements.md
- .tiller/specs/modules/initialization/requirements.md
- .tiller/specs/modules/standards/requirements.md

## 任务条目

### P-1 任务 ID 日期前缀与示例统一
- 粒度：small
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-2 过程卫生检查与 accept 门禁
- 粒度：standard
- 依赖：无
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-3 Java/Gradle runner 探测与 case skeleton
- 粒度：standard
- 依赖：无
- 覆盖需求：.tiller/specs/modules/initialization/requirements.md

### P-4 受管文件未跟踪检查与 init 首提提示
- 粒度：small
- 依赖：无
- 覆盖需求：.tiller/specs/modules/standards/requirements.md

### P-5 设计/模块过薄与 decisions 空壳 warning
- 粒度：standard
- 依赖：P-2
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

### P-6 日志可读输出与过时 verify 提示
- 粒度：standard
- 依赖：P-2
- 覆盖需求：.tiller/specs/modules/verification/requirements.md

### P-7 其余中低优先级约定硬化
- 粒度：standard
- 依赖：P-1, P-2, P-3, P-4, P-5, P-6
- 覆盖需求：.tiller/specs/modules/workflow/requirements.md

## 确认

### requirements
- 确认部分：规划
- 对象：规划正文（目标、关联需求与任务条目）
- 确认人：boon yu
- 用户原话：开始优化吧
- 原话用途：可选附注，不替代已写明的正文
- 提交：4129d9f4c3d6aafcb7166cc5bf43ef87e2b048da
- 对象摘要：b457c186d9db12fcd87b8ef6e1bab60b64830cf1bf4ef65a1b256f896c56e199
- 时间：2026-10-23T12:02:19.904Z
