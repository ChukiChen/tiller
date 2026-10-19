# tiller 项目背景

tiller 是一套开源的 AI 软件工程方法论与工具集，帮助开发者完成需求、设计、编码、测试、评审、发布和运维工作，并用可核查的依据判断交付结果。CLI 命令名为 `tiller`。

Codex 是主要开发 Agent，也是一等支持对象；其他工具的支持范围按项目决策推进。tiller 本身也使用 tiller 的方法与资料约定开发，自举要求以总体需求为依据。

## 当前资料与状态

0.3.5 已具备工程接入、文档工作、人工确认记录、隔离交付及统一使用入口。0.3.6 增量增加分类用例、项目原生测试入口、执行快照、外部证据登记及缺口报告，验证状态见[测试工作](../work/20261019-testing-verification/work.md)。本地 0.4.0 候选进一步实现规划确认、任务开始/验证/接续、范围内证据绑定、明确例外和整体交付门禁；T1 至 T6 技术验证已完成，交付待用户验收，见[门禁工作](../work/20261019-task-delivery-gates/work.md)及其验证记录。首轮完整回归的文案断言失败和修后完整升级复验分别保留，不冒称一次全量全过。旧工作记录保留但不兼容推进，不自动转换批准或进度；资源升级与工作格式分开处理。

整体历史范围统一见[实现进度记录](../work/20261016-implementation-progress/work.md)；[首个交付工作](../work/initial-delivery/work.md)保留最初交付的事实。未确认的更广方案继续保持讨论稿状态，不因已有实现而推定全部规格获批。当前候选尚未完成用户验收或发布。

根目录 `AGENTS.md` 提供通用工作入口，项目专属限制见[项目规则](../rules/project.md)。工程规格集中在 `.tiller/specs/`，源码位于 `src/`，分发规则及模板位于 `resources/`，测试位于 `test/`。自举和宿主接入以实际验证记录为准。

## 资料索引

- [总体需求](../specs/requirements.md)：产品目标、场景、核心需求与验收方向。
- [总体设计](../specs/design.md)：主要构成、协作关系、技术方案与资料组织。
- [决策记录](../specs/decisions.md)：已确定事项、待讨论选择及历史问题。
- [工程初始化需求](../specs/modules/initialization/requirements.md)与[工程初始化设计](../specs/modules/initialization/design.md)：两种接入方式及升级、恢复的讨论稿。
- [工作推进需求](../specs/modules/workflow/requirements.md)与[工作推进设计](../specs/modules/workflow/design.md)：总体资料编写、模块细化、开发交付、产物模板及执行恢复的需求与方案。
- [开发规范需求](../specs/modules/standards/requirements.md)与[开发规范设计](../specs/modules/standards/design.md)：AI 执行动作、产物质量、完成条件及规则读取与检查机制。
- [验证与反馈需求](../specs/modules/verification/requirements.md)与[设计](../specs/modules/verification/design.md)：测试分类、长期用例、项目测试入口与本次执行证据。
- [原始需求草稿](../specs/archive/requirements-initial-2026-10-14.md)：历史归档，不作为当前要求。
