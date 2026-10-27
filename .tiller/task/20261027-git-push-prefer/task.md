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
| 需求 | ChukiChen | 2026-10-27T06:08:28.317Z | 4fb72b6f07c2 | — |
| 设计 | ChukiChen | 2026-10-27T06:08:28.407Z | 4fb72b6f07c2 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"fda1960605d3b7c4054983ef3433777e1e7b8ac6bf503f2caec621d67024ad46","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa","by":"ChukiChen","quote":"","at":"2026-10-27T06:08:28.317Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"b316519bb6149a3552f35ece7ba0914f0abc1aecfcbca427a2d2d7faaf655bf8","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa","by":"ChukiChen","quote":"","at":"2026-10-27T06:08:28.407Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-298 GitHub pr prefers tokenized git push and keeps pull request creation on REST API$' \u002d\u002dtest-reporter=./.tiller/local/verify-kdog81/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-kdog81/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-1
- 测试：test/pr.test.mjs::CASE-298 GitHub pr prefers tokenized git push and keeps pull request creation on REST API
- 用例：CASE-298
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-1.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:21.642Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-299 init adds gitkeep when src and test directories are missing$' \u002d\u002dtest-reporter=./.tiller/local/verify-wQ1fFm/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-wQ1fFm/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-299 init adds gitkeep when src and test directories are missing
- 用例：CASE-299
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-2.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:26.392Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-300 stable requirement files suppress generic specs writeback warnings$' \u002d\u002dtest-reporter=./.tiller/local/verify-pupXVQ/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-pupXVQ/report.jsonl test/gap-closure.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-3
- 测试：test/gap-closure.test.mjs::CASE-300 stable requirement files suppress generic specs writeback warnings
- 用例：CASE-300
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-3.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:27.680Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 pr identifies worktree records separately from primary residual copies$' \u002d\u002dtest-reporter=./.tiller/local/verify-oloTHK/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-oloTHK/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-301 pr identifies worktree records separately from primary residual copies
- 用例：CASE-301
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-4.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:29.227Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 repeated accept rechecks the current code tree$' \u002d\u002dtest-reporter=./.tiller/local/verify-izpDcx/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-izpDcx/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-301 repeated accept rechecks the current code tree
- 用例：CASE-301
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-5.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:29.227Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-301 multiline requirement points callers to requirement-file$' \u002d\u002dtest-reporter=./.tiller/local/verify-OXecMz/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-OXecMz/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-4
- 测试：test/pr.test.mjs::CASE-301 multiline requirement points callers to requirement-file
- 用例：CASE-301
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-6.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:29.227Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-162 repository keeps the 0\\.5\\.0 release contract and five full verification entries$' \u002d\u002dtest-reporter=./.tiller/local/verify-8JAxzC/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-8JAxzC/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-162 repository keeps the 0.5.0 release contract and five full verification entries
- 用例：CASE-162
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-7.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:48.000Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-241 CASE-245 CASE-252 API 远端操作保持 0\\.5\\.0 且打包模块同步$' \u002d\u002dtest-reporter=./.tiller/local/verify-acqsyD/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-acqsyD/report.jsonl test/merge.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-5
- 测试：test/merge.test.mjs::CASE-241 CASE-245 CASE-252 API 远端操作保持 0.5.0 且打包模块同步
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-8.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:48.633Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-245 全局用例库同步文档 CLI 名称与版本$' \u002d\u002dtest-reporter=./.tiller/local/verify-6Lvnmx/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6Lvnmx/report.jsonl test/rules.test.mjs","exitCode":0,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-5
- 测试：test/rules.test.mjs::CASE-245 全局用例库同步文档 CLI 名称与版本
- 用例：CASE-245
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-git-push-prefer/logs/run-9.log
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:48.633Z

### run-10
<!-- tiller-verify:v1 {"command":"npm run test:package","exitCode":null,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-5
- 测试：scripts/package-smoke.mjs::Package smoke passed 0.5.0
- 用例：无
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：已在 worktree 执行 npm run test:package，输出 Package smoke passed: 0.5.0, 42 packaged files
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:54.327Z

### run-11
<!-- tiller-verify:v1 {"command":"npm test","exitCode":null,"tree":"e87ebbe2debfb00a14d2ca8daf318fc882960ba2bf149766f63418ddc23e0e51","commit":"4fb72b6f07c26d66ae067f6821ed12636ebcc1aa"} -->
- 条件：AC-5
- 测试：package.json::npm test full suite 329 pass
- 用例：无
- 结果：passed
- 来源：reported
- 核实：未执行
- 理由：已在 worktree 执行 npm test：# tests 329 # pass 329 # fail 0
- 提交：4fb72b6f07c2
- 时间：2026-10-27T06:43:58.573Z

## 自检

- [x] 需求确认有效
- [ ] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [ ] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 过程卫生：需求、设计确认提交 4fb72b6f07c2 后，工作区仍有未提交业务改动：resources/entry.md、resources/rules/activities/delivery.md、resources/rules/activities/requirements.md、resources/usage.md、src/cli.ts、src/core.ts、src/flow.ts、src/init-baseline.ts 等 18 项。请先提交或移出本任务。
- AC-5 的验证未实际执行（外部报告）：已在 worktree 执行 npm test：# tests 329 # pass 329 # fail 0；确认事实后使用 --allow-reported 放行。
- AC-5 未绑定全局用例；验证测试名应引用 CASE-xxx。
- 改动超出范围：AGENTS.md、README.md
- 交付范围存在未提交改动：.tiller/cases/modules/standards/interface.md、.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、.tiller/project.json、.tiller/rules/activities/delivery.md、.tiller/rules/activities/requirements.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/initialization/design.md、.tiller/specs/modules/workflow/design.md、.tiller/specs/modules/workflow/dogfood-hygiene.md、.tiller/specs/modules/workflow/flow-exec-stability.md、.tiller/specs/modules/workflow/git-push-prefer.md、.tiller/specs/modules/workflow/requirements.md、.tiller/usage.md、resources/entry.md、resources/rules/activities/delivery.md、resources/rules/activities/requirements.md、resources/usage.md、src/cli.ts、src/core.ts、src/flow.ts、src/init-baseline.ts、src/platform-api.ts、src/pr.ts、test/case-redesign.test.mjs、test/gap-closure.test.mjs、test/init-baseline.test.mjs、test/merge.test.mjs、test/platform-api-mock.mjs、test/pr.test.mjs、test/review-release.test.mjs、test/rules.test.mjs

提示：
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 129 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 67 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 150 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
