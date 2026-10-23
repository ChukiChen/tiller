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

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
