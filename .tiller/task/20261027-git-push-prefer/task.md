# GitHub推送改走git并收软摩擦

<!-- tiller-task:v1 {"version":1,"id":"20261027-git-push-prefer","type":"feature","size":"standard","created":"2026-10-27T06:08:04.399Z","base":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa","scope":["src","test",".tiller","resources","AGENTS.md","README.md"],"format":"structured","slug":"git-push-prefer","summary":"GitHub优先tokenized git push并收软摩擦"} -->

## 需求

### 使用场景

开发者在 tiller 任务 worktree 完成 accept→pr→merge 时，GitHub `tiller pr` 因默认 Git Data API 串行上传整树 blob 耗时约 60–150 秒；同时 post-#41 狗粮仍有 init 缺目录不补 gitkeep、feature check「未回写 specs」噪音、PR_TASK_RECORDS_DIRTY 提示不清、accept 多轮与 `--requirement` 单行等软摩擦。用户已确认产品边界：git 能完成的（commit/push/删分支）走 git；仅开 PR、merge、读远端状态走平台 API。

### 目标

把 GitHub 推送主路径改为优先 tokenized HTTPS `git push`（与 GitLab 一致），Git Data API 不再作为默认；并收口上述软摩擦中优先级明确的项（push、gitkeep、回写噪音，以及 2–4 中有清晰 bug 或便宜文档的部分）。版本保持 0.5.0。实现结论回写 `.tiller/specs/`（含 decisions 中 push 选择）。

### 业务范围

- 做：`pushBranch` GitHub 偏好改为 tokenized git；init 在缺 `src/`/`test/` 时仍把对应 `.gitkeep` 写入变更集；降噪「未回写 specs」提示；改进 `PR_TASK_RECORDS_DIRTY` 文案（可区分 worktree 未提交与 primary 残留，不静默删文件）；accept 多轮若有明确 bug 则修，否则 usage/help 一句；`--requirement` 多行若便宜则改，否则明确指向 `--requirement-file`；更新 cases/测试/decisions/受管文档镜像。
- 不做：升版本；merge/close 本 PR；纯性能抛光；静默删除用户文件；整仓架构重写；第二交付通道。
- 假设与待确认：token 仍由 `GITHUB_TOKEN`/`GH_TOKEN` 等既有环境提供；Git Data API 代码可保留为可选回退，但不得再作 GitHub 默认主路径。

### 关键行为

1. GitHub `tiller pr` 推送成功时，推送结果方法为 `tokenized-git`（或等价命令描述为 git push），不再默认 `github-api` 整树上传。
2. 空仓库或仅有 README/package.json、尚无 `src/`/`test/` 目录时，init 变更集仍包含 `src/.gitkeep` 与 `test/.gitkeep`。
3. 仅引用已有稳定 specs、任务基线后无 specs/context 长期回写必要时，check 不再给出易误导的「未回写」强提示（或文案标明可忽略的过程性情形）。
4. `PR_TASK_RECORDS_DIRTY` 错误信息能帮助区分「当前任务检出未提交」与「primary 残留未跟踪副本」；不自动删除用户文件。
5. 开真实 PR，不合入。

### 异常与边界

- tokenized git push 失败返回清晰中文错误，不泄露 token。
- GitLab 路径保持既有 tokenized push；开 PR/MR 与 squash merge 仍走 REST API。
- primary 与 worktree 双份任务记录时，不静默删 primary；提示用户提交或清理。
- 既有 CASE-291「空目录已存在则补 gitkeep」行为保留并扩展到「目录缺失也补」。

### 验收条件

- AC-1: GitHub 上 tiller pr 推送优先使用 tokenized HTTPS git push，不再默认走 Git Data API 串行上传整树 blob；开 PR/merge 仍走 REST API
- AC-2: 仓库尚无 src/ 或 test/ 目录时，init 变更集仍包含 src/.gitkeep 与 test/.gitkeep
- AC-3: feature 任务仅引用已有稳定 specs、本次无基线后 specs/context 长期回写必要时，check 对「未回写 specs」提示降噪或仅在真实需要时出现
- AC-4: PR_TASK_RECORDS_DIRTY 提示能区分 worktree 未提交记录与 primary 残留副本，且不静默删除用户文件；accept 多轮若有明确 tiller bug 则修，否则文档一句说明；--requirement 多行若便宜则改善否则文档指向 --requirement-file
- AC-5: 版本保持 0.5.0；全量 build/lint/typecheck/test 与 package smoke 通过；新增 CASE 并更新总数断言；开真实 PR 不合入

## 设计

### 方案

1. **推送偏好**：修改 `src/platform-api.ts` 的 `pushBranch`：GitHub 与 GitLab 一样优先 `tokenizedPush`；Git Data API（`pushGitHubApi`）仅作可选回退或删除主路径调用。更新 `.tiller/specs/decisions.md`、usage/delivery 中「GitHub 优先 Git Data API」表述。相关测试（CASE-244/251 等）与新增 CASE 断言 GitHub 默认 tokenized-git。
2. **init gitkeep**：`skeletonChanges` 在 `src`/`test` 缺失或为空时都把 `src/.gitkeep`、`test/.gitkeep` 加入变更集（创建目录+标记）；扩展 CASE-291 或新增 CASE。
3. **回写提示**：`writebackWarning` 仅在任务确实可能产生长期结论且基线后无 specs/context 变更、同时又不是「仅引用已有 specs 的实现任务」时提示；或弱化为更明确的可忽略文案。优先降噪，不误伤真需回写的任务。
4. **DIRTY 文案**：`draftPullRequest`/`uncommittedTaskRecords` 错误信息补充 worktree/primary 指引；禁止自动删文件。
5. **accept / --requirement**：先核查 `deliverySubject` 是否在「accept 后仅提交 task.md」场景被误伤；若属 verify 后再改导致失效则为设计如此，usage 补一句。`--requirement` 多行优先文档指向 `--requirement-file`；若 parseArgs 侧有便宜改动可顺手做。
6. **稳定 specs**：新增 `.tiller/specs/modules/workflow/git-push-prefer.md`（或等价），并在 workflow requirements/design/decisions 各补一句；cases 关联该 requirements 文件，关联 AC=无。

### 失败处理

tokenized push 失败以 `PLATFORM_PUSH_FAILED` 中文说明；不回退到会拖慢主路径的默认 Git Data API，除非显式保留为二次回退且测试覆盖。init/check/pr 失败不破坏已有工作区；不静默删用户文件。

### 取舍

- 选 tokenized git 而非优化 Git Data API blob 并发/base_tree：符合用户产品边界，改动面小，GitLab 已验证。
- 保留 Git Data API 代码作可选回退，避免极端环境下完全无推送路径；但默认不再走它。
- 回写提示降噪而非删除整条规则：长期结论仍需引导回写。

### 影响与风险

影响 `platform-api` 推送、`core` init、`flow` check 提示、`pr` 错误文案与文档镜像。风险：部分环境若 HTTPS git 被拦截而 API 可用——用可选回退缓解。兼容：版本 0.5.0，不改 CLI 命令面。

### 验证入口

`npm test`（含 platform/pr/init/flow 相关新 CASE）；`npm run test:package`；worktree 内对 AC-1～5 逐条 `node .tiller/run.cjs verify`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-27T06:44:29.599Z | dcb746d0e7d5 | — |
| 设计 | ChukiChen | 2026-10-27T06:44:29.716Z | dcb746d0e7d5 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"a5684fc43cbe6da278153a4cd7074c9682b063da5da7dbd77990585044345b23","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81","by":"ChukiChen","quote":"","at":"2026-10-27T06:44:29.599Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"9198c6251a7f40016416778aa50c24a32391033854af21055dc63b817a28e12f","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81","by":"ChukiChen","quote":"","at":"2026-10-27T06:44:29.716Z"} -->

## 验证

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-298 GitHub pr prefers tokenized git push and keeps pull request creation on REST API$' \u002d\u002dtest-reporter=./.tiller/local/verify-e7eCjH/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-e7eCjH/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-298 GitHub pr prefers tokenized git push and keeps pull request creation on REST API
- 用例：CASE-298
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-12.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:29.909Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-299 init adds gitkeep when src and test directories are missing$' \u002d\u002dtest-reporter=./.tiller/local/verify-6rE8FX/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6rE8FX/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-299 init adds gitkeep when src and test directories are missing
- 用例：CASE-299
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-13.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:32.240Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-300 stable requirement files suppress generic specs writeback warnings$' \u002d\u002dtest-reporter=./.tiller/local/verify-hnQget/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-hnQget/report.jsonl test/gap-closure.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-3
- 测试：test/gap-closure.test.mjs::CASE-300 stable requirement files suppress generic specs writeback warnings
- 用例：CASE-300
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-14.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:33.619Z

### run-15
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 pr identifies worktree records separately from primary residual copies$' \u002d\u002dtest-reporter=./.tiller/local/verify-fBcqgF/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-fBcqgF/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-301 pr identifies worktree records separately from primary residual copies
- 用例：CASE-301
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-15.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:35.194Z

### run-16
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 repeated accept rechecks the current code tree$' \u002d\u002dtest-reporter=./.tiller/local/verify-qJskeT/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-qJskeT/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-301 repeated accept rechecks the current code tree
- 用例：CASE-301
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-16.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:35.194Z

### run-17
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 multiline requirement points callers to requirement-file$' \u002d\u002dtest-reporter=./.tiller/local/verify-LsfAYk/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-LsfAYk/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-301 multiline requirement points callers to requirement-file
- 用例：CASE-301
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-17.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:35.194Z

### run-18
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-162 repository keeps the 0\\.5\\.0 release contract and five full verification entries$' \u002d\u002dtest-reporter=./.tiller/local/verify-HtMDmi/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-HtMDmi/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-18.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:40.502Z

### run-19
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-241 CASE-245 CASE-252 API 远端操作保持 0\\.5\\.0 且打包模块同步$' \u002d\u002dtest-reporter=./.tiller/local/verify-uMrmse/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-uMrmse/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-5
- 测试：test/merge.test.mjs::CASE-241 CASE-245 CASE-252 API 远端操作保持 0.5.0 且打包模块同步
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-19.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:41.018Z

### run-20
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-xgczC8/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xgczC8/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"c93793e0c116d603235e8e6711a5306394804a6f8a804a8b5d1ff101528962f0","commit":"dcb746d0e7d523ef99dc9e23057fa7fea3368c81"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-20.log
- 提交：dcb746d0e7d5
- 时间：2026-10-27T06:44:41.018Z

#