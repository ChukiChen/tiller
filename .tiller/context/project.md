# tiller 项目背景

tiller 是一套开源的 AI 软件工程方法论与工具集，帮助开发者完成需求、设计、编码、测试、评审、发布和运维工作，并用可核查的依据判断交付结果。CLI 命令名为 `tiller`。

Codex 是主要开发 Agent，也是一等支持对象；其他工具的支持范围按项目决策推进。tiller 本身也使用 tiller 的方法与资料约定开发，自举要求以总体需求为依据。

## 当前资料与状态

截至 2026-10-17，本地实现与资源版本为 0.3.5，已具备工程接入、文档工作、人工确认记录、隔离交付及统一使用入口，并提供实施规划确认、任务拆分、骨架普通任务、逐任务验证、已有项目接手与项目规范建立指引。实施规划及任务证据目前由可读记录维护，未新增任务状态机或规划确认命令。当前实现范围、验证依据、待验收事项和下一步统一见[实现进度记录](../work/20261016-implementation-progress/work.md)；[首个交付工作](../work/initial-delivery/work.md)保留最初交付的历史事实。总体及三个模块的需求与设计已建立，未确认的更广方案继续保持讨论稿状态，不因已有实现而推定全部规格获批。

根目录 `AGENTS.md` 提供通用工作入口，项目专属限制见[项目规则](../rules/project.md)。工程规格集中在 `.tiller/specs/`，源码位于 `src/`，分发规则及模板位于 `resources/`，测试位于 `test/`。自举和宿主接入以实际验证记录为准。

## 资料索引

- [总体需求](../specs/requirements.md)：产品目标、场景、核心需求与验收方向。
- [总体设计](../specs/design.md)：主要构成、协作关系、技术方案与资料组织。
- [决策记录](../specs/decisions.md)：已确定事项、待讨论选择及历史问题。
- [工程初始化需求](../specs/modules/initialization/requirements.md)与[工程初始化设计](../specs/modules/initialization/design.md)：两种接入方式及升级、恢复的讨论稿。
- [工作推进需求](../specs/modules/workflow/requirements.md)与[工作推进设计](../specs/modules/workflow/design.md)：总体资料编写、模块细化、开发交付、产物模板及执行恢复的需求与方案。
- [开发规范需求](../specs/modules/standards/requirements.md)与[开发规范设计](../specs/modules/standards/design.md)：AI 执行动作、产物质量、完成条件及规则读取与检查机制。
- [原始需求草稿](../specs/archive/requirements-initial-2026-10-14.md)：历史归档，不作为当前要求。
