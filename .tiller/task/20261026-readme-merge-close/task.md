# README 面向用户改写与 merge 后自动 close

<!-- tiller-task:v1 {"version":1,"id":"20261026-readme-merge-close","type":"feature","size":"standard","created":"2026-10-26T06:01:17.375Z","base":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f","scope":["README.md","src/cli.ts","src/flow.ts","src/pr.ts","src/init-baseline.ts","test","resources",".tiller/cases",".tiller/project.json",".tiller/rules",".tiller/usage.md"],"format":"structured","requirementFile":".tiller/local/20261026-readme-merge-close-req.md"} -->

## 需求

### 面向谁与问题

最终使用 tiller 的人。现状：仓库 README 混入决策过程、维护者资料与「尚未发布到 npm」等干扰信息；合入业务或初始化 PR 后本机任务目录不会自动清理，需另跑 `close`。用户要求 README 只写介绍与快速开始，并增加 CLI 合入命令：合入 API 成功返回后立刻自动 close；网页手点合入仍需手动 close。

### 目标

根 README 改为面向最终用户的介绍 + 快速开始；新增 `tiller merge <task-id>`，按平台调用 `gh pr merge` / `glab mr merge`（默认 squash），成功后自动执行该 id 的 close 清理；init-id 同样适用；文档写明网页合入需手动 close。版本保持 0.5.0。

需求来源：`.tiller/local/20261026-readme-merge-close-req.md`

### 业务范围

- 做：改写根 README；新增 `tiller merge`（GitHub/GitLab squash 合入 + 成功后 close）；init-id 合入后清该 local 并复用 initBaseline 合入标记；更新 usage 与必要 delivery/core；用例自 CASE-234 起与测试。
- 不做：不自动合入（必须显式 merge）；不接 webhook/CI；不改版本号；不把决策写入 README。
- 假设与待确认：本机已装并登录 gh/glab；缺工具或合入失败时明确报错。

### 关键行为

1. README 为介绍 + 快速开始（安装包安装、初始化 PR 标题、合入后更新本地分支、用 AI 开发功能），并点名 `tiller merge` 合入成功后自动 close。
2. `tiller merge <id>`：定位已开 PR/MR → squash 合入 → 成功后自动 close 清理本机；失败则不清 local。
3. 对 init-id：`merge` 合入初始化 PR 后清该 local，start 门禁按已有合入判定放行。
4. 仅网页合入：local 仍在，需 `tiller close`。

### 异常与边界

- gh/glab 缺失或未登录：失败，不 close。
- PR 不存在、已合入或 merge 被拒绝：失败，不 close。
- 业务任务未验收：与现有 close 门禁一致（merge 成功后的 close 要求已验收；未验收不可正常 close）。
- init-id：无 `--abandon`；merge/close 只清本机。

### 验收条件

- AC-1: 根 README 仅为面向最终用户的介绍与快速开始；含安装包安装、初始化 PR 标题、合入后更新本地分支、用 AI 开发功能；提及 tiller merge 合入成功后自动 close；无决策/npm 未发布/维护者资料堆砌
- AC-2: tiller merge <task-id> 对 GitHub 调用 gh pr merge（squash），成功后自动执行该 id 的 close 清理；失败不 close
- AC-3: GitLab 路径调用 glab mr merge（squash 或平台等价），成功后同样自动 close；失败不 close
- AC-4: init-id 可通过 merge 合入初始化 PR 并清理该 local；文档写明网页合入需手动 close
- AC-5: 用例自 CASE-234 起覆盖上述路径；全量 build/lint/typecheck/test/test:package 通过；版本 0.5.0

## 设计

### 方案

1. **README（AC-1）**
   - 替换根 `README.md` 为用户确认结构：介绍一段 + `## 快速开始` 下「安装 / 初始化工程 / 用 AI 开发一个功能」。
   - 安装仅 `npm install -g ./tiller-0.5.0.tgz`；初始化写明合入标题 `chore(tiller): 完成工程初始化`，合入后 `git pull`；功能段说明 AI 按约定开任务，审阅后用 `tiller merge <任务编号>` 合入并自动清理本机；网页合入则需再 `tiller close`。
   - 不同步决策进 README；若受管资源含 README 镜像则同步，否则只改根文件。

2. **`tiller merge`（AC-2/AC-3）**
   - CLI：`tiller merge <YYYYMMDD-task-id> [--path <root>]`；usage 同步。
   - 实现建议：新建 `src/merge.ts`（或扩展 `pr.ts`/`flow.ts`）读取 platform；解析任务分支/已开 PR：
     - github：`gh pr merge <branch-or-number> --squash`（在任务 worktree 或工程根执行，实现选定并测通）。
     - gitlab：`glab mr merge` 等价 squash。
   - 合入 API 成功（exit 0）后调用现有 `closeFlow(root, id, reason)`（reason 固定如「合入后自动清理」）；**不改共享 task.md**（与 post-merge-freeze 一致）。
   - 合入失败：抛错，不调用 close。
   - 业务任务：close 仍要求已验收；未验收则 merge 在 close 前失败并说明先 accept（或 merge 前置检查已验收）。

3. **init-id（AC-4）**
   - 对 `YYYYMMDD-tiller-init`：merge 定位 `chore/tiller-init` 的 PR/MR，squash 合入后走现有 init close 清理该 local；若需更新 `initBaseline.status=merged` 则在合入成功路径写入（与现有祖先判定兼容）。
   - 文档：usage + 必要 delivery/core 写明 `merge` 与「网页合入需手动 close」。

4. **测试（AC-5）**
   - CASE-234 起；mock `gh`/`glab` 成功与失败；断言失败不删 local、成功删 local；README 关键字；版本 0.5.0。

### 失败处理

- 缺 gh/glab、鉴权失败、PR 缺失/已合入/拒绝：明确错误码/文案，不 close。
- close 因未验收失败：合入已发生时须在返回中说明「远端已合入但本机清理失败，请手动 close」（实现尽量先校验可 close 再 merge，避免该窗口；若无法避免则文档+返回说明）。

### 取舍

- **显式 `merge` 命令，而非 webhook**：与「合入 API 返回后 close」一致，实现简单。
- **默认 squash**：与本仓习惯一致。
- **先校验可 close 再 merge（优先）**：减少「已合入却清不掉」；若校验成本过高可退化为合入后 close 失败时明确提示。

### 影响与风险

- 影响：`src/cli.ts`、`src/flow.ts` 或新建 merge 模块、`src/init-baseline.ts`、`src/pr.ts`、`test/*.mjs`、`README.md`、`resources/usage.md` 与受管镜像。
- 风险：网页合入与 CLI 合入行为不一致——文档必须写清。
- 安全：不自动合入；不写密钥。

### 验证入口

- 定向：新增 merge/README 相关 `node --test test/*.mjs`。
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T06:24:03.298Z | 7cd14fe242f5 | — |
| 设计 | boon yu | 2026-10-26T06:24:03.377Z | 7cd14fe242f5 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"6af362181d93dd56d6a555e694de264fecc7edeee7187ec91a7f78c98712cbef","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f","by":"boon yu","quote":"","at":"2026-10-26T06:24:03.298Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"495b181228f9f4ccad5ef758b12cb3b9b9801b005f77026d33d24007a9646c3b","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f","by":"boon yu","quote":"","at":"2026-10-26T06:24:03.377Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-234 README 面向最终用户的介绍与快速开始$' \u002d\u002dtest-reporter=./.tiller/local/verify-cH5Ndp/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-cH5Ndp/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-1
- 测试：test/merge.test.mjs::CASE-234 README 面向最终用户的介绍与快速开始
- 用例：CASE-234
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-1.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:09.880Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-235 GitHub merge 成功后自动清理本机任务$' \u002d\u002dtest-reporter=./.tiller/local/verify-d1ZlR9/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-d1ZlR9/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-235 GitHub merge 成功后自动清理本机任务
- 用例：CASE-235
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-2.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:10.348Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-236 GitHub merge 失败时保留下本机任务$' \u002d\u002dtest-reporter=./.tiller/local/verify-KgyzKn/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-KgyzKn/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-2
- 测试：test/merge.test.mjs::CASE-236 GitHub merge 失败时保留下本机任务
- 用例：CASE-236
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-3.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:12.090Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-237 GitLab merge 成功后自动清理本机任务$' \u002d\u002dtest-reporter=./.tiller/local/verify-FWIcxc/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-FWIcxc/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-237 GitLab merge 成功后自动清理本机任务
- 用例：CASE-237
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-4.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:13.764Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-238 GitLab merge 失败时保留下本机任务$' \u002d\u002dtest-reporter=./.tiller/local/verify-ibzWXa/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ibzWXa/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-3
- 测试：test/merge.test.mjs::CASE-238 GitLab merge 失败时保留下本机任务
- 用例：CASE-238
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-5.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:15.540Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-239 init-id merge 合入初始化分支并清理 local$' \u002d\u002dtest-reporter=./.tiller/local/verify-u5mocD/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-u5mocD/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-239 init-id merge 合入初始化分支并清理 local
- 用例：CASE-239
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-6.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:17.285Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-240 接入文档说明 merge 与网页合入手动 close$' \u002d\u002dtest-reporter=./.tiller/local/verify-eoYJCL/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-eoYJCL/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-4
- 测试：test/merge.test.mjs::CASE-240 接入文档说明 merge 与网页合入手动 close
- 用例：CASE-240
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-7.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:18.489Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-241 版本保持 0\\.5\\.0 且新用例均有测试引用$' \u002d\u002dtest-reporter=./.tiller/local/verify-cEaTcZ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-cEaTcZ/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"a0c88f96631d0bd4ee77ad39c453dba093574d34eaa68f4a15c820abb11be665","commit":"7cd14fe242f5b70576b59a1dfaf3f7d62427819f"} -->
- 条件：AC-5
- 测试：test/merge.test.mjs::CASE-241 版本保持 0.5.0 且新用例均有测试引用
- 用例：CASE-241
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-readme-merge-close/logs/run-8.log
- 提交：7cd14fe242f5
- 时间：2026-10-26T06:24:19.010Z

## 自检

- [x] 需求确认有效
- [ ] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [ ] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 过程卫生：需求、设计确认提交 7cd14fe242f5 后，工作区仍有未提交业务改动：resources/rules/activities/delivery.md、resources/rules/core.md、resources/usage.md、src/cli.ts、src/init-baseline.ts、src/pr.ts、test/case-redesign.test.mjs、test/flow-hardening.test.mjs 等 12 项。请先提交或移出本任务。
- 弱化测试断言：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 交付范围存在未提交改动：.tiller/cases/modules/initialization/behavior.md、.tiller/cases/modules/standards/interface.md、.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、.tiller/project.json、.tiller/rules/activities/delivery.md、.tiller/rules/core.md、.tiller/usage.md、README.md、resources/rules/activities/delivery.md、resources/rules/core.md、resources/usage.md、src/cli.ts、src/init-baseline.ts、src/pr.ts、test/case-redesign.test.mjs、test/flow-hardening.test.mjs、test/merge.test.mjs、test/review-release.test.mjs、test/rules.test.mjs、test/suites.json

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 64 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 26 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 109 条用例及经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期结论，建议回写：`.tiller/specs/modules/initialization/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/initialization/design.md`（“## <方案>” + 取舍与影响）；`.tiller/specs/modules/standards/requirements.md`（“## <能力>” + 稳定行为/边界）；`.tiller/specs/modules/standards/design.md`（“## <方案>” + 取舍与影响）。纯过程性变更可忽略。
- 修改的测试文件移除了 2 个测试用例（请确认对应功能已删除；详情见 Git diff）。
