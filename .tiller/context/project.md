# tiller 项目背景

tiller 是一套开源的 AI 软件工程方法论与工具集，帮助开发者完成需求、设计、编码、测试、评审和发布工作，并用可核查的依据判断交付结果。CLI 命令名为 `tiller`。Codex 是主要开发 Agent，也是一等支持对象；tiller 自身也使用这套方法与资料约定开发。

## 当前状态

当前包与分发资源为 0.5.0，默认流程为 `start`、`resume`、`confirm`、`verify`、`check`、`accept`、`close` 和 `reopen`，评审、发布与交付草稿分别使用 `review`、`release`、`pr`。小改动走“需求确认 → 实现 → 验证”，standard 代码任务增加设计确认；默认人工节点只有需求、设计和交付验收。

- 单次任务记录在 `.tiller/task/<id>/task.md`，包含结构化需求、设计、确认、验证和自检。确认记录对象、确认人、时间、基线和摘要，原话可选。
- 任务阶段由记录事实推导。已验收任务用 `close` 收尾，未验收终止用 `close --abandon`，恢复使用 `reopen`。
- `start` 在 `.tiller/local/worktrees/<id>/` 创建任务 worktree；workspace 另含 `management` 与各登记仓库路径。`close`/`--abandon` 强拆该任务 worktree 并清理本任务日志。
- `.tiller/plans/` 保存大功能规划、任务条目和依赖；依赖未验收时阻塞开工。
- `.tiller/cases/` 保存跨任务测试设计，按模块和场景组织。新用例先写清前置条件、步骤、输入、预期结果和来源 AC，再由测试名引用稳定编号。
- `verify` 自主执行声明的测试并从私有报告核实结论；工作区按测试所属仓库选择运行器，准备命令在该仓库根执行，不能唯一归属时拒绝。Java 可用 Maven 或 Gradle 运行器。无法本机执行时使用外部报告并写明理由，验收默认阻断，只有显式放行才可通过。缺陷修复保留基线失败先行和当前通过。
- `check` 核对验收条件、用例、测试、当前验证、范围、测试弱化、记录安全和交付命名；评审阻塞未解决时阻断验收，规格或背景未回写只提示。
- `review` 记录独立评审发现，`release` 只读检查验收提交、版本、分发资源和范围清洁度；`pr` 只从本地任务与 Git 生成可修订草稿，不联网。
- 提交主题采用 `类型(模块): 中文摘要`，PR/MR 标题加任务编号，分支使用 `类型/任务编号[-描述]`；格式问题只提示。
- `init` 生成最小工程骨架和当前平台模板，`upgrade` 只刷新未修改的受管文件并兼容当前及直接兼容的上一资源契约。

当前共享资料以 `.tiller/specs/`、`.tiller/context/`、`.tiller/cases/`、`.tiller/plans/` 和 `.tiller/task/` 为准；被替代的过程内容只从 Git 历史追溯。`project.json` 的 `resourceVersion`、包版本、CLI 版本和资源常量保持 0.5.0，功能开发不升版。运行器现含 `node-test`、`junit-maven`、`junit-gradle` 和 `pytest`；`upgrade --adopt` 可保留受管文件本地修改，`plan attach` 可补记已有任务的规划归属。

历史实现记录已迁入 `.tiller/task/`，当前入口只指向现存任务记录。

## 当前规划

[卫生收尾与发布准备](../plans/20261023-hygiene.md) 已确认。P-1～P-5 覆盖任务关闭、历史空 AC 决定、项目资料刷新、本地分支清理和 README 纯化；P-6 的版本发布准备（LICENSE、npm、CI、快速开始）保留为后续条目，本轮不实现。

## 目录

- `src/`：CLI、默认流程、规划、全局用例、交付命名、初始化和升级实现。
- `resources/`：分发入口、使用指引、规则和启动器。
- `test/`：规则、契约、性能、集成和端到端测试。
- `.tiller/specs/`：当前总体与模块需求、设计和长期决定。
- `.tiller/context/`：项目背景和当前状态。
- `.tiller/cases/`：跨任务测试设计与回归用例。
- `.tiller/task/`：单次任务记录；`.tiller/plans/` 保存按需规划。

## 资料索引

- [总体需求](../specs/requirements.md)
- [总体设计](../specs/design.md)
- [决策记录](../specs/decisions.md)
- [初始化需求](../specs/modules/initialization/requirements.md) / [设计](../specs/modules/initialization/design.md)
- [工作流需求](../specs/modules/workflow/requirements.md) / [设计](../specs/modules/workflow/design.md)
- [验证需求](../specs/modules/verification/requirements.md) / [设计](../specs/modules/verification/design.md)
- [规范需求](../specs/modules/standards/requirements.md) / [设计](../specs/modules/standards/design.md)
- [全局用例说明](../cases/index.md)
