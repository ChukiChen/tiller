# 精简 task.md 验证段

<!-- tiller-task:v1 {"version":1,"id":"20261024-slim-verify-render","type":"feature","size":"standard","created":"2026-10-24T06:19:15.188Z","base":"0c48fb82158f353ea523769c40f7d049f8648d6a","scope":["src","test","resources",".tiller","AGENTS.md","README.md"],"format":"structured","plan":"20261024-slim-verify-render","item":"P-1","slug":"slim-verify-render","summary":"精简 verify 写入 task.md 的验证段","requirementFile":".tiller/local/20261024-slim-verify-render-req.md"} -->

## 需求

### 面向谁与问题

用 tiller 跟进任务的人（维护者与采用者）。现状：`verify` 写入 `task.md`「## 验证」时，每条 run 展开完整命令行（含临时 `--test-reporter` 路径）、退出码、64 位代码树摘要等机器字段；关单后 `.tiller/local/logs/<id>/` 已删，正文仍噪声大、难扫读。用户已确认：验证段改为人读摘要，完整命令与输出只留在日志。

### 目标

需求来源：`.tiller/local/20261024-slim-verify-render-req.md`

新写入（及因任务改写而重渲染）的验证记录在 task.md 中只保留人读摘要；完整命令、原始输出仍写入 `.tiller/local/logs/<id>/run-*.log`。旧版冗长验证块继续可解析。check/accept 对「已核实」等判定不因渲染变瘦而变松。

### 业务范围

- 做：调整 `renderVerifications`（及必要的 parse）；为 check/accept 保留命令/退出码/代码树等内部证据的机器可读旁路；同步 usage、rules、workflow specs/cases；更新断言冗长正文的测试；用例自 CASE-201。
- 不做：不压缩「## 确认」；不收起「## 自检」提示；不批量改写已关闭历史任务正文；不改版本号；不改变 verify 执行与私有报告核实逻辑本身。
- 假设与待确认：日志仍含完整显示命令、起止与退出码；PR 草稿若需命令可从解析后的结构化字段读取，不依赖人读子弹里的长命令行。

### 关键行为

1. 新一次 `verify` 成功写入后，task.md 对应 run 可见：条件、用例、测试名、结果、核实、日志相对路径；提交可以是短 SHA；来源/时间等短字段可保留。
2. 同条 run 的人读正文中看不到完整 node/mvn/gradle 命令行、临时 reporter 路径、代码树摘要长 hex。
3. 打开仅含旧版「命令 / 退出码 / 代码树摘要」子弹的历史 task.md 时，仍能解析出验证记录且 check 行为与现网一致。
4. 对已核实的通过记录，check/accept 不因瘦身误报未核实或放宽证据要求。

### 异常与边界

- 旧任务只有冗长子弹、无机器旁路：解析走旧路径。
- 新记录缺日志路径：仍按现有规则（可写可不写以外的证据字段为准），不把「无长命令子弹」当成未核实。
- reported 外部报告：理由等人读字段保留；其 command 亦不以冗长子弹进 task.md（进旁路/日志）。
- 重写 task.md（如再次 verify/confirm 触发 render）时，已解析的旧 run 按新格式写出（本轮不要求回写已关闭任务文件）。

### 验收条件

- AC-1: 新写入的验证记录在 task.md 中不含完整命令行与临时 reporter 路径；含条件、用例、测试名、结果、核实与日志相对路径（提交可用短 SHA）
- AC-2: check/accept 对已核实验证的判定不因渲染变瘦而变松；内部仍可使用命令、退出码、代码树摘要等证据（可放在 task.md 的机器可读旁路或日志，不以冗长子弹展示）
- AC-3: 仍能解析旧版冗长验证块；usage/rules/cases 与相关测试断言同步说明新渲染；用例自 CASE-201 起

## 规划

- 规划：20261024-slim-verify-render
- 条目：P-1

## 设计

### 方案

1. **人读渲染**：`renderVerifications` 每条 run 只输出短子弹：条件、测试、用例、结果、来源、核实、（可选）理由/失败先行/基线、日志、提交（短 SHA，建议 12 位）、时间。不输出：命令、退出码、代码树摘要。
2. **机器旁路**：在每条 `### run-N` 下增加一行 HTML 注释，例如 `<!-- tiller-verify:v1 {...} -->`，JSON 至少含 `command`、`exitCode`、`tree`、`commit`（全量 oid），以便 parse 后 check/accept/pr 仍读到与今日相同的 `FlowVerification` 字段。
3. **解析**：`parseVerifications` 优先读旁路注释；若无注释则走现有冗长子弹字段（旧格式兼容）。`command` 等对旧格式仍必填；新格式可从旁路补齐。缺旁路且无命令的残缺块跳过（与今日「字段不全则忽略」一致）。
4. **日志**：`verify` 写 log 的行为保持；完整命令继续进 log，不依赖 task.md 人读段。
5. **文档与用例**：更新 usage、相关 rules（如「验证记录…命令…代码树摘要」表述改为「人读摘要 + 日志/旁路」）、workflow specs/cases；自 **CASE-201** 起覆盖：新写入无长命令/reporter/树摘要、有摘要字段与日志路径、旧块可解析、check 对已核实不放宽。同步 `resources/` 与 `.tiller` 受管副本。版本保持 0.5.0。

### 失败处理

- 旁路 JSON 损坏：该 run 若无旧字段可读则跳过解析（不半解析成「已核实」）；不因此崩溃整个 task。
- 短 SHA 仅用于展示；校验与过期比较仍用旁路/旧字段中的全量 commit 与 tree。

### 取舍

- 采用 task.md 内 HTML 注释旁路，而不是单独 sidecar 文件：关单清日志后验证证据仍随任务记录提交；避免 check 依赖已删日志。
- 不把长命令留在子弹再「折叠」：用户明确要去掉噪声。
- 本轮不回写已关闭任务；仅保证读旧写新。

### 影响与风险

- 影响：`src/flow.ts`（render/parse）、可能 `pr.ts` 若从正文刮命令、usage/rules/specs/cases、`test/verification-integrity.test.mjs`、`test/flow-cli.test.mjs`、`test/rules.test.mjs` 等断言冗长正文的测试。
- 风险：漏改断言导致 CI 红；旁路与人读不一致。
- 缓解：用例覆盖新渲染与旧解析；全量 `npm test`；抽查 parse→render 往返后 check 仍认已核实。

### 验证入口

- 自动化：`case add` 自 CASE-201；针对性测试后全量 `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`。
- 手工：对临时任务跑一次 verify，打开 task.md 确认无长命令/reporter/树摘要，且 check 通过。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 用户原话：可以
- 原话用途：可选附注，不替代已写明的正文
- 提交：0c48fb82158f353ea523769c40f7d049f8648d6a
- 对象摘要：08631b643f1eb56c0e65cfddf8ad405465e33c2c62ebcb12ad999848ff3a7f74
- 时间：2026-10-24T06:19:43.320Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 用户原话：可以
- 原话用途：可选附注，不替代已写明的正文
- 提交：0c48fb82158f353ea523769c40f7d049f8648d6a
- 对象摘要：5f7f5186794f7f728f2397756a72d269b2ecdf3055b4abafeb51d0472075c204
- 时间：2026-10-24T06:19:43.412Z

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
