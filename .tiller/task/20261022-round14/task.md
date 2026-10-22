# 验证防伪与任务范围约束

<!-- tiller-task:v1 {"version":1,"id":"20261022-round14","type":"feature","size":"standard","created":"2026-10-22T11:32:06.862Z","base":"2e5889e42bff6cd31aa88afa352ef8b5d47f9c76","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".gitlab",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{},"format":"structured","slug":"verify-anti-forgery","summary":"强化验证防伪与任务范围约束"} -->

## 需求

### 目标

堵住验证记录可被伪造或未经实际执行即通过的缺口：验证命令即记录即执行，未执行的验证默认阻断，核实具名测试确实执行并通过，缺陷修复任务要求失败先行，标准任务必须声明交付范围；已验收的历史任务记录保持有效。

### 范围

- 做：`verify` 记录即执行、外部报告验证的显式放行与标注、node:test 具名测试结果核实、缺陷修复任务的失败先行证据、standard 任务必须声明 `--target`；`check`、`accept`、`pr` 的相应检查与输出；历史任务记录的兼容；相关规则、usage、README、规格、用例与测试。
- 不做：除 node:test 以外测试框架的输出解析实现（仅预留扩展点）、调用外部 CI、改写已有任务记录或提交历史、版本号变更。
- 涉及模块：workflow（verify、check、accept、pr、start）、standards（规则、usage 与必读预算）。

### 验收条件

- AC-1: verify 不再允许记录的命令与实际执行的命令不一致：记录与执行合并为同一参数，删除分别提供记录命令与执行命令的旧用法，历史任务记录仍可读取
- AC-2: 未实际执行的验证（外部报告）在 check 中默认阻断，仅在显式参数放行且记录带有理由时通过，并在 PR/MR 草稿的验证结果中标明为未执行
- AC-3: 核实具名测试确实执行并通过：解析 node:test 的 TAP 或 spec 输出，确认记录的测试名出现且结果为通过；无法解析或未找到时记为未核实并在 check 中阻断，并说明其它测试框架的扩展点
- AC-4: 缺陷修复任务要求失败先行：至少一条验证记录证明该测试在任务基线（修复前）失败、在修复后通过，check 在缺少该证据时阻断
- AC-5: standard 任务必须声明交付范围（--target），不再默认整个仓库；small 任务的处理在设计中说明取舍
- AC-6: 规则、usage、规格与用例同步更新，必读资料不超过约 7000 字符，版本保持 0.5.0；已有任务记录不因新规则产生新的 check 阻断

## 设计

### 方案

- 记录即执行：`verify` 只接受 `--run "<命令>"`，记录的命令即实际执行的命令，删除 `--command` 与 `--run` 分别提供的旧用法；结果由退出码与测试核实共同决定，不再接受与执行结果不一致的 `--result`。历史记录中的 `命令` 字段照常读取。
- 外部报告：确需记录未执行的验证时使用 `verify --reported --command "<命令>" --result <结果> --reason "<理由>"`，理由必填并写入记录；`check` 与 `accept` 默认阻断此类记录，仅在显式 `--allow-reported` 时放行；`pr` 草稿在该记录下标明“未执行（外部报告）：<理由>”。
- 测试核实：`--run` 执行时捕获输出，按测试引用 `文件::测试名` 解析 node:test 的 TAP（`ok N - 名称` / `not ok`）与 spec（`✔` / `✖`）输出，测试名出现且为通过才记为已核实；仅引用文件时要求输出中有该文件的测试且失败数为 0。无法解析或未找到测试名时记为“未核实”，`check` 阻断。解析器按框架注册，留出其它框架的扩展接口并在文档中说明。
- 失败先行：bugfix 任务提供 `verify --expect-fail --run "<命令>"`，在任务基线提交的临时 Git 工作树中运行（覆盖当前版本的被引用测试文件，复用现有依赖目录），要求命令失败且具名测试结果为失败，记录基线提交；`check` 要求每个 bugfix 任务至少有一条失败先行记录，且同一测试在当前提交上有已核实的通过记录，缺失即阻断。临时工作树用后删除。
- 交付范围：standard 任务的 `start` 必须提供至少一个 `--target`，缺失即报错；small 任务保持缺省 `.`。
- 历史记录兼容：新检查只作用于尚未验收的任务；已有交付验收确认的任务视为历史记录，`check` 不对其施加新检查；`reopen` 撤销验收后按新规则检查。仓库现有 `.tiller/task/` 下任务的 `check` 结果不得因本轮新规则变差：目前多数历史任务已因后续代码变化而报告“验证已过期”，个别早期任务缺少确认，这些属于现有行为，不在本轮修改。

### 取舍

- 选择单一 `--run` 参数而非比较两个参数：从根本上消除记录与执行不一致，参数更少；外部报告作为显式例外保留，满足无法在本机执行的场景，但必须写明理由并显式放行。
- 失败先行采用基线临时工作树运行，而非信任修复前手动记录：证据可复现且不依赖操作时机；代价是需要 Git 工作树与依赖目录复用，失败时给出明确错误。
- small 任务保留缺省 `.`：small 任务改动小、确认环节少，强制声明范围会增加轻量流程的负担；standard 任务影响面大，必须明确范围以支撑范围检查。
- 历史兼容按“是否已验收”而非任务格式版本区分：无需改写既有记录，也使本任务在验收前即受新规则约束。

### 影响与风险

- 受影响：`verify` 参数与记录字段（来源、核实状态、理由、基线提交）、`check`/`accept` 的阻断规则与 `--allow-reported`、`pr` 验证结果输出、`start` 对 standard 任务的参数校验、使用旧 `--command` 用法的脚本和文档。
- 需回归：workflow 的 verify、check、accept、pr、start、reopen 用例，standards 的必读预算与文档一致性用例，现有已验收任务的 `check`。
- 风险：测试名含特殊字符或输出格式差异导致误判未核实，需要覆盖嵌套子测试与转义；临时工作树在异常退出时需清理；旧用法删除后需在报错中提示新用法。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：2e5889e42bff6cd31aa88afa352ef8b5d47f9c76
- 对象摘要：7dba3eb914b6083f0e5d92d4c7cdebe836ef4bcfc43d4b4f43cfaab97c6a0743
- 时间：2026-10-22T11:32:51.832Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：2e5889e42bff6cd31aa88afa352ef8b5d47f9c76
- 对象摘要：3aefe16101f86690aa4bb4ef6d7a9722929bf9617a8b9408d073d688a5c17fd8
- 时间：2026-10-22T11:32:51.903Z

## 验证

尚无验证。

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- AC-1 尚无验证。
- AC-2 尚无验证。
- AC-3 尚无验证。
- AC-4 尚无验证。
- AC-5 尚无验证。
- AC-6 尚无验证。
- 交付范围存在未提交改动：.tiller/cases/index.md、.tiller/cases/modules/standards/behavior.json、.tiller/cases/modules/verification/interface.json、.tiller/cases/modules/workflow/behavior.json、.tiller/cases/modules/workflow/interface.json、.tiller/cases/modules/workflow/security.json、.tiller/context/project.md、.tiller/index.md、.tiller/project.json、.tiller/rules/activities/delivery.md、.tiller/rules/core.md、.tiller/rules/quality/verification.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/standards/requirements.md、.tiller/specs/modules/verification/design.md、.tiller/specs/modules/verification/requirements.md、.tiller/specs/modules/workflow/design.md、.tiller/specs/modules/workflow/requirements.md、.tiller/specs/requirements.md、.tiller/usage.md、AGENTS.md、README.md、resources/entry.md、resources/rules/activities/delivery.md、resources/rules/core.md、resources/rules/quality/verification.md、resources/usage.md、scripts/package-smoke.mjs、src/cases.ts、src/cli.ts、src/flow.ts、src/pr.ts、src/test-output.ts、test/first-batch.test.mjs、test/flow-cli.test.mjs、test/pr.test.mjs、test/rules.test.mjs、test/suites.json、test/verification-integrity.test.mjs

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。
- 本次改动涉及模块 initialization：建议回归该模块 18 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 7 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
