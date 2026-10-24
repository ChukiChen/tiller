# 缺口收口：回写辅助、失败停止、pytest、过程债

<!-- tiller-task:v1 {"version":1,"id":"20261024-gap-closure","type":"feature","size":"standard","created":"2026-10-24T00:07:31.986Z","base":"e42336e50f2cf6c223b77a8d1b64273204d88a87","scope":["src","test","resources",".tiller","README.md","AGENTS.md"],"preExisting":{".tiller/plans/20261024-gap-closure.md":"cc0728abab10f6178f0ab7f76cce14292fac8fa08b98598ad4908c3418241ec2"},"format":"structured","plan":"20261024-gap-closure","item":"P-1","summary":"回写建议、连续失败停止、pytest runner、受管摘要采纳与任务挂接规划","requirementFile":".tiller/local/20261024-gap-closure-req.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/20261024-gap-closure-req.md`

对齐全局目标缺口 2～5：规格回写给出可操作建议（不硬门禁）；同一验收条件或用例连续两次 verify 失败后停止自动重试并给出证据与可选方案提示；新增 pytest 验证运行器（探测、写入 verify.runner、case 骨架、JUnit XML 核实）；支持采纳受管文件本地摘要与将已有任务挂到规划条目，并用于修复本仓 AGENTS/usage 漂移及历史规划 tasks 为空的问题。

### 范围

- 做：`src`、`test`、`resources`、`.tiller`（含 usage/rules/specs 同步）、`README.md`、`AGENTS.md`
- 不做：不发 npm、不加 LICENSE/CI（属 hygiene P-6）；不做身份认证与远端托管调用；不新增除 pytest 外的语言 runner；不把规格回写做成硬门禁
- 涉及模块或文件：workflow、verification、initialization、standards 相关实现与用例

### 验收条件

- AC-1: check 在规格/背景未回写时给出可定位的操作建议（涉及模块或路径），默认不因此单独阻断 accept
- AC-2: 同一 AC 或同一 CASE 连续两次 verify 失败且中间无成功核实后，check 或 verify 明确要求停止自动重试并提示报告证据与可选方案
- AC-3: 可探测 pytest 工程并设置 verify.runner=pytest；case add 生成 pytest 骨架；verify 能执行并按私有 JUnit XML 核实通过/失败
- AC-4: 提供采纳受管文件当前内容摘要的命令，以及将已有任务挂到 --plan/--item 的命令；本仓 AGENTS.md 与 usage.md 漂移可消除，历史规划条目可关联已关闭任务

## 规划

- 规划：20261024-gap-closure
- 条目：P-1

## 设计

### 方案

1. **回写建议（P-1 / AC-1）**：强化现有「任务基线后 specs/context 未回写」类 check 提示：根据任务范围与改动模块，列出建议同步的具体相对路径（如 `.tiller/specs/modules/<module>/requirements.md`、`design.md`、`decisions.md`、`context/project.md`）及一至两条可粘贴的小节提纲；保持 warning，不单独阻断 accept。
2. **连续失败停止（P-2 / AC-2）**：在任务验证记录中识别「同一 AC 或同一 CASE」的连续失败核实；当连续两次失败且中间无成功核实，`verify` 返回明确停止文案（要求停止自动重试、报告证据与 2～3 个可选方案），`check` 汇总为可定位 issue（对齐 FLOW-05）。成功核实清零该键的失败计数。不统计不同 AC/CASE 的交叉失败。
3. **pytest runner（P-3 / AC-3）**：扩展 `VERIFY_RUNNER_NAMES` 与 `TestRunner`：`pytest` 构造 `pytest --junitxml=<私有报告>`（必要时 `-k` 精确过滤），解析 JUnit XML，命中规则与现有 junit 路径一致。`init`/探测在存在 `pytest.ini`、`pyproject.toml` 中 `[tool.pytest]`、或常见 `test_*.py`/`tests` 布局时写入 `verify.runner=pytest`（不内嵌 Python）。`case add` 按 runner 生成 pytest 函数骨架与 CASE 注释。同步 resources/usage/AGENTS。
4. **过程债（P-4 / AC-4）**：新增 (a) 采纳受管文件当前内容写入 `project.json` managedFiles 摘要的命令（例如 `upgrade --adopt` 或等价），用于本仓 AGENTS.md / usage.md 漂移；(b) 将已有任务挂到规划条目的命令（写入 task 元数据 `plan`/`item`，供 `plan status` 汇总）。交付时对本仓执行采纳，并对 `20261023-hygiene` / `20261023-flow-hardening` 已关闭任务补挂条目（能唯一对应则挂；无法唯一对应的条目在报告中列出）。

### 取舍

- 回写保持软提示，避免与现有「由人判断是否长期结论」决定冲突。
- 失败停止以「同一 AC 或同一 CASE」为键，而不是模糊的「同一问题」自然语言匹配，保证可测。
- pytest 只认 JUnit XML 证据，不把 stdout 当通过依据；不自动安装 pytest。
- 任务挂接允许事后补记，不改写历史确认摘要；不自动猜测未绑定任务的条目归属除非本任务明确补挂。

### 影响与风险

- check/verify 文案与门禁行为变化会影响依赖旧提示语的脚本；需更新用例与 usage。
- pytest 环境缺失时 verify 应失败并可读，而非静默跳过。
- 采纳摘要会让 upgrade 不再把该文件当冲突，若误采纳会掩盖与上游模板的差异——命令需在帮助中说明。
- 历史规划补挂可能无法完美覆盖每个条目，以可追溯关联为准，不伪造验收。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 提交：e42336e50f2cf6c223b77a8d1b64273204d88a87
- 对象摘要：c014444f99d25a8ae64ca5fc802b316619e0104d071b9a3f3037c73b12b8e1db
- 时间：2026-10-24T00:07:44.815Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 提交：e42336e50f2cf6c223b77a8d1b64273204d88a87
- 对象摘要：3c9dfe54df1a56df5ba5e306503ba652b69d11d34e5aec9368906e52d67427bf
- 时间：2026-10-24T00:07:44.896Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 提交：aa8c05183e35182d3e7bdc777b84330e6f07295f
- 对象摘要：3b72b36df86437a4fdb45b39445c59cbf8cedfa57ba76f887db995c621993f7f
- 时间：2026-10-24T00:40:03.924Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/gap-closure.test.mjs::CASE-186 check locates specs and context writeback suggestions without blocking on them alone
- 用例：CASE-186
- 命令：node '--test-name-pattern=^CASE-186 check locates specs and context writeback suggestions without blocking on them alone$' --test-reporter=./.tiller/local/verify-jBxhSj/reporter.mjs --test-reporter-destination=.tiller/local/verify-jBxhSj/report.jsonl test/gap-closure.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-gap-closure/run-1.log
- 提交：aa8c05183e35182d3e7bdc777b84330e6f07295f
- 代码树摘要：fc883e05e5f8f8afac04c654a0db7928c7eaf8506acc9f9a28f73975375c61d3
- 时间：2026-10-24T00:39:46.099Z

### run-2
- 条件：AC-2
- 测试：test/gap-closure.test.mjs::CASE-187 repeated failures stop retries only for the same AC or CASE and a verified pass resets the count
- 用例：CASE-187
- 命令：node '--test-name-pattern=^CASE-187 repeated failures stop retries only for the same AC or CASE and a verified pass resets the count$' --test-reporter=./.tiller/local/verify-kEf2G6/reporter.mjs --test-reporter-destination=.tiller/local/verify-kEf2G6/report.jsonl test/gap-closure.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-gap-closure/run-2.log
- 提交：aa8c05183e35182d3e7bdc777b84330e6f07295f
- 代码树摘要：fc883e05e5f8f8afac04c654a0db7928c7eaf8506acc9f9a28f73975375c61d3
- 时间：2026-10-24T00:39:47.180Z

### run-3
- 条件：AC-3
- 测试：test/gap-closure.test.mjs::CASE-188 pytest detection, skeleton, command construction and private XML verification work end to end
- 用例：CASE-188
- 命令：node '--test-name-pattern=^CASE-188 pytest detection, skeleton, command construction and private XML verification work end to end$' --test-reporter=./.tiller/local/verify-Lm3ohw/reporter.mjs --test-reporter-destination=.tiller/local/verify-Lm3ohw/report.jsonl test/gap-closure.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-gap-closure/run-3.log
- 提交：aa8c05183e35182d3e7bdc777b84330e6f07295f
- 代码树摘要：fc883e05e5f8f8afac04c654a0db7928c7eaf8506acc9f9a28f73975375c61d3
- 时间：2026-10-24T00:39:49.285Z

### run-4
- 条件：AC-4
- 测试：test/gap-closure.test.mjs::CASE-189 upgrade adopts managed content and plan attach links an existing task
- 用例：CASE-189
- 命令：node '--test-name-pattern=^CASE-189 upgrade adopts managed content and plan attach links an existing task$' --test-reporter=./.tiller/local/verify-lRqJ6x/reporter.mjs --test-reporter-destination=.tiller/local/verify-lRqJ6x/report.jsonl test/gap-closure.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-gap-closure/run-4.log
- 提交：aa8c05183e35182d3e7bdc777b84330e6f07295f
- 代码树摘要：fc883e05e5f8f8afac04c654a0db7928c7eaf8506acc9f9a28f73975375c61d3
- 时间：2026-10-24T00:39:51.357Z

### run-5
- 条件：AC-4
- 测试：test/gap-closure.test.mjs::CASE-189 repository specs and managed copies describe the gap-closure contract
- 用例：CASE-189
- 命令：node '--test-name-pattern=^CASE-189 repository specs and managed copies describe the gap-closure contract$' --test-reporter=./.tiller/local/verify-aORiy4/reporter.mjs --test-reporter-destination=.tiller/local/verify-aORiy4/report.jsonl test/gap-closure.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-gap-closure/run-5.log
- 提交：aa8c05183e35182d3e7bdc777b84330e6f07295f
- 代码树摘要：fc883e05e5f8f8afac04c654a0db7928c7eaf8506acc9f9a28f73975375c61d3
- 时间：2026-10-24T00:39:51.357Z

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
- 本次改动涉及模块 initialization：建议回归该模块 58 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 23 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 39 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
