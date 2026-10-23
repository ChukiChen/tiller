# 流程硬化第二波：过薄文档、日志与其余约定

<!-- tiller-task:v1 {"version":1,"id":"20261023-flow-hardening-wave2","type":"improvement","size":"standard","created":"2026-10-23T14:01:20.948Z","base":"d752cf9e5349c43f3d1d3ad816a571974d06cc12","scope":["src","test","resources",".tiller","README.md","AGENTS.md"],"preExisting":{},"format":"structured","slug":"flow-hardening-wave2","summary":"流程硬化第二波约定","requirementFile":".tiller/local/flow-hardening-wave2-req.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/flow-hardening-wave2-req.md`

# 流程硬化第二波（规划 20261023-flow-hardening 的 P-5～P-7） 在第一波过程卫生与引导之上，把文档过薄、验证日志可读性，以及剩余可观察的中低优先级软约定落成 warning / check 提示。不审用例步骤语义，不做 JUnit DisplayName 全量扫描，不强制日志入库，不认证 confirm 身份。版本保持 0.5.0。 ## 已明确方向 - **P-5 过薄文档**：standard 任务在 check 时，若任务设计正文（方案/取舍/影响）明显空壳，或工程内 `.tiller/specs/decisions.md`、相关模块 `design.md` 仅有标题/样板而无实质条目，给出可定位 warning（默认不因单独过薄阻断 accept，除非与现有 check 严重度策略明确一致且可解释）。 - **P-6 日志与过期提示**：verify 写入 `.tiller/local/logs/` 的内容至少包含命令、退出码、起止摘要或失败摘录，避免仅一行 `$ cmd`；check/resume 对「验证相对当前代码树已过期」给出明确提示（与现有 tree 过期判定衔接，文案可读）。 - **P-7 其余约定**：在不引入鉴权/语义审判的前提下，硬化仍暴露的软约定，至少包括：(1) 当前分支名未包含任务编号时 check 给出明确 warning；(2) 公开 usage/help 中补充过程卫生、过薄文档与日志可读性的简短说明。不做：confirm 身份认证、用例步骤语义比对、JUnit DisplayName 扫描、日志全文强制提交。 ## 本轮不做 - confirm 身份鉴权、用例语义审判、JUnit DisplayName 全量扫描、日志强制入库、设计字数硬 KPI（字符数门禁）、P-1～P-4 已交付项的重复实现。

### 范围

- 做：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md`
- 不做：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md` 以外的文件
- 涉及模块或文件：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md`

### 验收条件

- AC-1: 过薄的任务设计或 decisions/模块设计在 check 中给出可定位 warning
- AC-2: verify 日志含命令与结果摘要；过期验证在 check/resume 有明确提示
- AC-3: 分支名未含任务编号时 check 有明确 warning；usage/help 覆盖本波约定说明
- AC-4: 上述行为有用例与具名测试覆盖，全量 build/lint/typecheck/test/test:package 通过，版本保持 0.5.0

## 设计

### 方案

- 对照规划 `.tiller/plans/20261023-flow-hardening.md` 的 P-5～P-7；本任务不挂 `--item`（多条目合并为一次 standard 交付）。
- **AC-1 / P-5 过薄文档**：check 检测 (1) standard 任务设计「方案/取舍/影响与风险」是否仅有空白或占位；(2) `.tiller/specs/decisions.md` 是否仅有标题/引导而无有效决定条目；(3) 本任务改动涉及模块的 `design.md` 是否明显空壳。命中则 warning，文案指出路径；默认不单凭过薄阻断 accept（除非与现有严重度表一致且可解释）。不做硬字数 KPI。
- **AC-2 / P-6 日志与过期**：verify 写日志时至少记录显示命令、退出码、起止时间或失败摘录（stdout/stderr 截断即可）；禁止仅 `$ cmd` 一行。check/resume 在验证 tree 与当前不符时使用明确「验证已过期」类文案（可复用/加强现有判定）。
- **AC-3 / P-7 其余**：分支名未包含任务 id 时 check warning（已有提示可升格或统一文案）；同步 `resources/usage.md` / help / AGENTS 简述过薄检查、日志可读与分支命名约定。
- 用例从 **CASE-179** 起；测试名含 CASE；静态测试名（勿用模板字符串作唯一名）；全量验证；版本 0.5.0。

### 取舍

- 过薄用 warning 引导补全，避免因文档启发式误杀验收。
- 日志仍不入库；只改善本机可读性。
- P-7 收窄为分支命名与文档说明，不扩散到鉴权与语义审判。

### 影响与风险

- 历史空壳 decisions/设计会被 warning 刷屏，属预期。
- 日志变长可能略增磁盘占用，仍在 `.tiller/local/`。
- 分支命名 warning 对短分支名（如 `feat/flow`）会提示，可忽略或改名。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 用户原话：合并，开始下一轮
- 原话用途：可选附注，不替代已写明的正文
- 提交：d752cf9e5349c43f3d1d3ad816a571974d06cc12
- 对象摘要：ffa44dc2393b6d3ad450ea445be6305a1a19a437ae171164a259fddd8e31b4e7
- 时间：2026-10-23T14:01:21.070Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 用户原话：合并，开始下一轮
- 原话用途：可选附注，不替代已写明的正文
- 提交：d752cf9e5349c43f3d1d3ad816a571974d06cc12
- 对象摘要：b69cb24432f16195b3bb283c128ba9109453a5a423545dd67c6e3dfcbbb028bf
- 时间：2026-10-23T14:01:21.153Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 用户原话：合并，开始下一轮
- 原话用途：可选附注，不替代已写明的正文
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 对象摘要：4938937eec33971c0c364c7538d2dc8673b48a49e3a680083f490fac66c47672
- 时间：2026-10-23T14:50:42.799Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-179 standard design fields that are blank or placeholders get located warnings
- 用例：CASE-179
- 命令：node '--test-name-pattern=^CASE-179 standard design fields that are blank or placeholders get located warnings$' --test-reporter=./.tiller/local/verify-90k8ec/reporter.mjs --test-reporter-destination=.tiller/local/verify-90k8ec/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-1.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:27.315Z

### run-2
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-180 empty decisions and touched module design are located in check warnings
- 用例：CASE-180
- 命令：node '--test-name-pattern=^CASE-180 empty decisions and touched module design are located in check warnings$' --test-reporter=./.tiller/local/verify-aOL6GN/reporter.mjs --test-reporter-destination=.tiller/local/verify-aOL6GN/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-2.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:28.688Z

### run-3
- 条件：AC-2
- 测试：test/verification-integrity.test.mjs::CASE-096 CASE-181 verify writes a readable command summary and verbose log
- 用例：CASE-181
- 命令：node '--test-name-pattern=^CASE-096 CASE-181 verify writes a readable command summary and verbose log$' --test-reporter=./.tiller/local/verify-1ifnOr/reporter.mjs --test-reporter-destination=.tiller/local/verify-1ifnOr/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-3.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:30.029Z

### run-4
- 条件：AC-2
- 测试：test/flow-hardening.test.mjs::CASE-182 check and resume explicitly report an expired verification
- 用例：CASE-182
- 命令：node '--test-name-pattern=^CASE-182 check and resume explicitly report an expired verification$' --test-reporter=./.tiller/local/verify-Q0Ree1/reporter.mjs --test-reporter-destination=.tiller/local/verify-Q0Ree1/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-4.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:31.213Z

### run-5
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-183 check explains a branch name missing the task id
- 用例：CASE-183
- 命令：node '--test-name-pattern=^CASE-183 check explains a branch name missing the task id$' --test-reporter=./.tiller/local/verify-t7JnaP/reporter.mjs --test-reporter-destination=.tiller/local/verify-t7JnaP/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-5.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:32.801Z

### run-6
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-184 help, usage and AGENTS explain thin checks, readable logs and branch naming
- 用例：CASE-184
- 命令：node '--test-name-pattern=^CASE-184 help, usage and AGENTS explain thin checks, readable logs and branch naming$' --test-reporter=./.tiller/local/verify-07NFbB/reporter.mjs --test-reporter-destination=.tiller/local/verify-07NFbB/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-6.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:34.307Z

### run-7
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-185 wave-two cases are referenced by named tests at version 0.5.0
- 用例：CASE-185
- 命令：node '--test-name-pattern=^CASE-185 wave-two cases are referenced by named tests at version 0\.5\.0$' --test-reporter=./.tiller/local/verify-l57kfd/reporter.mjs --test-reporter-destination=.tiller/local/verify-l57kfd/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-7.log
- 提交：6f1a8eb530b6d3a453cd259b376722e40b059b64
- 代码树摘要：fb4346dfc82ace86644cafbc8f9d415e01a3f1efeca467a261d95d0cc2819b86
- 时间：2026-10-23T14:49:35.009Z

### run-8
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-179 standard design fields that are blank or placeholders get located warnings
- 用例：CASE-179
- 命令：node '--test-name-pattern=^CASE-179 standard design fields that are blank or placeholders get located warnings$' --test-reporter=./.tiller/local/verify-CJpvkG/reporter.mjs --test-reporter-destination=.tiller/local/verify-CJpvkG/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-8.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:29.781Z

### run-9
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-180 empty decisions and touched module design are located in check warnings
- 用例：CASE-180
- 命令：node '--test-name-pattern=^CASE-180 empty decisions and touched module design are located in check warnings$' --test-reporter=./.tiller/local/verify-kTv116/reporter.mjs --test-reporter-destination=.tiller/local/verify-kTv116/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-9.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:31.177Z

### run-10
- 条件：AC-2
- 测试：test/verification-integrity.test.mjs::CASE-096 CASE-181 verify writes a readable command summary and verbose log
- 用例：CASE-181
- 命令：node '--test-name-pattern=^CASE-096 CASE-181 verify writes a readable command summary and verbose log$' --test-reporter=./.tiller/local/verify-DC4YO3/reporter.mjs --test-reporter-destination=.tiller/local/verify-DC4YO3/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-10.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:32.545Z

### run-11
- 条件：AC-2
- 测试：test/flow-hardening.test.mjs::CASE-182 check and resume explicitly report an expired verification
- 用例：CASE-182
- 命令：node '--test-name-pattern=^CASE-182 check and resume explicitly report an expired verification$' --test-reporter=./.tiller/local/verify-2NxOQw/reporter.mjs --test-reporter-destination=.tiller/local/verify-2NxOQw/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-11.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:33.789Z

### run-12
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-183 check explains a branch name missing the task id
- 用例：CASE-183
- 命令：node '--test-name-pattern=^CASE-183 check explains a branch name missing the task id$' --test-reporter=./.tiller/local/verify-kEMvUy/reporter.mjs --test-reporter-destination=.tiller/local/verify-kEMvUy/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-12.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:35.508Z

### run-13
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-184 help, usage and AGENTS explain thin checks, readable logs and branch naming
- 用例：CASE-184
- 命令：node '--test-name-pattern=^CASE-184 help, usage and AGENTS explain thin checks, readable logs and branch naming$' --test-reporter=./.tiller/local/verify-f2pWIX/reporter.mjs --test-reporter-destination=.tiller/local/verify-f2pWIX/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-13.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:36.860Z

### run-14
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-185 wave-two cases are referenced by named tests at version 0.5.0
- 用例：CASE-185
- 命令：node '--test-name-pattern=^CASE-185 wave-two cases are referenced by named tests at version 0\.5\.0$' --test-reporter=./.tiller/local/verify-SJKQMu/reporter.mjs --test-reporter-destination=.tiller/local/verify-SJKQMu/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave2/run-14.log
- 提交：890b269277ebc53d42ea11079147bc119cf2bf9e
- 代码树摘要：9e6c7557f88853e35e7e0fc01bac6205e37cbcd1a248f45d9643bbd8711bbd43
- 时间：2026-10-23T14:50:37.468Z

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
- 本次改动涉及模块 standards：建议回归该模块 22 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 38 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 65 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
