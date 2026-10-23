# 历史 work 迁入 task

<!-- tiller-task:v1 {"version":1,"id":"20261023-migrate-work","type":"migration","size":"standard","created":"2026-10-23T02:59:33.250Z","base":"aed8a9ba0db7eff6eae3e5f14349766a40b90d01","scope":["src","test","resources","README.md","AGENTS.md",".tiller/work",".tiller/task",".tiller/rules",".tiller/usage.md",".tiller/context",".tiller/specs",".tiller/cases",".tiller/index.md",".tiller/project.json"],"preExisting":{},"format":"structured","slug":"migrate-work","summary":"历史 work 迁入 task"} -->

## 需求

### 目标

将仓库内残留的 .tiller/work/ 历史记录迁入 .tiller/task/<id>/task.md，使现行模型只以 task 为任务目录；修正仍把 work 当现行路径的文档与规则；升级/兼容路径保持自洽（可保留对外部旧仓的只读遗留读取，或明确删除并更新测试）。不覆盖已有 .tiller/task/ 同名任务。版本保持 0.5.0。

### 范围

- 做：`src`、`test`、`resources`、`README.md`、`AGENTS.md`、`.tiller/work`、`.tiller/task`、`.tiller/rules`、`.tiller/usage.md`、`.tiller/context`、`.tiller/specs`、`.tiller/cases`、`.tiller/index.md`、`.tiller/project.json`
- 不做：`src`、`test`、`resources`、`README.md`、`AGENTS.md`、`.tiller/work`、`.tiller/task`、`.tiller/rules`、`.tiller/usage.md`、`.tiller/context`、`.tiller/specs`、`.tiller/cases`、`.tiller/index.md`、`.tiller/project.json` 以外的文件
- 涉及模块或文件：`src`、`test`、`resources`、`README.md`、`AGENTS.md`、`.tiller/work`、`.tiller/task`、`.tiller/rules`、`.tiller/usage.md`、`.tiller/context`、`.tiller/specs`、`.tiller/cases`、`.tiller/index.md`、`.tiller/project.json`

### 验收条件

- AC-1: 每个应保留的历史 work 目录已迁到 .tiller/task/<同 id>/task.md（内容由 work.md 转为现行 task 结构能表达的部分；同 id 已存在则跳过并在任务记录说明，不覆盖）
- AC-2: 本仓库产品历史不再依赖 .tiller/work/ 现行树（目录删除或清空且无现行引用）；README/usage/rules/context/specs 中把 work 当现行模型的表述已改为 task
- AC-3: 升级与 flow 对遗留 work 的行为与测试一致：要么保留薄只读兼容并有测试，要么删除遗留支持并更新 fixture/测试
- AC-4: 新增或调整用例与具名测试覆盖迁移/遗留语义；全量 build/lint/typecheck/test/test:package 通过；版本仍为 0.5.0

## 设计

### 方案

- 迁移：遍历本仓库 `.tiller/work/<id>/`；若 `.tiller/task/<id>/` 已存在则跳过并在本任务记录中列出；否则新建 `task.md`，把 `work.md`（及同目录其它可读附属文件的摘要引用）转成现行结构化任务能表达的字段（标题/需求摘要/历史结论），无法可靠映射的段落保留在需求或附注正文，不伪造确认/验证/验收。
- 清理：迁移完成后删除本仓库 `.tiller/work/` 产品历史树；文档与规则中把 work 表述为现行模型的句子改为 task；允许 usage 中保留一句「外部旧仓只读遗留」说明（若保留兼容）。
- 兼容：优先保留 `LEGACY_TASK_DIRECTORY` 薄只读路径，供 upgrade/flow 测试与外部旧仓读取；本仓库自身不再提交 work 树。若实现中发现遗留路径已无价值，可删除遗留支持并同步改测试 fixture——二选一，以改动面更小且测试绿为准。
- 用例：为 AC 登记 Markdown 用例（CASE 编号顺延），测试名引用 CASE-xxx；全量验证通过；版本保持 0.5.0。

### 取舍

不做自动「内容语义升级」到完整已验收状态；历史记录以可读迁移为主。不覆盖已有 task。不引入第二套归档目录。

### 影响与风险

- 受影响：`.tiller/work`、`.tiller/task`、文档/rules、可能的 `src/flow.ts` / upgrade 与相关测试。
- 风险：work.md 形态不一，转换后阶段推导可能显示「已开始」而非历史真实终态——可接受，并在迁移说明中写明。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 提交：aed8a9ba0db7eff6eae3e5f14349766a40b90d01
- 对象摘要：44b5ae3745f8c63af90ce82b9fc2755f902061947cac80ebdbcdb9fbc46dba25
- 时间：2026-10-23T02:59:41.654Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 提交：aed8a9ba0db7eff6eae3e5f14349766a40b90d01
- 对象摘要：5e5f2056d65b18171cedc6e81cf52a31ce9b9e7b304449e8a68d9b5dd7c9a13b
- 时间：2026-10-23T02:59:41.729Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 提交：3a23b14727368ed2c215056effd07cfc26b92193
- 对象摘要：7004cdad9552f344331f94d9e45b9dacb25cfb424e6dafeeede4f0f5e1f0f10f
- 时间：2026-10-23T03:43:04.327Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/work-migration.test.mjs::CASE-110 migrated history keeps one structured task record for every work id
- 用例：CASE-110
- 命令：node '--test-name-pattern=^CASE-110 migrated history keeps one structured task record for every work id$' --test-reporter=./.tiller/local/verify-uzvYF4/reporter.mjs --test-reporter-destination=.tiller/local/verify-uzvYF4/report.jsonl test/work-migration.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-migrate-work/run-1.log
- 提交：aed8a9ba0db7eff6eae3e5f14349766a40b90d01
- 代码树摘要：02d6cfdbc5b44b53d191cac132624a86e3eab5125decb1ef4bdb24199ac2a339
- 时间：2026-10-23T03:42:04.722Z

### run-2
- 条件：AC-2
- 测试：test/work-migration.test.mjs::CASE-111 current documentation and initialization expose task, not the legacy work tree
- 用例：CASE-111
- 命令：node '--test-name-pattern=^CASE-111 current documentation and initialization expose task, not the legacy work tree$' --test-reporter=./.tiller/local/verify-WMBW7a/reporter.mjs --test-reporter-destination=.tiller/local/verify-WMBW7a/report.jsonl test/work-migration.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-migrate-work/run-2.log
- 提交：aed8a9ba0db7eff6eae3e5f14349766a40b90d01
- 代码树摘要：02d6cfdbc5b44b53d191cac132624a86e3eab5125decb1ef4bdb24199ac2a339
- 时间：2026-10-23T03:42:09.059Z

### run-3
- 条件：AC-3
- 测试：test/flow-cli.test.mjs::CASE-015 CASE-112 legacy work records stay read-only and are not listed as current tasks
- 用例：CASE-112
- 命令：node '--test-name-pattern=^CASE-015 CASE-112 legacy work records stay read-only and are not listed as current tasks$' --test-reporter=./.tiller/local/verify-1kHg0a/reporter.mjs --test-reporter-destination=.tiller/local/verify-1kHg0a/report.jsonl test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-migrate-work/run-3.log
- 提交：aed8a9ba0db7eff6eae3e5f14349766a40b90d01
- 代码树摘要：02d6cfdbc5b44b53d191cac132624a86e3eab5125decb1ef4bdb24199ac2a339
- 时间：2026-10-23T03:42:09.592Z

### run-4
- 条件：AC-4
- 测试：test/work-migration.test.mjs::CASE-113 migration preserves the 0.5.0 release contract and full verification entry
- 用例：CASE-113
- 命令：node '--test-name-pattern=^CASE-113 migration preserves the 0\.5\.0 release contract and full verification entry$' --test-reporter=./.tiller/local/verify-JUChF7/reporter.mjs --test-reporter-destination=.tiller/local/verify-JUChF7/report.jsonl test/work-migration.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-migrate-work/run-4.log
- 提交：aed8a9ba0db7eff6eae3e5f14349766a40b90d01
- 代码树摘要：02d6cfdbc5b44b53d191cac132624a86e3eab5125decb1ef4bdb24199ac2a339
- 时间：2026-10-23T03:42:10.311Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 19 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 11 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 28 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 53 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
