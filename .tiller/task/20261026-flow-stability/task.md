# 流程稳定性：基线自愈、合入删分支、用例去源码

<!-- tiller-task:v1 {"version":1,"id":"20261026-flow-stability","type":"feature","size":"standard","created":"2026-10-26T10:55:41.061Z","base":"adae0747a0eebdaa63fcfb5b59880ff642df1c4d","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","slug":"flow-stability","summary":"基线API放行与合入清分支用例去源码","requirementFile":".tiller/local/20261026-flow-stability-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 的人与执行 AI。网页/squash 合入初始化后，`start` 仍常因 `initBaseline.commit` 不是当前 HEAD 祖先而阻断；`merge`/`close` 后 feat 与 init 分支残留；用例强制「源码」/`--source` 与 cases-first（实现前登记）冲突；需求「业务范围·做」常被写成交付文件路径却无提示。需要在 tiller 流程与机制内收口。

### 目标

本波落地四项机制（确认原话软约束不做）：
1. init 基线：网页/squash 合入后，通过平台 API 探测 init PR/MR 已合入则自动放行 `start`（并更新 merged），不只靠 close/merge 标记或祖先判定。
2. 合入/close 后默认删除本地与远端 feat（及 init）分支；`--keep-branch` 可保留。
3. 用例彻底去除「源码」字段与 CLI `--source`（不是改成可选）；由测试关联 CASE；迁移模板与既有用例。
4. `check` 对「业务范围·做」中的交付路径给出 warning。

版本保持 0.5.0。

需求来源：`.tiller/local/20261026-flow-stability-req.md`

### 业务范围

- 做：
  - start/init 基线：pending 且祖先失败时 API 查 init 分支 PR/MR；已合入则 mark merged 并放行；缺 token/API 失败保持中文错误与 `--skip-init-gate`
  - merge/close（含 init-id）默认删本地+远端任务/init 分支；`--keep-branch` 保留；删失败只 warning
  - 从 cases 模型/CLI/模板/文档/既有用例中移除「源码」与 `--source`；关联仅测试↔CASE
  - check 对「做」中交付路径启发式 warning（不阻断）
  - 用例+测试+文档/decisions；全量门禁
- 不做：确认软约束；升版本；token 加密存储；CloudAgent；将「做」路径检查升级为硬失败
- 假设与待确认：平台 github/gitlab；既有 token 环境变量；删远端优先 platform-api

### 关键行为

1. 网页 squash 合入 init 后，即使旧 baseline commit 非祖先，有 token 且 API 确认 PR/MR merged 时 `start` 放行。
2. `tiller merge` / `tiller close` 成功路径默认删本地+远端对应分支；`--keep-branch` 保留。
3. `tiller case add` 无 `--source`；新用例无「源码」行；旧用例不要求源码字段。
4. `check` 对「做」中的交付路径给出可定位 warning。

### 异常与边界

- API 不可达/无 token：不静默放行；可 `--skip-init-gate`
- 分支已不存在：成功或 warning，不失败整次 merge/close
- 当前检出为待删分支：先切安全分支或跳过本地并 warning
- 历史「源码」行：迁移删除；解析不得再要求源码必填

### 验收条件

- AC-1: 网页/squash合入后API探测init PR/MR已合入则自动放行start并更新merged
- AC-2: merge/close默认删本地与远端feat/init分支，支持--keep-branch
- AC-3: 用例与CLI完全去除源码与--source，模板与既有cases迁移，测试用CASE关联
- AC-4: check对业务范围做中的交付路径warning；文档一致；0.5.0；全量门禁通过

## 设计

### 方案

1. **Init 基线 API 自愈放行（AC-1）**
   - 扩展 `assertInitBaselineReady`：在 `status!==merged` 且 `merge-base --is-ancestor` 失败时，不立刻失败；调用 platform-api 解析 remote + token，按基线 `branch`（`chore/tiller-init`）查询对应 GitHub PR / GitLab MR。
   - 若平台状态为已合入（GitHub `merged==true` / state=closed+merged_at；GitLab `state==merged`），则调用既有 `markInitBaselineMerged` 写回 `project.json`，然后放行 `start`。
   - 祖先判定成功时保持兼容（无需联网）。
   - 无 token、远程解析失败、API 错误或未找到已合入 PR/MR：维持 `INIT_BASELINE_PENDING`（或更具体错误码）与中文 next；`--skip-init-gate` 不变。
   - 新增可测的 `findMergedInitIntegration`（或等价）纯函数/注入 fetch，供单测 mock。

2. **合入/close 默认删分支（AC-2）**
   - `merge` 与 `close`（含 init-id）成功清理路径默认删除：本地分支 + 远端同名分支（任务 `feat/...`，init `chore/tiller-init`）。
   - CLI：`merge`/`close` 增加 `--keep-branch`；为 true 时跳过删除。
   - 删除实现：本地 `git branch -D`（若当前不在该分支；若在则先切 default/main/master 或跳过并 warning）；远端优先 platform-api 删 ref（GitHub DELETE `/git/refs/heads/...`，GitLab 等价），否则 tokenized `git push origin --delete`。
   - 分支已不存在 / 权限不足：记 `warnings`，不让整次 merge/close 失败，不回滚已合入或已清 local。

3. **用例去除源码字段（AC-3）——整段删除，不是可选**
   - 从 `CaseEvidence`/`case add` 输入、MD 模板渲染、parser、校验、CLI help/`--source` 选项、resources/usage、rules/verification、cases/index 文案中 **彻底移除**「源码」与 `--source`。
   - 迁移全部 `.tiller/cases/**`：删除 `- 源码：...` 行；解析遇到遗留「源码」行应忽略且不报必填错误（过渡），新写入不再生成该行。
   - `case add` 不再接受 `--source`（传入应报未知选项或明确拒绝）；关联只靠测试名/紧邻注释中的 `CASE-NNN`。
   - 更新所有依赖 `source:` 的测试夹具。

4. **业务范围「做」路径 warning（AC-4 便宜项）**
   - 在 `check` 读取任务需求「业务范围」中「做」列表；条目匹配交付路径启发式（如 `src/`、`test/`、`resources/`、`.tiller/` 前缀，或扩展名 `.ts/.mjs/.js/.md` 且含 `/`）时追加 warning，默认不阻断。

5. **文档与门禁**
   - usage、delivery/core、decisions、必要时 workflow/verification specs；同步受管镜像与 digest。
   - 版本保持 0.5.0；全量 `build/lint/typecheck/test/test:package`。

### 失败处理

- Init API 探测失败：不静默放行；可 `--skip-init-gate`。
- 删分支失败：warnings only。
- 用例迁移遗漏「源码」行：解析忽略；`case add` 不再写出。
- check 路径启发式误报：仅 warning，可后续收紧。

### 取舍

- **API 探测优先于仅 close 标记**：覆盖网页 squash（commit 重写导致祖先失败）。
- **删分支默认开、`--keep-branch` 退出**：减少残留；需保留时显式声明。
- **源码字段删除而非可选**：与 cases-first 一致，避免实现前登记仍填路径。
- **「做」路径仅 warning**：本波不硬失败，降低误伤。

### 影响与风险

- 影响：`src/init-baseline.ts`、`src/platform-api.ts`、`src/pr.ts`、`src/flow.ts`、`src/cases.ts`、`src/cli.ts`、相关 test、resources、`.tiller/cases` 全量迁移。
- 风险：存量用例迁移面大——用脚本/批量删行并跑库解析；删分支误删需限制为任务/init 已知分支名。
- 安全：不日志输出 token；删远端需已有 token 权限。

### 验证入口

- 定向：`node --test test/init-baseline.test.mjs test/merge.test.mjs test/cases*.mjs test/flow*.mjs`（按实际文件名）
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-26T10:56:33.664Z | adae0747a0ee | 按选项确认：API探测合入后放行；默认删分支与keep-branch；彻底去掉用例源码字段；check对做路径warning |
| 设计 | ChukiChen | 2026-10-26T10:56:33.762Z | adae0747a0ee | 同意设计：API自愈、默认删分支、去除源码字段、做路径仅warning |
| 交付验收 | ChukiChen | 2026-10-26T11:37:55.225Z | e6a01d98c7f9 | 开启PR |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"28e4c4c3f6227552d800e6cabb8ee19dda876932b1967533b5139b67049fced7","commit":"adae0747a0eebdaa63fcfb5b59880ff642df1c4d","by":"ChukiChen","quote":"按选项确认：API探测合入后放行；默认删分支与keep-branch；彻底去掉用例源码字段；check对做路径warning","at":"2026-10-26T10:56:33.664Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"6cb7cf48b6e0cb2263029a9af54e8e528fea6885ffef38595dfab6bad48fc6bd","commit":"adae0747a0eebdaa63fcfb5b59880ff642df1c4d","by":"ChukiChen","quote":"同意设计：API自愈、默认删分支、去除源码字段、做路径仅warning","at":"2026-10-26T10:56:33.762Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"ced9e54c6f170a10a82a1666e26c8120aacded1433bfa4d3c859f7ff6db833b0","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae","by":"ChukiChen","quote":"开启PR","at":"2026-10-26T11:37:55.225Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-253 init baseline merged through the platform API unlocks start and records merged$' \u002d\u002dtest-reporter=./.tiller/local/verify-RbWqXo/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-RbWqXo/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-253 init baseline merged through the platform API unlocks start and records merged
- 用例：CASE-253
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-1.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:27.260Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-254 missing token or platform API failure keeps the init gate closed$' \u002d\u002dtest-reporter=./.tiller/local/verify-SDIC1g/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-SDIC1g/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-254 missing token or platform API failure keeps the init gate closed
- 用例：CASE-254
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-2.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:29.639Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-255 merge deletes the feat branch locally and remotely by default$' \u002d\u002dtest-reporter=./.tiller/local/verify-DKzRpz/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-DKzRpz/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-255 merge deletes the feat branch locally and remotely by default
- 用例：CASE-255
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-3.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:31.381Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-256 close init-id deletes the initialization branch locally and remotely by default$' \u002d\u002dtest-reporter=./.tiller/local/verify-I0C6kM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-I0C6kM/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-256 close init-id deletes the initialization branch locally and remotely by default
- 用例：CASE-256
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-4.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:35.697Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-257 merge and close keep branches when \u002d\u002dkeep-branch is explicit$' \u002d\u002dtest-reporter=./.tiller/local/verify-gYUJgZ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-gYUJgZ/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-257 merge and close keep branches when --keep-branch is explicit
- 用例：CASE-257
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-5.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:37.417Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-258 case add writes no source field and rejects the removed \u002d\u002dsource option$' \u002d\u002dtest-reporter=./.tiller/local/verify-KGZfEM/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-KGZfEM/report.jsonl test/case-redesign.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-3
- 测试：test/case-redesign.test.mjs::CASE-258 case add writes no source field and rejects the removed --source option
- 用例：CASE-258
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-6.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:40.936Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-259 historical cases parse without a source field and ignore residual source lines$' \u002d\u002dtest-reporter=./.tiller/local/verify-ec91Y9/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ec91Y9/report.jsonl test/case-redesign.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-3
- 测试：test/case-redesign.test.mjs::CASE-259 historical cases parse without a source field and ignore residual source lines
- 用例：CASE-259
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-7.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:42.243Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-260 check warns about delivery paths inside the business scope do list$' \u002d\u002dtest-reporter=./.tiller/local/verify-ioHgHg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ioHgHg/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-4
- 测试：test/flow-hardening.test.mjs::CASE-260 check warns about delivery paths inside the business scope do list
- 用例：CASE-260
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-8.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:42.876Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-261 help and managed docs describe API baseline, branch cleanup, no source field and scope path warnings$' \u002d\u002dtest-reporter=./.tiller/local/verify-Vwmkpg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Vwmkpg/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-261 help and managed docs describe API baseline, branch cleanup, no source field and scope path warnings
- 用例：CASE-261
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-9.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:44.251Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-262 branch deletion failure is reported as a warning without failing merge cleanup$' \u002d\u002dtest-reporter=./.tiller/local/verify-QSsrFy/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-QSsrFy/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"db31a7b7a34881ac3921eac9f708956016f949d724c0a1d8cab5861ecb8ee137","commit":"e6a01d98c7f90bc4bb9bfdde6509087544e993ae"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-262 branch deletion failure is reported as a warning without failing merge cleanup
- 用例：CASE-262
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-flow-stability/logs/run-10.log
- 提交：e6a01d98c7f9
- 时间：2026-10-26T11:37:44.872Z

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
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 32 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 42 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 119 条用例及经过它的场景 CASE-055, CASE-001。
