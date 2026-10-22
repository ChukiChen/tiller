# tiller 项目背景

tiller 是一套开源的 AI 软件工程方法论与工具集，帮助开发者完成需求、设计、编码、测试、评审、发布和运维工作，并用可核查的依据判断交付结果。CLI 命令名为 `tiller`。

Codex 是主要开发 Agent，也是一等支持对象；其他工具的支持范围按项目决策推进。tiller 本身也使用 tiller 的方法与资料约定开发，自举要求以总体需求为依据。

## 当前资料与状态

0.5.0 的默认工作流提供 `start`、`resume`、`confirm`、`verify`、`check`、`accept`。小改动走“需求确认 → 实现 → 验证”，标准任务增加设计确认；规划、合入和发布按需操作。单次任务只维护 `.tiller/task/<id>/task.md`；需求与设计正文必须先写清，用户原话只作确认凭证。验收条件编号映射到测试引用，`check` 核对验证过期、范围越界、未提交改动、测试弱化、全局用例、密钥和本机路径。产品级回归事实集中在 `.tiller/cases/*.json`，只保存编号、需求/模块、`test_ref` 和源码路径，不保存执行日志、全文快照或证据包。旧流程、阶段、规划、审计和全文快照路径已物理删除；历史 `.tiller/work/` 只读保留，不自动迁移。

包、CLI 与分发资源保持当前契约 0.5.0；自举工程元信息保持原有 `resourceVersion` 0.4.0，本轮只刷新其受管摘要，不把规则或实现变化绑成资源升版。版本号只在正式发布正式包时修改，升级命令只核对当前契约，不迁移历史版本或历史批准。

整体历史范围统一见[实现进度记录](../work/20261016-implementation-progress/work.md)；[首个交付工作](../work/initial-delivery/work.md)保留最初交付的事实；[轻量流程工作](../work/20261022-lightweight-flow/work.md)和 [flow 命名工作](../work/20261022-flow-naming/work.md)保留上一轮结果。本轮见[确认语义与 task 重命名](../task/20261022-confirm-task/task.md)。用户通过任务直接给出要求，尚未另行完成展示后的需求、设计确认和最终验收；技术结果不能替代用户验收或发布。

根目录 `AGENTS.md` 提供通用工作入口，项目专属限制见[项目规则](../rules/project.md)。工程规格集中在 `.tiller/specs/`，全局用例位于 `.tiller/cases/`，源码位于 `src/`，分发规则、使用指引与启动器位于 `resources/`，测试位于 `test/`。自举和宿主接入以实际验证记录为准。

## 资料索引

- [总体需求](../specs/requirements.md)：产品目标、场景、核心需求与验收方向。
- [总体设计](../specs/design.md)：主要构成、协作关系、技术方案与资料组织。
- [决策记录](../specs/decisions.md)：已确定事项、待讨论选择及历史问题。
- [工程初始化需求](../specs/modules/initialization/requirements.md)与[工程初始化设计](../specs/modules/initialization/design.md)：两种接入方式及升级、恢复的讨论稿。
- [工作推进需求](../specs/modules/workflow/requirements.md)与[工作推进设计](../specs/modules/workflow/design.md)：总体资料编写、模块细化、开发交付、产物及执行恢复的历史需求与方案；当前轻量流程以入口规则为准。
- [开发规范需求](../specs/modules/standards/requirements.md)与[开发规范设计](../specs/modules/standards/design.md)：AI 执行动作、产物质量、完成条件及规则读取与检查机制。
- [验证与反馈需求](../specs/modules/verification/requirements.md)与[设计](../specs/modules/verification/design.md)：测试分类、长期用例与执行证据的历史讨论；旧验证目录、重模块和证据命令已删除，当前只保留[全局用例](../cases/index.md)事实与任务记录。
- [全局用例说明](../cases/index.md)：产品级回归清单、字段约定及与单次 `task.md` 的分工。
- [原始需求草稿](../specs/archive/requirements-initial-2026-10-14.md)：历史归档，不作为当前要求。
