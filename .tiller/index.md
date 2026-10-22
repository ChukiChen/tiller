<!-- tiller:index:start -->
# 工程资料入口

管理方式：当前工程。范围以 [工程元信息](project.json) 为准。

先读取 [使用指引](usage.md) 了解命令调用与恢复方式，再读取 [开发规则索引](rules/index.md)，按当前任务查找适用依据。
本入口只表示文件接入；宿主实际读取和规则执行尚未验证。

## 资料分类

- `specs/`：总体与模块需求、设计及长期决定。
- `rules/`：通用规则及已有项目约定。
- `context/`：项目背景、现状与资料索引。
- `work/`：按实际目录查找工作记录，读取目标、进展、阻碍、证据及下一步。
- `local/`：本机锁与恢复信息，不作为共享事实来源。

工作创建或资料变化后，以实际文件和工作记录为准；下方资料与工作链接可按实际情况更新。
<!-- tiller:index:end -->

## 已有资料

- [默认工作流模块命名：lite → flow](work/20261022-flow-naming/work.md)

- [轻量标准流程、旧审计清理与版本策略：工作记录](work/20261022-lightweight-flow/work.md)

- [按任务类型选择与组合工作流程：改动收尾，核心资料与验证边界](work/20261020-typed-workflows/work.md)

- [任务推进与交付门禁：技术验证完成、待验收](work/20261019-task-delivery-gates/work.md)
- [测试用例与验证证据管理（历史；长期验证目录已删除）](work/20261019-testing-verification/work.md)
- [验证与反馈需求（历史讨论稿）](specs/modules/verification/requirements.md)与[设计（历史讨论稿）](specs/modules/verification/design.md)
- [实施规划与任务拆分流程完善](work/20261017-implementation-planning/work.md)
- [已有项目接手与项目开发规范建立](work/20261016-project-onboarding/work.md)
- [实现进度记录：需求对应、验证边界与下一步](work/20261016-implementation-progress/work.md)
- [功能分块与项目骨架推进](work/20261016-functional-planning/work.md)
- [specs/archive/requirements-initial-2026-10-14.md](specs/archive/requirements-initial-2026-10-14.md)
- [specs/decisions.md](specs/decisions.md)
- [specs/design.md](specs/design.md)
- [specs/modules/initialization/design.md](specs/modules/initialization/design.md)
- [specs/modules/initialization/requirements.md](specs/modules/initialization/requirements.md)
- [specs/modules/standards/design.md](specs/modules/standards/design.md)
- [specs/modules/standards/requirements.md](specs/modules/standards/requirements.md)
- [specs/modules/workflow/design.md](specs/modules/workflow/design.md)
- [specs/modules/workflow/requirements.md](specs/modules/workflow/requirements.md)
- [specs/requirements.md](specs/requirements.md)
- [context/project.md](context/project.md)
- [work/initial-delivery/design.md](work/initial-delivery/design.md)
- [work/initial-delivery/plan.md](work/initial-delivery/plan.md)
- [work/initial-delivery/work.md](work/initial-delivery/work.md)
- [rules/project.md](rules/project.md)
- [首个交付验证](work/initial-delivery/verification.md)
- [宿主文档接续验证](work/initial-delivery/verification.md#宿主接续验证)
- [关键节点人工确认工作](work/human-confirmation/work.md)
- [人工确认实现与接口](work/human-confirmation/implementation.md)
- [人工确认验证记录](work/human-confirmation/verification.md)
- [统一通用入口](work/20261015-unify-entry/work.md)
- [工作记录约定与阶段产物设计](work/20261015-work-artifacts/work.md)
- [隔离开发与评审合入工作](work/20261015-isolated-delivery/work.md)
- [隔离开发与评审合入实施](work/20261015-isolated-delivery/implementation.md)
- [隔离开发与评审合入验证](work/20261015-isolated-delivery/verification.md#实现验证记录)
- [隔离开发与评审合入设计](specs/modules/workflow/design.md#11-隔离开发与评审合入)
- [独立管理仓库分组布局](work/20261016-repository-layout/work.md)

- [使用入口与本机命令定位](work/20261016-usage-entry/work.md)

## 历史工作资料精简

按用户要求，已提交的历史工作目录仅保留核心依据与结果摘要，原机器回执、过程日志和审阅快照直接删除且不备份。目录用于查阅历史，不作为当前 CLI 可恢复工作或未完成操作队列；当前候选的验证边界见任务类型流程工作。
