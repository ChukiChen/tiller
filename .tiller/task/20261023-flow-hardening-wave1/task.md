# 流程硬化第一波：日期ID、过程卫生、runner引导、受管入库

<!-- tiller-task:v1 {"version":1,"id":"20261023-flow-hardening-wave1","type":"improvement","size":"standard","created":"2026-10-23T12:02:33.899Z","base":"4129d9f4c3d6aafcb7166cc5bf43ef87e2b048da","scope":["src","test","resources",".tiller","README.md","AGENTS.md"],"preExisting":{".tiller/plans/20261023-flow-hardening.md":"68090c07306f45a202cbe97df3d6bdabdbc0f185de34ea08613ae466bd8315a2"},"format":"structured","slug":"flow-hardening-wave1","summary":"流程约定变门禁","requirementFile":".tiller/local/flow-hardening-wave1-req.md"} -->

## 需求

### 目标

需求来源：`.tiller/local/flow-hardening-wave1-req.md`

# 流程硬化第一波（规划 20261023-flow-hardening 的 P-1～P-4） 对照仓库内流程实测暴露的软约定，把高优先级项落成可观察行为。不审测试是否覆盖用例语义，不认证 confirm 身份，不阻止绕过 CLI 改文件。版本保持 0.5.0。 ## 已明确方向 - 任务编号推荐并检查日期前缀；公开示例统一带日期。 - standard 任务过程乱序（设计确认前已有实现侧 verify，或确认时工作区相对确认提交已有明显业务改动）在 check 中可见；accept 默认阻断，verify 本身不因缺 design confirm 而硬拒（保留 TDD/探索）。 - 初始化或开始任务时，若工程根存在 pom.xml / build.gradle / build.gradle.kts，引导或默认使用对应 junit 运行器；case add 的测试骨架随当前 verify.runner 变化，不再永远输出 node:test。 - 受管入口（如 AGENTS.md、平台 PR/MR 模板）若存在于磁盘但未被 Git 跟踪，check/release 给出明确警告或失败；init 成功后提示建议首次提交的受管路径。 ## 本轮不做 - 设计/模块字数 KPI、用例步骤语义审判、JUnit DisplayName 全量扫描、日志全文强制入库、confirm 身份鉴权、其余中低优先级条目（规划 P-5～P-7）。

### 范围

- 做：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md`
- 不做：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md` 以外的文件
- 涉及模块或文件：`src`、`test`、`resources`、`.tiller`、`README.md`、`AGENTS.md`

### 验收条件

- AC-1: 新建 standard/small 任务时，无 YYYYMMDD- 前缀的任务编号会得到明确警告或自动补齐提示；usage/help/AGENTS 中的任务编号示例均带日期前缀
- AC-2: standard 任务在设计确认之前已记录 verify，或确认记录的提交与当时工作区相对确认提交存在明显未提交业务改动时，check 汇总过程卫生问题；默认 accept 因此阻断，verify 不因缺少 design confirm 而拒绝执行
- AC-3: 工程根存在 pom.xml 或 Gradle 构建文件时，init 或等价配置路径会提示或写入对应 junit 运行器；case add 输出的测试骨架与当前 verify.runner 一致，不再固定为 node:test
- AC-4: 磁盘上存在但未被 Git 跟踪的受管入口文件会使 check 或 release 给出可定位警告或失败；init 成功输出包含建议首次提交的受管路径说明
- AC-5: 上述行为有用例与具名测试覆盖，全量 build/lint/typecheck/test/test:package 通过，版本保持 0.5.0

## 设计

### 方案

- 对照规划 `.tiller/plans/20261023-flow-hardening.md` 的 P-1～P-4；本任务不挂 `--item`（多条目合并为一次 standard 交付）。
- **AC-1 日期前缀**：`start`（及 plan start 若共用校验）在任务编号缺少 `YYYYMMDD-` 时输出明确 warning，不自动改写用户给定 id；校验仍允许无前缀以兼容历史。同步改 `resources/usage.md`、help 文案、`AGENTS.md` 示例为带日期 id。
- **AC-2 过程卫生**：在 check 增加过程检查（可放 flow/check 相关模块）：(1) standard 且存在 verify 记录，其时间早于有效 design 确认 → issue；(2) 任一类确认记录的提交对应工作区，相对该提交在 scope 内存在未提交且非仅 tiller 元数据的业务改动（启发式：src/test/业务路径）→ warning 或 issue。默认 `accept`/`check` 将上述 issue 视为阻断；`verify` 命令路径不新增「必须 design confirm」硬拒绝。resume/status 可附带过程摘要。
- **AC-3 runner 引导**：init（及写入默认 verify 的路径）探测工程根 `pom.xml` → 默认或提示 `junit-maven`；`build.gradle`/`build.gradle.kts` → `junit-gradle`；否则保持 `node-test`。`case add` 的 next/skeleton 按 `project.json`（或仓库）当前 `verify.runner` 分支生成 Node / JUnit 示例，不再写死 node:test。
- **AC-4 受管未跟踪**：check/release 枚举约定受管入口（至少 `AGENTS.md`、当前平台的 PR/MR 模板路径）；文件存在且 `git ls-files` 未跟踪 → warning（standard 可升 issue，以实现时与现有 check 严重度一致为准，优先可定位）。init 成功 JSON/文案增加「建议首次提交」路径列表。
- 用例从 CASE-174 起（若仓库已占用则顺延）；测试名含 CASE；全量验证；版本 0.5.0。

### 取舍

- verify 不硬绑 design，避免掐探索/TDD；过程问题收口在 check/accept。
- 日期前缀 warning 不强制改名，避免破坏已有脚本与历史任务。
- 不做 JUnit DisplayName 扫描、不做确认人鉴权、不做用例语义比对（留规划后续条目）。

### 影响与风险

- 旧仓库无日期任务 id、Java 仍手写 bridge、未跟踪 AGENTS 的工程，check/accept 可能从绿变黄/红，属预期收紧。
- 业务改动启发式可能误报（例如只改 README）；实现时优先保守、文案可解释。
- 需同步受管 resources 与 `.tiller` 内副本，避免 upgrade 漂移。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 用户原话：开始优化吧
- 原话用途：可选附注，不替代已写明的正文
- 提交：4129d9f4c3d6aafcb7166cc5bf43ef87e2b048da
- 对象摘要：768816ca5334f716593dd46c267b084acd9d4a80e5963db5495a448d4cde0034
- 时间：2026-10-23T12:02:45.021Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 用户原话：开始优化吧
- 原话用途：可选附注，不替代已写明的正文
- 提交：4129d9f4c3d6aafcb7166cc5bf43ef87e2b048da
- 对象摘要：e57bbe0119cf11e1289c4afa1ba3aaf757b3223e7686a823d43c4bfbe007b038
- 时间：2026-10-23T12:02:45.107Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 用户原话：继续
- 原话用途：可选附注，不替代已写明的正文
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 对象摘要：fcd00f27a79d6e63a7b5b99a20f6946edfed88ec9ab1c2157dc71308db18d210
- 时间：2026-10-23T13:48:09.809Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-174 start warns on a missing task date prefix without rewriting it
- 用例：CASE-174
- 命令：node '--test-name-pattern=^CASE-174 start warns on a missing task date prefix without rewriting it$' --test-reporter=./.tiller/local/verify-7Yg2wV/reporter.mjs --test-reporter-destination=.tiller/local/verify-7Yg2wV/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-1.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:46:56.879Z

### run-2
- 条件：AC-2
- 测试：test/flow-hardening.test.mjs::CASE-175 standard check flags verification recorded before design confirmation
- 用例：CASE-175
- 命令：node '--test-name-pattern=^CASE-175 standard check flags verification recorded before design confirmation$' --test-reporter=./.tiller/local/verify-jLzZ8z/reporter.mjs --test-reporter-destination=.tiller/local/verify-jLzZ8z/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-2.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:46:57.744Z

### run-3
- 条件：AC-2
- 测试：test/flow-hardening.test.mjs::CASE-175 confirmations expose uncommitted business changes but ignore tiller metadata
- 用例：CASE-175
- 命令：node '--test-name-pattern=^CASE-175 confirmations expose uncommitted business changes but ignore tiller metadata$' --test-reporter=./.tiller/local/verify-8DmZr6/reporter.mjs --test-reporter-destination=.tiller/local/verify-8DmZr6/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-3.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:46:57.744Z

### run-4
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 ${runner} is detected for init and case skeletons
- 用例：CASE-176
- 命令：node '--test-name-pattern=^CASE-176 \$\{runner\} is detected for init and case skeletons$' --test-reporter=./.tiller/local/verify-gbGM4K/reporter.mjs --test-reporter-destination=.tiller/local/verify-gbGM4K/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：未核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-4.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:47:00.380Z

### run-5
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-177 untracked managed entries are visible in check and block release
- 用例：CASE-177
- 命令：node '--test-name-pattern=^CASE-177 untracked managed entries are visible in check and block release$' --test-reporter=./.tiller/local/verify-tSPGRQ/reporter.mjs --test-reporter-destination=.tiller/local/verify-tSPGRQ/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-5.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:47:00.824Z

### run-6
- 条件：AC-5
- 测试：test/flow-hardening.test.mjs::CASE-178 hardening regression names and version stay linked at 0.5.0
- 用例：CASE-178
- 命令：node '--test-name-pattern=^CASE-178 hardening regression names and version stay linked at 0\.5\.0$' --test-reporter=./.tiller/local/verify-JGUDoh/reporter.mjs --test-reporter-destination=.tiller/local/verify-JGUDoh/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-6.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:47:02.049Z

### run-7
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 junit-maven is detected for init and case skeletons
- 用例：无
- 命令：node '--test-name-pattern=^CASE-176 junit-maven is detected for init and case skeletons$' --test-reporter=./.tiller/local/verify-XLPq06/reporter.mjs --test-reporter-destination=.tiller/local/verify-XLPq06/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-7.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:47:16.425Z

### run-8
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 junit-gradle is detected for init and case skeletons
- 用例：无
- 命令：node '--test-name-pattern=^CASE-176 junit-gradle is detected for init and case skeletons$' --test-reporter=./.tiller/local/verify-68B73K/reporter.mjs --test-reporter-destination=.tiller/local/verify-68B73K/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：未核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-8.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:47:17.492Z

### run-9
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 node-test is detected for init and case skeletons
- 用例：无
- 命令：node '--test-name-pattern=^CASE-176 node-test is detected for init and case skeletons$' --test-reporter=./.tiller/local/verify-7vieWC/reporter.mjs --test-reporter-destination=.tiller/local/verify-7vieWC/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-9.log
- 提交：89d58d9a32bcf054542057196bf7408dfca41699
- 代码树摘要：c60662784675c640992617f3016272af81eaea218820f569c064b7c1ce71a37a
- 时间：2026-10-23T13:47:19.096Z

### run-10
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-174 start warns on a missing task date prefix without rewriting it
- 用例：CASE-174
- 命令：node '--test-name-pattern=^CASE-174 start warns on a missing task date prefix without rewriting it$' --test-reporter=./.tiller/local/verify-ejGx02/reporter.mjs --test-reporter-destination=.tiller/local/verify-ejGx02/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-10.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:55.504Z

### run-11
- 条件：AC-2
- 测试：test/flow-hardening.test.mjs::CASE-175 standard check flags verification recorded before design confirmation
- 用例：CASE-175
- 命令：node '--test-name-pattern=^CASE-175 standard check flags verification recorded before design confirmation$' --test-reporter=./.tiller/local/verify-1kAznS/reporter.mjs --test-reporter-destination=.tiller/local/verify-1kAznS/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-11.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:56.378Z

### run-12
- 条件：AC-2
- 测试：test/flow-hardening.test.mjs::CASE-175 confirmations expose uncommitted business changes but ignore tiller metadata
- 用例：CASE-175
- 命令：node '--test-name-pattern=^CASE-175 confirmations expose uncommitted business changes but ignore tiller metadata$' --test-reporter=./.tiller/local/verify-NlPiVs/reporter.mjs --test-reporter-destination=.tiller/local/verify-NlPiVs/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-12.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:56.378Z

### run-13
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 pom detects junit-maven for init and case skeletons
- 用例：CASE-176
- 命令：node '--test-name-pattern=^CASE-176 pom detects junit-maven for init and case skeletons$' --test-reporter=./.tiller/local/verify-mdPBON/reporter.mjs --test-reporter-destination=.tiller/local/verify-mdPBON/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-13.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:59.046Z

### run-14
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 gradle detects junit-gradle for init and case skeletons
- 用例：CASE-176
- 命令：node '--test-name-pattern=^CASE-176 gradle detects junit-gradle for init and case skeletons$' --test-reporter=./.tiller/local/verify-4hS6o6/reporter.mjs --test-reporter-destination=.tiller/local/verify-4hS6o6/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-14.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:59.046Z

### run-15
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 gradle-kts detects junit-gradle for init and case skeletons
- 用例：CASE-176
- 命令：node '--test-name-pattern=^CASE-176 gradle-kts detects junit-gradle for init and case skeletons$' --test-reporter=./.tiller/local/verify-tUankY/reporter.mjs --test-reporter-destination=.tiller/local/verify-tUankY/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-15.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:59.046Z

### run-16
- 条件：AC-3
- 测试：test/flow-hardening.test.mjs::CASE-176 node detects node-test for init and case skeletons
- 用例：CASE-176
- 命令：node '--test-name-pattern=^CASE-176 node detects node-test for init and case skeletons$' --test-reporter=./.tiller/local/verify-RYts2i/reporter.mjs --test-reporter-destination=.tiller/local/verify-RYts2i/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-16.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:47:59.046Z

### run-17
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-177 untracked managed entries are visible in check and block release
- 用例：CASE-177
- 命令：node '--test-name-pattern=^CASE-177 untracked managed entries are visible in check and block release$' --test-reporter=./.tiller/local/verify-OPOVCe/reporter.mjs --test-reporter-destination=.tiller/local/verify-OPOVCe/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-17.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:48:03.286Z

### run-18
- 条件：AC-5
- 测试：test/flow-hardening.test.mjs::CASE-178 hardening regression names and version stay linked at 0.5.0
- 用例：CASE-178
- 命令：node '--test-name-pattern=^CASE-178 hardening regression names and version stay linked at 0\.5\.0$' --test-reporter=./.tiller/local/verify-yznniq/reporter.mjs --test-reporter-destination=.tiller/local/verify-yznniq/report.jsonl test/flow-hardening.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-flow-hardening-wave1/run-18.log
- 提交：1bcfe9a1856dd91b202d4de4f103b2e4ce7339ce
- 代码树摘要：84dc9b221d90d6e5e2250abf45e0a9e8ad6df632e69d235b6b8caec6087aeeb0
- 时间：2026-10-23T13:48:04.738Z

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
- 提交 1bcfe9a 不符合提交信息规范：fix(test): CASE-176 使用可核实的静态测试名（模块 test 不在 specs/modules 中）。
- 分支 feat/20261023-flow-hardening 中的任务编号与当前任务 20261023-flow-hardening-wave1 不符。
- 本次改动涉及模块 initialization：建议回归该模块 58 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 22 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 36 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 60 条用例及经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期有效结论，请同步；纯过程性变更可忽略。
