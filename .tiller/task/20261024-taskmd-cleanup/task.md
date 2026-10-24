# 精简确认自检并修分支命名

<!-- tiller-task:v1 {"version":1,"id":"20261024-taskmd-cleanup","type":"feature","size":"standard","created":"2026-10-24T09:24:11.497Z","base":"940c0b7691a4c2e8157d1fdf1431af3c384b5b07","scope":["src","test","resources",".tiller"],"format":"structured","plan":"20261024-taskmd-cleanup","item":"P-1","summary":"精简确认自检并修分支命名","requirementFile":".tiller/local/taskmd-cleanup-req.md"} -->

## 需求

### 面向谁与问题

任务执行者与审阅人读 `task.md` 时，确认段冗长、关单后自检堆模块回归提示、需求/设计易塞进交付路径与 specs 复述，导致防跑偏约束被噪声淹没；另 `start` 在任务编号已含描述且再传同名 `--slug` 时，分支会出现双 slug。

### 目标

一次落地：确认段人读表格式压缩（机器字段旁路）、关单/已关闭任务不再把长自检提示写入 task.md、需求/设计模板与 QUALITY 去噪但保留 AC/确认门禁、分支命名去掉重复 slug。

需求来源：`.tiller/local/taskmd-cleanup-req.md`

### 业务范围

- 做：新写入的 `## 确认` 紧凑表；`tiller-confirm:v1`（或等价）旁路保存 object/subject 等；旧冗长确认块仍可解析；`check`/`accept` 语义不变；关单后或渲染已关闭任务时 `## 自检` 不堆回归长列表（提示可仍在 `check` CLI）；章节注释与 ACT-REQ/ACT-DES/QUALITY-DOC 引导「留业务约束、不塞路径/长命令/全文 specs」；分支命名在 slug 已是任务编号描述后缀时不重复追加；worktree 路径仍只用任务编号一次。
- 不做：不改写全部历史已关闭任务正文；不发包；不改 README 对比表；不改 verify 私有报告核实核心；不放松 AC/确认门禁。
- 假设与待确认：时间列可用短本地可读形式或保留 ISO；表头可用中文。

### 关键行为

1. 新确认写入后，人读为表格列：部分、确认人、时间、短提交、原话（无则空或「—」）；对象说明与对象摘要等进入旁路注释。
2. 解析优先旁路，否则兼容今日冗长 bullet 确认块。
3. `check` 仍向 CLI/返回值暴露回归与回写提示；写入已关闭任务的 task.md 自检时不堆长提示列表。
4. start 新建结构化需求/空设计模板的 HTML 注释与规则文案明确：业务范围不写交付路径、设计不复制 specs 全文、验证入口可写短入口而非长命令菜谱。
5. `start --slug` 与任务 id 描述部分相同时，分支为 `类型/<任务编号>` 而非双后缀；worktree 目录 `.tiller/local/worktrees/<任务编号>/`。

### 异常与边界

- 无原话、无确认人（legacy）时表格仍可读，解析不丢门禁字段。
- 旧任务仅有冗长确认、无旁路时 check/accept 仍按摘要校验。
- 任务仍为 open 时，自检 checklist 行为可保持；重点是 close 后不留长噪声。
- slug 与 id 后缀不完全相同时仍允许追加额外描述。

### 验收条件

- AC-1: 新写入确认段为人读 Markdown 表（部分|确认人|时间|短提交|原话），object/subject 等在机器旁路；check/accept 确认语义不变；旧冗长确认可解析。
- AC-2: 已关闭任务渲染/写入的「## 自检」不含长串模块回归/回写提示列表；同类提示仍可出现在 check 输出。
- AC-3: 需求/设计章节注释与 QUALITY-DOC、ACT-REQ、ACT-DES（及受管 .tiller 副本）引导保留防跑偏正文、避免交付路径/长命令菜谱/specs 全文复述；确认空壳门禁仍在。
- AC-4: start 在 id 已含描述且 --slug 与该描述相同（或为 id 的 -<slug> 后缀）时，分支名为「类型/任务编号」不双拼；worktree 路径仅含任务编号一次。

## 规划

- 规划：20261024-taskmd-cleanup
- 条目：P-1

## 设计

### 方案

- 确认：`renderConfirmations` 输出一张 Markdown 表；每条确认旁写 `<!-- tiller-confirm:v1 {...} -->`，至少含 gate、object、subject、commit、by、quote、at；`parseConfirmations` 优先旁路，否则解析旧 bullet 块。
- 自检：`checkFlow`/`close`/`renderTask` 在任务已关闭（或即将写入关闭态）时，`## 自检` 只保留短 checklist 或一句指引，不把 `regressionWarnings`/`writebackWarning` 长列表写入 task.md；这些提示仍进入 `check` 的 warnings/CLI。
- 去噪：收紧 `renderStructuredRequirement`/`emptyDesignTemplate` 注释，并同步 `resources/rules` 与 `.tiller/rules` 中 QUALITY-DOC、ACT-REQ、ACT-DES 文案；不削弱空壳确认拒绝。
- 分支：`suggestedBranchNameFor`（及 `taskBranchName`）若 normalized slug 已是 `taskId` 的 `-<slug>` 后缀则不再追加；worktree 路径继续 `worktreeRoot(task.id)`。

### 失败处理

旁路 JSON 损坏时回退旧解析；旧块缺字段则跳过该条不崩溃。分支命名对非法 slug 仍报错。规则/模板改动失败则测试红灯阻断。

### 取舍

人读表 + 旁路，而不是删除确认段：保留 check/accept 摘要门禁。自检长提示留 CLI 不留关单后正文，避免与 slim-verify 方向冲突。需求去噪改注释/规则，不自动删用户已写正文。

### 影响与风险

- 影响：`src/flow.ts`、`src/branch-conventions.ts`、规则与 specs/cases、相关测试断言。
- 风险：旧确认解析回归；表格式时间/短 SHA 与摘要校验不一致——旁路保留全量 commit/subject。
- 缓解：CASE 覆盖新旧确认、关单自检、slug 去重；全量测试。

### 验证入口

`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`；定向 `node --test test/flow-cli.test.mjs test/verification-integrity.test.mjs test/rules.test.mjs` 等。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-24T09:40:57.856Z | 396af27d1b32 | 那跟上面的一起优化，包括4 |
| 设计 | boon yu | 2026-10-24T09:40:57.928Z | 396af27d1b32 | 那跟上面的一起优化，包括4 |
| 交付验收 | boon yu | 2026-10-24T09:41:23.887Z | a6e1dee5862b | 那跟上面的一起优化，包括4 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"0ef264fa0055d3e614c8efec5f95857c142560c546ca4e2cc2451a4f6e516e53","commit":"396af27d1b32f5ef6abcf1fbfa09f08831b8ba76","by":"boon yu","quote":"那跟上面的一起优化，包括4","at":"2026-10-24T09:40:57.856Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"4a70afb204438c57e889b24e42270cb314d7eff6de892c46ff3c818aa199b906","commit":"396af27d1b32f5ef6abcf1fbfa09f08831b8ba76","by":"boon yu","quote":"那跟上面的一起优化，包括4","at":"2026-10-24T09:40:57.928Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"88a6bc37118a68bbecb595c8cf5a6a8751c3144f5cbd64eecd5ffa097dcd31a5","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c","by":"boon yu","quote":"那跟上面的一起优化，包括4","at":"2026-10-24T09:41:23.887Z"} -->

## 验证

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-204 confirmations render a compact table with a complete machine sidecar$' \u002d\u002dtest-reporter=./.tiller/local/verify-54CG2w/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-54CG2w/report.jsonl test/flow-cli.test.mjs","exitCode":0,"tree":"d4cc9ec6656bc9838d9252239194626b2db132fee5687770fbb568315f5670ad","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c"} -->
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::CASE-204 confirmations render a compact table with a complete machine sidecar
- 用例：CASE-204
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-taskmd-cleanup/run-7.log
- 提交：a6e1dee5862b
- 时间：2026-10-24T09:41:02.544Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-064 CASE-205 legacy task text and quoted confirmation remain readable and valid$' \u002d\u002dtest-reporter=./.tiller/local/verify-JPk6ta/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-JPk6ta/report.jsonl test/flow-cli.test.mjs","exitCode":0,"tree":"d4cc9ec6656bc9838d9252239194626b2db132fee5687770fbb568315f5670ad","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c"} -->
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::CASE-064 CASE-205 legacy task text and quoted confirmation remain readable and valid
- 用例：CASE-205
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-taskmd-cleanup/run-8.log
- 提交：a6e1dee5862b
- 时间：2026-10-24T09:41:03.556Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-206 closed self-check omits long regression hints while check still reports them$' \u002d\u002dtest-reporter=./.tiller/local/verify-nWuR1M/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-nWuR1M/report.jsonl test/review-release.test.mjs","exitCode":0,"tree":"d4cc9ec6656bc9838d9252239194626b2db132fee5687770fbb568315f5670ad","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c"} -->
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-206 closed self-check omits long regression hints while check still reports them
- 用例：CASE-206
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-taskmd-cleanup/run-9.log
- 提交：a6e1dee5862b
- 时间：2026-10-24T09:41:04.865Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-207 requirement and design guidance reduces noise while confirmation gates remain$' \u002d\u002dtest-reporter=./.tiller/local/verify-SudNFp/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-SudNFp/report.jsonl test/doc-templates.test.mjs","exitCode":0,"tree":"d4cc9ec6656bc9838d9252239194626b2db132fee5687770fbb568315f5670ad","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c"} -->
- 条件：AC-3
- 测试：test/doc-templates.test.mjs::CASE-207 requirement and design guidance reduces noise while confirmation gates remain
- 用例：CASE-207
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-taskmd-cleanup/run-10.log
- 提交：a6e1dee5862b
- 时间：2026-10-24T09:41:06.648Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-208 branch slug already present in the task id is not appended twice$' \u002d\u002dtest-reporter=./.tiller/local/verify-PEb7mj/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-PEb7mj/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"d4cc9ec6656bc9838d9252239194626b2db132fee5687770fbb568315f5670ad","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-208 branch slug already present in the task id is not appended twice
- 用例：CASE-208
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-taskmd-cleanup/run-11.log
- 提交：a6e1dee5862b
- 时间：2026-10-24T09:41:07.684Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-208 worktree branch and path use the task id once when slug is already its suffix$' \u002d\u002dtest-reporter=./.tiller/local/verify-FhZLAg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-FhZLAg/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"d4cc9ec6656bc9838d9252239194626b2db132fee5687770fbb568315f5670ad","commit":"a6e1dee5862ba485baf209470c80c0c99cc8818c"} -->
- 条件：AC-4
- 测试：test/task-worktrees.test.mjs::CASE-208 worktree branch and path use the task id once when slug is already its suffix
- 用例：CASE-208
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-taskmd-cleanup/run-12.log
- 提交：a6e1dee5862b
- 时间：2026-10-24T09:41:07.684Z

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
- 本次改动涉及模块 workflow：建议回归该模块 85 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
