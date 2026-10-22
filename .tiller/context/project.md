# tiller 项目背景

tiller 是一套开源的 AI 软件工程方法论与工具集，帮助开发者完成需求、设计、编码、测试、评审和发布工作，并用可核查的依据判断交付结果。CLI 命令名为 `tiller`。

Codex 是主要开发 Agent，也是一等支持对象；tiller 自身也使用这套方法与资料约定开发。

## 当前状态

当前包与分发资源为 0.5.0，默认流程是 `start`、`resume`、`confirm`、`verify`、`check`、`accept`、`close`、`reopen`。小改动走“需求确认 → 实现 → 验证”，standard 代码任务增加设计确认；默认人工节点只有需求、设计和交付验收，规划/合入/发布按需确认。

- 单次任务记录在 `.tiller/task/<id>/task.md`；start 生成结构化需求与设计模板，确认前校验必填段。
- 确认自动记录部分、确认人、时间、提交和摘要；`--by` 缺省取 Git `user.name`，原话可选。需求与设计独立失效，旧格式保持兼容。
- 任务阶段从记录事实推导；已验收后 `close` 收尾，未验收终止用 `close --abandon`，终态需 `reopen` 才能继续。
- `.tiller/plans/<id>.md` 支持目标、关联 specs、任务条目、粒度和依赖；依赖未验收时阻塞开工。
- `.tiller/cases/` 是产品级回归事实源，按模块 behavior/interface/performance/security 和 scenarios 组织；需求确认后先改用例，再写测试和实现。
- `check` 校验 AC→用例→测试→当前验证、反向 `criteria`、模块/场景结构、范围、测试弱化、密钥和本机路径。
- `init` 生成最小 specs/context/cases/plans 骨架；`upgrade` 只刷新未修改的受管文件，兼容当前和直接兼容的上一资源契约。

旧审计、reviews 快照、全文确认快照、证据包、advanced 和旧 verification CLI 不保留。历史 `.tiller/work/` 只读；需要历史时从 Git 取回或重跑。

## 本轮状态

当前 specs 已按轻量方案收敛，被替代内容只从 Git 历史追溯。自举工程 `project.json` 的 `resourceVersion` 与包版本、CLI 版本和资源常量保持 0.5.0；本轮功能开发不升版。

本轮见[确认去原话化与结构化任务正文](../task/20261022-round9/task.md)。用户直接给出任务要求，尚未完成展示后的需求/设计确认和最终验收；技术验证不能替代用户验收或发布。

## 目录

- `src/`：CLI、默认流程、规划、全局用例、初始化和升级实现。
- `resources/`：分发入口、usage、规则和启动器。
- `test/`：规则、契约、性能、集成和端到端测试。
- `.tiller/specs/`：当前总体/模块需求、设计和决定。
- `.tiller/context/`：项目背景和当前入口说明。
- `.tiller/cases/`：跨任务回归用例；`.tiller/task/` 保存单次任务。
- `.tiller/plans/`：按需建立的大功能规划。

## 资料索引

- [总体需求](../specs/requirements.md)
- [总体设计](../specs/design.md)
- [决策记录](../specs/decisions.md)
- [初始化需求](../specs/modules/initialization/requirements.md) / [设计](../specs/modules/initialization/design.md)
- [工作流需求](../specs/modules/workflow/requirements.md) / [设计](../specs/modules/workflow/design.md)
- [验证需求](../specs/modules/verification/requirements.md) / [设计](../specs/modules/verification/design.md)
- [规范需求](../specs/modules/standards/requirements.md) / [设计](../specs/modules/standards/design.md)
- [全局用例说明](../cases/index.md)
- [确认去原话化与结构化任务正文](../task/20261022-round9/task.md)
- [任务阶段、关闭与规格清理](../task/20261022-round8/task.md)
- [第一批功能补齐任务](../task/20261022-first-batch/task.md)
- 历史实现记录：[实现进度](../work/20261016-implementation-progress/work.md)、[轻量流程](../work/20261022-lightweight-flow/work.md)、[flow 命名](../work/20261022-flow-naming/work.md)
