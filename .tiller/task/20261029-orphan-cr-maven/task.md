# 修复孤立 CR 解析与 Windows Maven verify 启动

<!-- tiller-task:v1 {"version":1,"id":"20261029-orphan-cr-maven","type":"bugfix","size":"standard","created":"2026-10-29T05:06:35.060Z","base":"0b4d56ae1e63edd8ed4407e93ba758c285857fc6","scope":[".tiller/specs/modules/workflow",".tiller/cases/modules/workflow","src/flow.ts","src/test-output.ts","test/windows-fresh-hygiene.test.mjs","test/java-runners.test.mjs"],"format":"structured","slug":"orphan-cr-maven","summary":"补齐孤立 CR 任务记录解析，并修正 Windows junit-maven 命令封装"} -->

## 需求

### 使用场景

- Windows 编辑器、旧工具或跨平台同步可能在任务记录中留下孤立 CR；开发者执行 `resume` 或推进交付时，不应丢失已经写入的确认与验收事实。
- Windows Java 工程配置 `junit-maven` 时，开发者需要由 `tiller verify` 直接启动真实 Maven，并以私有 Surefire 报告核实测试结果。
- 本任务承接 #56 的 NEW-01/NEW-02 残留，只完成需求、设计与 ChukiChen 确认，不实现、不提交 PR。

### 目标

需求来源：`.tiller/specs/modules/workflow/windows-residual-hardening.md`

- 统一任务记录逻辑行解析，使 LF、CRLF 与孤立 CR 下的阶段、确认、验收点与验证事实等价，且不静默改写正文。
- 修正 Windows `.cmd` 启动封装，使 `junit-maven` 能传递私有报告与精确选择器、启动真实 `mvn.cmd` 并核实结果。
- 设计见 `.tiller/specs/modules/workflow/windows-residual-hardening-design.md`，验收以本任务引用的 specs AC 为准。

### 业务范围

- 做：记录解析统一、Windows 命令脚本启动修正、对应 specs/CASE/回归测试；保持既有确认摘要、验证报告和退出码语义。
- 不做：修复 Gradle NEW-03、自动安装工具、改变确认字段或摘要算法、在读取时归一写回正文、引入 POSIX shell 或第三方 shell 依赖。
- 假设与待确认：孤立 CR 可由同一已验收任务的换行变体复现；Windows 或等价 CI 可验证 `cmd.exe` 与真实 Maven。

### 关键行为

- AC-1：task.md 正文与确认/验证 sidecar 的行解析统一识别 LF、CRLF 与孤立 CR；resume 保留验收点、阶段、确认与验证事实，需求/设计/交付 subject 在三种 EOL 间等价，实质内容变化仍使对应确认或验收失效，且不静默改写用户正文
- AC-2：Windows 上 tiller verify 对 junit-maven 通过正确的命令解释器封装启动真实 mvn.cmd，传递 surefire 私有报告目录与精确测试选择器，正确传播退出码并核实报告；命令封装契约有可重复回归测试，且不以 gradle 跑通作为本任务验收

### 异常与边界

- 只有换行不同的同一正文可等价；其他字符、范围、AC、验证事实或提交变化仍使对应确认/验收失效。
- 损坏 sidecar、无效记录和无法安全表达的 Windows 参数继续明确失败，不放宽格式校验或伪造报告。
- Maven、JDK、`cmd.exe` 缺失、超时和非零退出均保留真实失败；Gradle 跑通不属于本任务 AC。

### 验收条件

- AC-1: task.md 正文与确认/验证 sidecar 的行解析统一识别 LF、CRLF 与孤立 CR；resume 保留验收点、阶段、确认与验证事实，需求/设计/交付 subject 在三种 EOL 间等价，实质内容变化仍使对应确认或验收失效，且不静默改写用户正文
- AC-2: Windows 上 tiller verify 对 junit-maven 通过正确的命令解释器封装启动真实 mvn.cmd，传递 surefire 私有报告目录与精确测试选择器，正确传播退出码并核实报告；命令封装契约有可重复回归测试，且不以 gradle 跑通作为本任务验收

## 设计

### 方案

- 在 `src/flow.ts` 增加统一 Markdown 逻辑行切分并替换任务记录解析中的 `split(/\r?\n/u)`，保持现有归一、subject/hash 与写回算法不变。
- 在 `src/test-output.ts` 修正 `.cmd/.bat` 的命令解释器封装：argv 引用与 `cmd.exe /d /s /c` 外层引用分层构造，继续经 `runProcess` 捕获退出码与输出。
- 记录解析测试覆盖原文、CRLF、孤立 CR 的任务阶段与 sidecar；Windows 测试覆盖 invocation 契约、临时 `.cmd` argv 与真实 Maven 私有报告。
- 设计详情见 `.tiller/specs/modules/workflow/windows-residual-hardening-design.md`。

### 失败处理

- 损坏记录、缺失章节、无效 sidecar 和摘要变化继续按现有规则失败或回退，不以兼容换行掩盖数据损坏。
- Windows 参数在 spawn 前不安全时返回 `VERIFY_COMMAND_UNSUPPORTED`；工具缺失、超时、非零退出和报告不可核实均保持失败，不生成通过记录。
- 同一 AC/CASE 连续两次失败且无成功核实时停止自动重试并报告证据与方案。

### 取舍

- 选择解析层兼容而非落盘归一：避免 `resume` 隐式改写用户正文，代价是所有记录行解析必须集中复用。
- 选择集中修正现有平台适配器而非引入 shell 依赖：保持可测试性与现有进程语义，不扩大命令注入面。
- 契约测试可在普通 CI 防漂移，但真实 Windows `cmd.exe`/Maven 证据仍是 AC-2 的必要集成层。

### 影响与风险

- 读取路径覆盖确认、验证、关闭、评审与记录安全；只改逻辑行入口，避免全局替换正文。
- LF/CRLF 历史记录与确认算法不变；孤立 CR 记录应恢复既有事实，不要求迁移。
- Windows 引用边界是最高风险点，重点覆盖空格、`&`、`$`、报告目录和 `Class#method`，不安全输入明确拒绝。
- `.cmd/.bat` 适配器可能被其它工具共享；实现不得主动破坏，但 Gradle 跑通另案验收。

### 验证入口

- 记录解析：Windows hygiene 回归中的三 EOL `resume`/subject 与 sidecar 用例。
- Windows：invocation 契约、临时 `.cmd` argv fixture，以及真实 `tiller verify --criterion AC-2 --case <Maven CASE>`。
- 回归：`test/windows-fresh-hygiene.test.mjs`、`test/java-runners.test.mjs`、`test/flow-cli.test.mjs` 与 package smoke；Gradle 结果单独报告。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-29T05:08:16.142Z | 0b4d56ae1e63 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"444facbb3e0a93e46241c49d6a4715f74e0dba305a79560556012ba422605820","commit":"0b4d56ae1e63edd8ed4407e93ba758c285857fc6","by":"ChukiChen","quote":"","at":"2026-10-29T05:08:16.142Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
