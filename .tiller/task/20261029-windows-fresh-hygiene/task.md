# Windows 与 fresh clone 初始化卫生

<!-- tiller-task:v1 {"version":1,"id":"20261029-windows-fresh-hygiene","type":"bugfix","size":"standard","created":"2026-10-29T01:02:06.812Z","base":"458051eeaaf41ba14661771892242b1e56ad7a8c","scope":[".tiller/specs",".tiller/cases","src","test","scripts",".tiller/run.cjs"],"format":"structured","slug":"windows-fresh-hygiene","summary":"Windows 与 fresh clone 初始化卫生"} -->

## 需求

### 使用场景

- Windows 开发者以 `core.autocrlf=true` 检出并合入 tiller 任务；在 confirmation 后从 primary 继续 close/resume。
- 新机器或 CI fresh clone 后，没有 `.tiller/local` 证明，但初始化 PR/MR 已经合入。
- Windows 工程使用 Maven、Gradle 或 pytest；网络不可用或 origin 配置错误时执行 `init` / `init --apply`。

### 目标

修复 D-01 换行导致的确认失效、D-02 fresh clone 初始化基线误判、D-03 Windows Java/Python 工具启动失败和 D-04 不可达 origin 预检缺口，完成稳定契约、实现、回归验证与真实 PR 交付。

### 业务范围

- 做：需求与设计覆盖确认摘要、初始化合入证明、Windows runner/adapter、origin 活性预检和失败边界；回写现有 specs 与全局 CASE；实现代码、测试与辅助脚本，并创建真实 PR。
- 不做：合入 PR/MR、升版本、自动安装工具、增加 tracked `head` 字段或按标题猜测合入。
- 假设：缺陷机制以 tip `458051e` 的源码事实为准；D-02 采用 commit 绑定而非回写 tracked head；实现与开 PR 已获授权，合入仍需单独授权。

### 关键行为

- D-01：设计确认与交付确认在 LF/CRLF/孤立 CR 间稳定；实质正文变化仍使确认失效。
- D-02：fresh clone 无 local head 时，仅用 merged PR/MR 的提交列表唯一绑定 `baseline.commit`；零/多候选或 API 失败保持 pending。
- D-03：Windows 上真实调用 `mvn.cmd`、`gradle.bat` 与 pytest；junit CASE 适配器和辅助脚本不依赖 `/bin/sh`。
- D-04：有 Git HEAD 的 init 在创建任何本地产物前完成远端活性和认证预检；不可达即失败且无半成品。

### 异常与边界

- 无 token、API 失败、候选不唯一或提交列表不可读时不得假报 merged；`--skip-init-gate` 仍是唯一显式旁路。
- Windows 工具缺失以真实 runner 失败呈现，不用占位断言或适配器文件替代执行证据。
- 无 Git HEAD 的本地降级 init 不要求远端；Git 可执行校验和既有事务回滚不能弱化。
- 错误、日志与任务记录不得包含 token 或本机绝对路径。

### 验收条件

- 需求来源：`.tiller/specs/modules/workflow/windows-fresh-hygiene.md`
- AC-1: 设计确认与交付确认摘要对 LF/CRLF/孤立 CR 等价；Windows `core.autocrlf=true` 下需求确认、设计确认、合入后 primary close 与 resume 不因换行失效，实质正文变化仍使确认失效
- AC-2: fresh clone 没有 local marker、`project.json` 的 `initBaseline` 仅含 `id/branch/commit` 时，`status` 能从唯一绑定 `baseline.commit` 的已合入 PR/MR 重建 merged 证明并允许 `start`；零个或多个候选、无 token 或 API 失败时 `status` 与 `start` 都保持 pending
- AC-3: Windows 上 `tiller verify` 对 junit-maven、junit-gradle 与 pytest 调用真实工具并通过私有报告核实；junit CASE 适配器骨架包含 Windows 启动分支，辅助脚本不再依赖 `/bin/sh`
- AC-4: 有 Git HEAD 的 `init` 与 `init --apply` 在 origin 不可达（含 `example.invalid`）时于写盘前失败，不创建目标目录、本机初始化目录、分支、提交或 primary 受管文件，也不留下半成品

## 设计

### 方案

设计来源：`.tiller/specs/modules/workflow/windows-fresh-hygiene-design.md`。

- D-01：`designSubject` 先把 `\r\n?` 归一为 `\n` 再 `trim()` 和哈希；`deliverySubject` 复用同一设计摘要。需求与 AC 的既有空白归一不变，不改变确认字段。
- D-02：`project.json` 仍只记录 `id/branch/commit`。`proveInitBaselineMerged` 先判祖先与 local marker；无本机 head 时按 branch 查询 merged PR/MR，读取提交列表并只接受唯一包含 `baseline.commit` 的候选，再以其 `head.sha` 写 local marker。`status`、`start`、`doctor`、`close <init-id>` 共用。
- D-03：`TestRunCommand` 保留逻辑工具，执行经统一平台适配器；Windows Java 走 `mvn.cmd`/`gradle.bat` 与 `ComSpec`，pytest 走 `pytest.exe`，POSIX 保持原命令。`flow.ts` 的 runner/prepare/adapter 都走该启动函数，`caseSkeleton` 生成平台分支。
- D-04：`assertInitEnvironment` 在写盘前新增只读、带超时和禁交互的 `git ls-remote`；HTTPS 用不落日志的 token 认证，SSH 用批处理连接。失败映射 `INIT_PREFLIGHT_REMOTE_UNREACHABLE`，`init --apply` 复用同一入口。

### 失败处理

- fresh clone 查询无 token、API 失败、提交列表缺失或候选零/多时返回 pending，保持 local 与 tracked 元信息不变。
- Windows 工具缺失、启动失败、报告缺失或跳过均验证失败；不放宽私有报告匹配，不把 skeleton 当执行证据。
- origin 预检在目录、锁、worktree、分支和文件事务之前失败，因此不写盘；写入后的其他失败沿用初始化清理与文件事务回滚。
- 任一错误和日志对 token 脱敏，不输出本机绝对路径。

### 取舍

- 不把 PR head 回写 tracked `project.json`：同一提交不能记录自身最终 SHA，合入后回写又会引入额外提交且在网页合入的 fresh clone 中缺失。
- 不允许 branch/id/title 单独作为合入证据：同日 re-init 会产生历史 merged 记录；`baseline.commit` 在 PR/MR 提交列表中的唯一命中才可重建证明。
- 不新增跨平台 shell 依赖：Windows 只对 `.cmd`/`.bat` 使用系统解释器，POSIX 保持直接启动；参数集中引用并测试拒绝/失败边界。
- 预检不依赖平台 CLI 或自动安装；保留现有 Git/token/REST 边界，以有限超时避免挂起。

### 影响与风险

- 受影响模块：workflow 的确认摘要，initialization 的合入证明与预检，verification 的 runner/skeleton，以及测试 helper/package smoke。
- 风险最高的是 Windows 命令引用与 fresh clone 平台候选唯一性；前者需覆盖空格和 shell 元字符，后者必须保守返回 pending。
- fresh clone 首次 status/start 可能增加一次 API 查询；仅在祖先与 local marker 不足时发生。无 Git HEAD 的本地 init 不得被迫联网。
- 跟踪字段契约、AC 编号、资源版本和私有报告格式保持兼容。

### 验证入口

- 已补对应全局 CASE，并用测试名引用 CASE 编号；实现后运行全量回归与 `verify`。
- 摘要：LF/CRLF/CR subject 等价与实质变化回归；`core.autocrlf` 下确认、合入模拟、primary close/resume 端到端。
- fresh clone：平台 mock 注入同分支多个 merged 候选，仅一个提交列表含 `baseline.commit`；核对 status/start 一致，以及零/多候选、无 token、查询失败。
- Windows：平台探测/Windows CI 断言 `mvn.cmd`、`gradle.bat`、`pytest.exe`、真实退出码和适配器骨架；扫描 helper 不含 `/bin/sh`。
- origin：`example.invalid` 与关闭端口运行 `init`、`init --apply`，写入前后快照一致。
- 回归：`test/init-baseline.test.mjs`、`test/java-runners.test.mjs`、flow/verification 相关测试与 `npm run test:package`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-29T03:37:29.588Z | 883b12291038 | — |
| 设计 | ChukiChen | 2026-10-29T03:37:32.630Z | 45801a46d00a | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"c0a2047e1f59e649873840325457339ba5490e1dc8d576ae7f474eff79833631","commit":"883b12291038961f96ee887e6f181a73c872e431","by":"ChukiChen","quote":"","at":"2026-10-29T03:37:29.588Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"d42d57154cb98c7ecc15b7c30bebb1b01a4fe4f07b5297efabad7cf3efe00b69","commit":"45801a46d00ae9ae5ca3ff156f8fe2271a350b7b","by":"ChukiChen","quote":"","at":"2026-10-29T03:37:32.630Z"} -->

## 验证

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-347 LF, CRLF and isolated CR design bodies keep confirmation subjects stable$' \u002d\u002dtest-reporter=./.tiller/local/verify-SErIi1/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-SErIi1/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":0,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"ff0453c39de73592206263110e23dbf460af2a9c"} -->
- 条件：AC-1
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-347 LF, CRLF and isolated CR design bodies keep confirmation subjects stable
- 用例：CASE-347
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-6.log
- 提交：ff0453c39de7
- 时间：2026-10-29T03:39:57.447Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-348 fresh clone uniquely binds initBaseline\\.commit through merged integration commits$' \u002d\u002dtest-reporter=./.tiller/local/verify-kAesAv/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-kAesAv/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":0,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"ff0453c39de73592206263110e23dbf460af2a9c"} -->
- 条件：AC-2
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-348 fresh clone uniquely binds initBaseline.commit through merged integration commits
- 用例：CASE-348
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-7.log
- 提交：ff0453c39de7
- 时间：2026-10-29T03:40:01.905Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-349 Windows test invocation and adapter helpers avoid POSIX shell dependencies$' \u002d\u002dtest-reporter=./.tiller/local/verify-DqnXT8/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-DqnXT8/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":0,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"ff0453c39de73592206263110e23dbf460af2a9c"} -->
- 条件：AC-3
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-349 Windows test invocation and adapter helpers avoid POSIX shell dependencies
- 用例：CASE-349
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-8.log
- 提交：ff0453c39de7
- 时间：2026-10-29T03:40:08.291Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-350 unreachable origin fails init preflight before any initialization artifact$' \u002d\u002dtest-reporter=./.tiller/local/verify-s1lSRD/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-s1lSRD/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":0,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"ff0453c39de73592206263110e23dbf460af2a9c"} -->
- 条件：AC-4
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-350 unreachable origin fails init preflight before any initialization artifact
- 用例：CASE-350
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-9.log
- 提交：ff0453c39de7
- 时间：2026-10-29T03:40:11.329Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-347 LF, CRLF and isolated CR design bodies keep confirmation subjects stable$' \u002d\u002dtest-reporter=./.tiller/local/verify-eK5edy/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-eK5edy/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":1,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"b0ab1ba64794f6effa71c4085e040950eb184110"} -->
- 条件：AC-1
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-347 LF, CRLF and isolated CR design bodies keep confirmation subjects stable
- 用例：CASE-347
- 结果：failed
- 来源：executed
- 核实：已核实
- 预期：失败先行
- 基线提交：458051eeaaf41ba14661771892242b1e56ad7a8c
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-10.log
- 提交：b0ab1ba64794
- 时间：2026-10-29T03:40:47.843Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-348 fresh clone uniquely binds initBaseline\\.commit through merged integration commits$' \u002d\u002dtest-reporter=./.tiller/local/verify-lEfwYB/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-lEfwYB/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":1,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"b0ab1ba64794f6effa71c4085e040950eb184110"} -->
- 条件：AC-2
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-348 fresh clone uniquely binds initBaseline.commit through merged integration commits
- 用例：CASE-348
- 结果：failed
- 来源：executed
- 核实：已核实
- 预期：失败先行
- 基线提交：458051eeaaf41ba14661771892242b1e56ad7a8c
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-11.log
- 提交：b0ab1ba64794
- 时间：2026-10-29T03:40:52.462Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-349 Windows test invocation and adapter helpers avoid POSIX shell dependencies$' \u002d\u002dtest-reporter=./.tiller/local/verify-LvHAaB/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-LvHAaB/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":1,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"b0ab1ba64794f6effa71c4085e040950eb184110"} -->
- 条件：AC-3
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-349 Windows test invocation and adapter helpers avoid POSIX shell dependencies
- 用例：CASE-349
- 结果：failed
- 来源：executed
- 核实：已核实
- 预期：失败先行
- 基线提交：458051eeaaf41ba14661771892242b1e56ad7a8c
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-12.log
- 提交：b0ab1ba64794
- 时间：2026-10-29T03:40:56.451Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-350 unreachable origin fails init preflight before any initialization artifact$' \u002d\u002dtest-reporter=./.tiller/local/verify-9ULuPV/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-9ULuPV/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":1,"tree":"d3b25e9118d58bc0d45d81cf20b634bf75d1703e2139eea0ae888c5e545c6af2","commit":"b0ab1ba64794f6effa71c4085e040950eb184110"} -->
- 条件：AC-4
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-350 unreachable origin fails init preflight before any initialization artifact
- 用例：CASE-350
- 结果：failed
- 来源：executed
- 核实：已核实
- 预期：失败先行
- 基线提交：458051eeaaf41ba14661771892242b1e56ad7a8c
- 日志：.tiller/local/20261029-windows-fresh-hygiene/logs/run-13.log
- 提交：b0ab1ba64794
- 时间：2026-10-29T03:40:59.674Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 缺陷修复包含基线失败与当前通过证据
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 166 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 143 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 66 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例；建议同时回归经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 51 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 171 条用例；建议同时回归经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
