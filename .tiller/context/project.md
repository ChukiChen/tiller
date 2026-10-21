# tiller 项目背景

tiller 是一套开源的 AI 软件工程方法论与工具集，帮助开发者完成需求、设计、编码、测试、评审、发布和运维工作，并用可核查的依据判断交付结果。CLI 命令名为 `tiller`。

Codex 是主要开发 Agent，也是一等支持对象；其他工具的支持范围按项目决策推进。tiller 本身也使用 tiller 的方法与资料约定开发，自举要求以总体需求为依据。

## 当前资料与状态

0.5.0 默认入口为轻量标准流程：`start`、`resume`、`confirm`、`verify`、`check`、`accept`。小改动走“需求确认 → 实现 → 验证”，标准任务增加设计确认；规划、合入和发布按需操作。工作记录只维护 `work.md`，验收条件编号映射到测试引用，`check` 核对验证过期、范围越界、未提交改动、测试弱化、密钥和本机路径。旧流程、阶段、规划、任务、交付审计、全文快照和证据包路径已物理删除，`work.md` 与 Git 是唯一记录来源。

版本号只在正式发布正式包时修改。本轮功能迭代不提升资源版本，升级命令只核对当前契约，不迁移历史版本或历史批准。当前仓库自身保持 0.5.0 并通过 `status` 检查。

整体历史范围统一见[实现进度记录](../work/20261016-implementation-progress/work.md)；[首个交付工作](../work/initial-delivery/work.md)保留最初交付的事实；本轮实施见[轻量流程工作](../work/20261022-lightweight-flow/work.md)。用户通过任务直接给出本轮要求，尚未另行完成展示后的需求、设计确认和最终验收；技术结果不能替代用户验收或发布。

根目录 `AGENTS.md` 提供通用工作入口，项目专属限制见[项目规则](../rules/project.md)。工程规格集中在 `.tiller/specs/`，源码位于 `src/`，分发规则、使用指引与启动器位于 `resources/`，测试位于 `test/`。自举和宿主接入以实际验证记录为准。

## 资料索引

- [总体需求](../specs/requirements.md)：产品目标、场景、核心需求与验收方向。
- [总体设计](../specs/design.md)：主要构成、协作关系、技术方案与资料组织。
- [决策记录](../specs/decisions.md)：已确定事项、待讨论选择及历史问题。
- [工程初始化需求](../specs/modules/initialization/requirements.md)与[工程初始化设计](../specs/modules/initialization/design.md)：两种接入方式及升级、恢复的讨论稿。
- [工作推进需求](../specs/modules/workflow/requirements.md)与[工作推进设计](../specs/modules/workflow/design.md)：总体资料编写、模块细化、开发交付、产物及执行恢复的历史需求与方案；当前轻量流程以入口规则为准。
- [开发规范需求](../specs/modules/standards/requirements.md)与[开发规范设计](../specs/modules/standards/design.md)：AI 执行动作、产物质量、完成条件及规则读取与检查机制。
- [验证与反馈需求](../specs/modules/verification/requirements.md)与[设计](../specs/modules/verification/design.md)：测试分类、长期用例、项目测试入口与本次执行证据。
- [原始需求草稿](../specs/archive/requirements-initial-2026-10-14.md)：历史归档，不作为当前要求。
