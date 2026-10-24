# 文档模板与精简任务标记

<!-- tiller-task:v1 {"version":1,"id":"20261024-doc-templates","type":"feature","size":"standard","created":"2026-10-24T03:34:13.986Z","base":"c3bad81ef7b030365ddef1eced49f1f1f5b35877","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","plan":"20261024-doc-templates","item":"P-1","slug":"doc-templates","summary":"精简任务标记并补齐需求设计文档模板","requirementFile":".tiller/local/20261024-doc-templates-req.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/20261024-doc-templates-req.md`

面向使用 tiller 写需求/设计的人（含本仓维护者与外部采用者）：当前 `start` 把 `--target` 路径塞进「范围」、AC 抢戏、项目/模块 specs 只有一句提示，且 task.md 顶栏 `<!-- tiller-task -->` 塞进整仓 `preExisting` 哈希，噪音大。本次交付后，新任务注释只留必要元数据；结构化需求与设计给出完整业务章节骨架；init 骨架与规则同步；确认拒绝空标题占位。

### 范围

- 做：精简任务标记（新任务不写 preExisting 进注释，旁路存 `.tiller/local/` 或等价；旧标记兼容）；重写 `renderStructuredRequirement` / `emptyDesignTemplate` 与 confirm/check 校验；更新 `core.ts` 项目/模块 specs 骨架；同步 resources 与 `.tiller` 受管规则、usage、workflow/initialization specs。
- 不做：不发 npm / LICENSE / CI（hygiene P-6）；不加长示例范文；不改版本号；不新增 runner；不自动 merge PR。
- 假设与待确认：`preExisting` 仍用于范围与过程卫生时必须旁路可读，不能静默丢弃导致误报超范围。

### 验收条件

- AC-1: 新任务 task.md 顶栏注释不含 preExisting；开工前改动摘要若仍需用于范围/过程卫生检查则写入 .tiller/local/ 旁路文件；旧任务带 preExisting 的标记仍可解析；check/verify/accept 行为不因精简而误报超范围
- AC-2: start 生成的结构化需求含面向谁与问题、目标、业务范围（做/不做/假设与待确认）、关键行为、异常与边界、验收条件；业务范围不罗列 --target 路径；meta.scope 仍由 --target 写入；confirm requirements 在关键章节仅空标题或占位时拒绝确认
- AC-3: standard 空设计模板含方案、失败处理、取舍、影响与风险、验证入口；confirm design / check 对空白或占位关键节给出缺失或可定位提示
- AC-4: init 项目 requirements.md、design.md 与模块规格引导含完整章节标题及简短写什么提示且无长示例；ACT-REQ、QUALITY-DOC、usage 与 workflow/initialization 相关 specs 与上述模板一致

## 规划

- 规划：20261024-doc-templates
- 条目：P-1

## 设计

### 方案

1. **精简标记（AC-1 / P-1）**：`start` 仍计算开工前脏文件哈希，但写入 `.tiller/local/tasks/<id>/pre-existing.json`（或同等旁路路径，已被 gitignore），不写入 `FlowMeta` 序列化到 task.md 的 JSON。`parseMeta` 继续接受旧标记里的 `preExisting`；`readTask` 合并旁路文件到运行时 `meta.preExisting`（缺省 `{}`）。`renderTask` 序列化标记时省略 `preExisting`。范围检查与过程卫生继续用运行时字典，行为与现网一致。
2. **需求模板（AC-2 / P-2）**：`renderStructuredRequirement` 生成：面向谁与问题、目标（填入 `--requirement` / 文件摘要）、业务范围（做/不做/假设与待确认——业务语句占位，不列路径）、关键行为、异常与边界、验收条件（AC 列表）。`--target` 只进 `meta.scope`。`requirementFieldIssues` / confirm 对关键节用 `markdownMeaningfulLines`（或等价）拒绝空标题与占位。旧「### 范围」仅路径列表的任务：解析兼容——若存在「业务范围」按新规则，否则仍认「范围」以免旧任务无法确认。
3. **设计模板（AC-3 / P-2）**：`emptyDesignTemplate` 含方案、失败处理、取舍、影响与风险、验证入口（每节可附一行「写什么」提示）。`designFieldIssues` 与 `taskDesignThinWarnings` 覆盖新节；方案、失败处理、影响与风险、验证入口确认时必填实质内容，取舍缺失保持提示策略（与现网一致或升为必填——实现时与 ACT-DES 对齐，至少不能空壳通过 check 的「过薄」检测）。
4. **骨架与规则（AC-4 / P-3）**：`SKELETON_FILES` 中项目 `requirements.md`、`design.md` 改为完整章节标题 + 简短写什么；`modules/README.md` 说明模块 requirements/design 应有的章节。同步 `resources/rules/activities/requirements.md`、`design.md`、`quality/documents.md`、`usage.md` 与 `.tiller` 副本；更新 workflow/initialization specs 中描述旧「目标/范围/验收条件」「方案/取舍/影响与风险」的段落。不要长示例。

### 失败处理

- 旁路 preExisting 文件损坏或不可读：按空字典处理并在 check 给出 warning，不把开工前脏文件误判为超范围（宁可漏过滤也要可读）；实现时优先保证「有旁路则过滤、无旁路且无标记字段则不过滤该路径」。
- 确认时关键节为空：`confirm` 返回明确缺失章节名，不写确认记录。
- 旧任务仅有「### 范围」：仍可确认与 check，不强制改写历史正文。

### 取舍

- 旁路存 local 而非删除能力：用户明确不要注释里的整仓快照，但 check 仍依赖哈希忽略开工前脏文件。
- 业务范围与交付路径分离：路径留 meta.scope，避免再次把 src/test 写进需求「做/不做」。
- 不做长示例：用户已确认只要章节模板。
- 版本保持 0.5.0。

### 影响与风险

- 影响：`src/flow.ts`、`src/core.ts`、相关 test、resources 受管文件、`.tiller` specs/rules/usage、可能 `cli.ts` 帮助文案。
- 风险：旧测试硬编码 `### 范围` 需更新；漏改 `renderTask` 省略字段会导致旁路写入后再次被写回注释。
- 缓解：新增 CASE 覆盖新标记、新模板、旧标记兼容与 confirm 拒空；全量 `npm test`。

### 验证入口

- 自动化：新 CASE（建议自 CASE-190 起）覆盖标记精简、旁路加载、旧标记解析、新需求/设计骨架、confirm 拒空、init 骨架章节；回归 flow-cli 结构化确认相关用例。
- 人工：抽查新 `start` 生成的 task.md 顶栏无 preExisting、需求业务范围无路径列表。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 对象摘要：b6a1c2f461d0ade056c3ca1621b92fa52698928af2498d655c4b9328418e57da
- 时间：2026-10-24T04:00:24.714Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 对象摘要：77f08ec7866167c8a46da145db82fc144ab5e61a2d7d087d3ddffd269c2ea704
- 时间：2026-10-24T04:00:24.870Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 对象摘要：827567236f0252fcf1505313cb73fa16f04d5a1bba9e29b6b8d8857a81078acb
- 时间：2026-10-24T04:01:03.666Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-190 new task marker omits preExisting and keeps the snapshot in the local sidecar
- 用例：CASE-190
- 命令：node '--test-name-pattern=^CASE-190 new task marker omits preExisting and keeps the snapshot in the local sidecar$' --test-reporter=./.tiller/local/verify-BXw3Zk/reporter.mjs --test-reporter-destination=.tiller/local/verify-BXw3Zk/report.jsonl test/doc-templates.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-doc-templates/run-7.log
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 代码树摘要：2e30b6ffd8ffc775944b13248609ddae3ca9f945723666b10bb216aa4da67ffd
- 时间：2026-10-24T04:00:32.713Z

### run-2
- 条件：AC-1
- 测试：test/doc-templates.test.mjs::CASE-191 legacy marker preExisting is still loaded and does not report an unchanged dirty file as scope drift
- 用例：CASE-191
- 命令：node '--test-name-pattern=^CASE-191 legacy marker preExisting is still loaded and does not report an unchanged dirty file as scope drift$' --test-reporter=./.tiller/local/verify-04vguS/reporter.mjs --test-reporter-destination=.tiller/local/verify-04vguS/report.jsonl test/doc-templates.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-doc-templates/run-8.log
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 代码树摘要：2e30b6ffd8ffc775944b13248609ddae3ca9f945723666b10bb216aa4da67ffd
- 时间：2026-10-24T04:00:34.541Z

### run-3
- 条件：AC-2
- 测试：test/doc-templates.test.mjs::CASE-192 structured requirements keep business scope separate from target paths
- 用例：CASE-192
- 命令：node '--test-name-pattern=^CASE-192 structured requirements keep business scope separate from target paths$' --test-reporter=./.tiller/local/verify-ipnUCF/reporter.mjs --test-reporter-destination=.tiller/local/verify-ipnUCF/report.jsonl test/doc-templates.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-doc-templates/run-9.log
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 代码树摘要：2e30b6ffd8ffc775944b13248609ddae3ca9f945723666b10bb216aa4da67ffd
- 时间：2026-10-24T04:00:36.349Z

### run-4
- 条件：AC-2
- 测试：test/doc-templates.test.mjs::CASE-193 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section
- 用例：CASE-193
- 命令：node '--test-name-pattern=^CASE-193 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section$' --test-reporter=./.tiller/local/verify-M2R3ax/reporter.mjs --test-reporter-destination=.tiller/local/verify-M2R3ax/report.jsonl test/doc-templates.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-doc-templates/run-10.log
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 代码树摘要：2e30b6ffd8ffc775944b13248609ddae3ca9f945723666b10bb216aa4da67ffd
- 时间：2026-10-24T04:00:37.942Z

### run-5
- 条件：AC-3
- 测试：test/doc-templates.test.mjs::CASE-194 design template covers failure handling and verification entry with located confirm and check feedback
- 用例：CASE-194
- 命令：node '--test-name-pattern=^CASE-194 design template covers failure handling and verification entry with located confirm and check feedback$' --test-reporter=./.tiller/local/verify-DViNwM/reporter.mjs --test-reporter-destination=.tiller/local/verify-DViNwM/report.jsonl test/doc-templates.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-doc-templates/run-11.log
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 代码树摘要：2e30b6ffd8ffc775944b13248609ddae3ca9f945723666b10bb216aa4da67ffd
- 时间：2026-10-24T04:00:40.206Z

### run-6
- 条件：AC-4
- 测试：test/doc-templates.test.mjs::CASE-195 init creates complete requirement and design section skeletons without long examples
- 用例：CASE-195
- 命令：node '--test-name-pattern=^CASE-195 init creates complete requirement and design section skeletons without long examples$' --test-reporter=./.tiller/local/verify-aRDh9o/reporter.mjs --test-reporter-destination=.tiller/local/verify-aRDh9o/report.jsonl test/doc-templates.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-doc-templates/run-12.log
- 提交：8bc802045519215a5bb594ebd5e7cf50562ec750
- 代码树摘要：2e30b6ffd8ffc775944b13248609ddae3ca9f945723666b10bb216aa4da67ffd
- 时间：2026-10-24T04:00:42.478Z

## 关闭

### close
- 状态：已关闭
- 原因：交付完成，PR 待审
- 时间：2026-10-24T04:01:09.010Z

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
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 59 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 23 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 39 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 72 条用例及经过它的场景 CASE-055, CASE-001。
