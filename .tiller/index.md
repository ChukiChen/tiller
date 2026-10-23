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
- `local/`：本机锁与恢复信息，不作为共享事实来源。

任务创建或资料变化后，以实际文件和任务记录为准；确认绑定结构化正文，原话可选且不替代正文。
验证由 tiller 执行声明的测试并从私有报告核实；完整输出只写 `local/logs/`，外部报告须写明理由并显式放行。评审发现写入 task.md，未清除阻塞项阻断验收；已验收任务按验收提交复查，specs 未回写只提示；发布用只读 release 清单。
<!-- tiller:index:end -->

## 已有资料

### 规格、规则与用例

- [总体需求](specs/requirements.md)、[总体设计](specs/design.md)、[决策记录](specs/decisions.md)
- [初始化规格](specs/modules/initialization/requirements.md)、[工作流规格](specs/modules/workflow/requirements.md)、[验证规格](specs/modules/verification/requirements.md)、[规范规格](specs/modules/standards/requirements.md)
- [规则索引](rules/index.md)、[项目规则](rules/project.md)、[项目背景](context/project.md)
- [全局用例](cases/index.md)

### 任务记录

- [隔离开发与评审合入](task/20261015-isolated-delivery/task.md)
- [统一通用工作入口](task/20261015-unify-entry/task.md)
- [工作记录约定与阶段产物](task/20261015-work-artifacts/task.md)
- [功能分块与项目骨架推进](task/20261016-functional-planning/task.md)
- [tiller 实现进度记录](task/20261016-implementation-progress/task.md)
- [项目接手与开发规范建立](task/20261016-project-onboarding/task.md)
- [独立管理仓库分组布局](task/20261016-repository-layout/task.md)
- [使用入口与命令定位](task/20261016-usage-entry/task.md)
- [实施规划与任务拆分流程完善](task/20261017-implementation-planning/task.md)
- [任务推进与交付门禁](task/20261019-task-delivery-gates/task.md)
- [测试用例与验证证据管理](task/20261019-testing-verification/task.md)
- [按任务类型选择与组合工作流程](task/20261020-typed-workflows/task.md)
- [模块用例、场景与用例先行](task/20261022-case-first/task.md)
- [确认绑定结构化正文并将 work 重命名为 task](task/20261022-confirm-task/task.md)
- [第一批功能补齐：规划、接入、用例绑定与受管升级](task/20261022-first-batch/task.md)
- [将默认工作流模块从 lite 重命名为 flow](task/20261022-flow-naming/task.md)
- [恢复轻量全局用例事实库](task/20261022-global-cases/task.md)
- [精简 tiller 为轻量标准流程并删除旧审计](task/20261022-lightweight-flow/task.md)
- [提交信息、分支名与 PR 规范及 PR 草稿生成](task/20261022-round11/task.md)
- [tiller pr 草稿完善与 GitLab MR 支持](task/20261022-round12/task.md)
- [tiller pr 草稿细节修正与文档表述恢复](task/20261022-round13/task.md)
- [验证防伪与任务范围约束](task/20261022-round14/task.md)
- [由 tiller 自主运行测试并核实结果](task/20261022-round15/task.md)
- [用例改为测试设计资产，测试名引用用例 ID](task/20261022-round16/task.md)
- [评审与发布环节，已验收任务按验收提交检查](task/20261022-round17/task.md)
- [任务阶段、关闭与规格清理](task/20261022-round8/task.md)
- [第9轮：确认去原话化与结构化任务正文](task/20261022-round9/task.md)
- [历史 work 迁入 task](task/20261023-migrate-work/task.md)
- [关键节点人工确认](task/human-confirmation/task.md)
- [首个可用交付](task/initial-delivery/task.md)
- [多仓库验证与 Java 运行器](task/20261023-multi-repo-verify/task.md)

## 历史任务资料精简

按用户要求，历史 work 记录已迁入 `task/` 并仅保留核心依据与结果摘要；原机器回执、过程日志、审阅快照及 work 目录不再保留且不备份。迁移记录用于查阅历史，不作为后续执行队列；其“已开始”阶段不表示任务重新开工或通过验收。
