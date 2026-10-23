<!-- tiller:index:start -->
# 工程资料入口

管理方式：当前工程。范围以 [工程元信息](project.json) 为准。

先读取 [使用指引](usage.md) 了解命令调用与恢复方式，再读取 [开发规则索引](rules/index.md)，按当前任务查找适用依据。
本入口只表示文件接入；宿主实际读取和规则执行尚未验证。

## 资料分类

- `specs/`：总体与模块需求、设计及长期决定。
- `cases/`：产品级测试设计与回归事实，保存编号、前置条件、步骤、输入、预期结果、来源 AC、需求/模块引用和源码路径；测试名引用 CASE 编号。
- `plans/`：大功能的规划与任务拆分，按需建立；单次任务仍以 `task.md` 为准。
- `rules/`：通用规则及已有项目约定。
- `context/`：项目背景、现状与资料索引。
- `task/`：当前任务记录，按任务标识读取结构化需求、设计、确认与验证。
- `work/`：仅保留的历史任务记录，只读追溯；新任务写入 `task/`。
- `local/`：本机锁与恢复信息，不作为共享事实来源。

任务创建或资料变化后，以实际文件和任务记录为准；确认绑定结构化正文，原话可选且不替代正文。
验证由 tiller 执行声明的测试并从私有报告核实；完整输出只写 `local/logs/`，外部报告须写明理由并显式放行。评审发现写入 task.md，未清除阻塞项阻断验收；已验收任务按验收提交复查，specs 未回写只提示；发布用只读 release 清单。
<!-- tiller:index:end -->

## 已有资料

- [第一批功能补齐任务](task/20261022-first-batch/task.md)
- [确认去原话化与结构化任务正文](task/20261022-round9/task.md)
- [任务阶段、关闭与规格清理](task/20261022-round8/task.md)
- [全局用例说明](cases/index.md)
- [总体需求](specs/requirements.md)、[总体设计](specs/design.md)、[决策记录](specs/decisions.md)
- [初始化规格](specs/modules/initialization/requirements.md)、[工作流规格](specs/modules/workflow/requirements.md)、[验证规格](specs/modules/verification/requirements.md)、[规范规格](specs/modules/standards/requirements.md)
- [模块用例、场景与用例先行](task/20261022-case-first/task.md)

- [cases/index.md](cases/index.md)

- [确认语义与 work → task 重命名](task/20261022-confirm-task/task.md)

- [默认工作流模块命名：lite → flow](work/20261022-flow-naming/work.md)

- [轻量标准流程、旧审计清理与版本策略：任务记录](work/20261022-lightweight-flow/work.md)

- [按任务类型选择与组合工作流程：改动收尾，核心资料与验证边界](work/20261020-typed-workflows/work.md)

- [任务推进与交付门禁：技术验证完成、待验收](work/20261019-task-delivery-gates/work.md)
- [测试用例与验证证据管理（历史；长期验证目录已删除）](work/20261019-testing-verification/work.md)
- [实施规划与任务拆分流程完善](work/20261017-implementation-planning/work.md)
- [已有项目接手与项目开发规范建立](work/20261016-project-onboarding/work.md)
- [实现进度记录：需求对应、验证边界与下一步](work/20261016-implementation-progress/work.md)
- [功能分块与项目骨架推进](work/20261016-functional-planning/work.md)
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

## 历史任务资料精简

按用户要求，已提交的历史工作目录仅保留核心依据与结果摘要，原机器回执、过程日志和审阅快照直接删除且不备份。目录用于查阅历史，不作为当前 CLI 可恢复工作或未完成操作队列；当前候选的验证边界见任务类型流程工作。
