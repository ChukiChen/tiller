# 确认绑定结构化正文并将 work 重命名为 task

<!-- tiller-task:v1 {"version":1,"id":"20261022-confirm-task","type":"improvement","size":"standard","created":"2026-10-22T01:20:00.000Z","base":"65da92da05e6f86df50cde1c1831014e636e099f","scope":["src","test","scripts","resources","AGENTS.md","README.md",".tiller"],"preExisting":{}} -->

## 需求

面向使用默认工作流的 AI 与开发者，修正确认语义和任务记录命名。用户原话只是确认凭证，不能替代任务正文；需求必须写清目标、范围、关键行为和编号验收条件，设计必须写清方案、影响和验证方式。确认必须绑定任务记录中已经写明的需求或设计对象，对象正文变化后旧确认失效。

新任务统一写入 `.tiller/task/<id>/task.md`，使用 `tiller-task:v1` 标记；CLI、帮助、测试、README、入口、规则、索引和全局用例统一使用“任务”语义。历史 `.tiller/work/` 原样保留为只读事实，不自动迁移，也不从当前任务列表恢复。版本号本轮不提升。

## 验收条件

- AC-1: `confirm` 只接受已写清的需求或设计正文，确认记录保存对象、用户原话、提交和对象摘要；原话不能作为唯一正文，正文变化会使确认失效
- AC-2: `start`、`resume`、`confirm`、`verify`、`check`、`accept` 使用 `.tiller/task/<id>/task.md` 和 `tiller-task:v1`，历史 `.tiller/work/` 只读且不出现在当前任务列表
- AC-3: 帮助、README、入口、规则、索引、全局用例和相关测试统一使用 task 语义，不再把默认流程称为 work 或 lite，必读资料不超过 5000 字
- AC-4: `package.json`、`CLI_VERSION`、`RESOURCE_VERSION` 保持 0.5.0，自举 `resourceVersion` 保持 0.4.0；build、lint、typecheck、完整测试和包冒烟通过

## 设计

`.tiller/task/<id>/task.md` 是单任务唯一记录。解析器读取 `## 需求`、`## 验收条件`、`## 设计`、`## 确认`、`## 验证` 和 `## 自检`；缺少需求正文时拒绝解析。`confirm` 计算需求或设计正文及范围的摘要，记录固定对象名称和“原话用途：确认凭证，不替代已写明的正文”；校验时摘要变化即视为确认失效。`start` 的 CLI 参数使用 `--requirement`，不再用目标或聊天原话作为正文入口。

新记录只扫描 `.tiller/task/`；历史 `.tiller/work/` 不自动迁移，也不参与 `resume`、范围排除之外的当前流程。全局用例增加正文绑定、空需求拒绝和历史目录隔离三条回归，并同步更新既有测试名与引用。文档明确 task 与 work 的映射，版本号和升级迁移保持不变。

## 确认

尚无 CLI 确认。负责人以本轮任务说明直接授权实施；没有经过展示后的 `confirm`，不补记为需求、设计或交付验收确认。

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
