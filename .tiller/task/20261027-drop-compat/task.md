# 去掉旧 launcher 与 runtime bind 兼容

<!-- tiller-task:v1 {"version":1,"id":"20261027-drop-compat","type":"feature","size":"standard","created":"2026-10-27T15:54:33.337Z","base":"92c93b93e9def866bf3d2598934a898ba4ca9f01","scope":["resources","src/runtime.ts","src/cli.ts","src/project-metadata.ts","src/flow.ts","src/core.ts","src/plans.ts","src/pr.ts","src/project-root.ts","src/task-worktrees.ts","scripts/package-smoke.mjs","test",".tiller","AGENTS.md"],"format":"structured"} -->

## 需求

### 使用场景

- 新工程 `tiller init` 后，用户与 AI 只使用 PATH 中的全局/本地 `tiller` CLI。
- 维护者决定不再保留旧 launcher、runtime bind、旧三棵树/closed 标记等跨版本兼容路径。

### 目标

不考虑兼容：删除 `run.cjs` / 旧 launcher、`tiller runtime status|bind` 与 `runtime.json`；收掉 close 对旧三棵树与 `.tiller/local/closed/` 的兼容清理枝，以及不再需要的 legacy 确认/证据解析；受管清单、package-smoke、文档同步；版本保持 0.5.0。

### 业务范围

- 做：从受管资源与包中移除 `run.cjs`；移除或拒绝用户主路径上的 runtime bind/status；清理 flow/close 旧布局兼容代码与相关测试/文档；upgrade/init 不再登记或写出 launcher。
- 不做：改变 worktree 任务真相、tokenized-git、合入证明 tip 绑定、doctor 语义；不顺带修 abandon / doctor ready 软摩擦；不做跨版本迁移工具。
- 假设：已安装工程若仍留有旧 `.tiller/run.cjs` / `runtime.json`，可忽略或由用户手工删除；新产品路径不再依赖它们。

### 关键行为

- AC-1：新 init 不再安装 `.tiller/run.cjs`；包与受管清单不含 `run.cjs`；不存在可用的 runtime bind/status 用户主路径。
- AC-2：close/merge 收尾不再依赖旧三棵树或 `.tiller/local/closed/` 兼容路径；相关文档与测试更新；全量测+package smoke 通过；0.5.0。

### 异常与边界

- 若 CLI 仍收到 `runtime` 子命令：明确报错提示改用 PATH `tiller`，不要静默写 bind。
- 删除受管文件后，upgrade/doctor 不得因缺少旧 launcher 失败。

### 验收条件

- AC-1: 新 init 不再安装 .tiller/run.cjs；包与受管清单不含 run.cjs；不存在可用的 runtime bind/status 用户主路径。
- AC-2: close/merge 收尾不再依赖旧三棵树或 .tiller/local/closed/ 兼容路径；相关文档与测试更新；全量测+package smoke 通过；0.5.0。

## 设计

### 方案

1. 从 `SHARED_RESOURCES` / managedFiles / package 资源中移除 `run.cjs`；删除或停用 `resources/run.cjs`。
2. CLI：`runtime status|bind` 改为拒绝（明确错误）或整命令移除；删掉 `bindRuntime` 主路径与对 launcher digest 的强制校验。
3. flow/close：去掉旧三棵树布局与 `.tiller/local/closed/` 兼容清理；保留当前 worktree-first close。
4. 可选收紧：不再写入/解析无用的 `style: legacy` / `legacyEvidence`（若测试与旧 fixture 依赖则先删测试再删解析）。
5. 更新 usage、AGENTS、package-smoke、CASE/测试；版本保持 0.5.0。

### 失败处理

- 缺旧 launcher 不再视为工程损坏。
- runtime 子命令调用返回明确错误码/文案。

### 取舍

- 一次砍兼容入口，不做双轨迁移期；与「PATH 单一 tiller」产品决策一致。
- 不在本任务改 abandon / ready 语义，避免混包。

### 影响与风险

- 影响：`resources/`、`src/runtime.ts`、`src/cli.ts`、`src/project-metadata.ts`、`src/flow.ts`、`src/core.ts`、smoke/测试/文档。
- 风险：旧 CASE 覆盖 launcher/bind 需改写或删除；已初始化仓库残留 `run.cjs` 无害但不被管理。

### 验证入口

- init 后断言无 `.tiller/run.cjs`、无 runtime.json；`tiller runtime …` 失败。
- `npm test` + `npm run test:package`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 设计 | boon yu | 2026-10-27T15:54:44.579Z | f408a7caae0a | — |
| 需求 | boon yu | 2026-10-28T00:17:40.854Z | d5c1c0c7ca4b | 既然不保留兼容旧逻辑，就代码与用例一起删掉。 |

<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"24108382fb5c9b404219258474d62785ab0681415e1777e41736e890349b8add","commit":"f408a7caae0a3811fad7b09c602956ed7bbbc365","by":"boon yu","quote":"","at":"2026-10-27T15:54:44.579Z"} -->
<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"aca806aee96a811b73676f167ad9bb18661ddac06f073a8ba306990c0a8cab3a","commit":"d5c1c0c7ca4b2a31bc7330d58313822e8c664821","by":"boon yu","quote":"既然不保留兼容旧逻辑，就代码与用例一起删掉。","at":"2026-10-28T00:17:40.854Z"} -->

## 验证

尚无验证。

## 自检

- [x] 需求确认有效
- [ ] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [ ] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [ ] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 过程卫生：设计确认提交 f408a7caae0a 后，工作区仍有未提交业务改动：src/flow.ts。请先提交或移出本任务。
- AC-1 尚无验证。
- AC-2 尚无验证。
- 改动超出范围：.tiller/cases/modules/initialization/behavior.md、.tiller/cases/modules/initialization/interface.md、.tiller/cases/modules/initialization/performance.md、.tiller/cases/modules/initialization/security.md、.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、.tiller/context/project.md、.tiller/project.json、.tiller/rules/activities/delivery.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/initialization/design.md、.tiller/specs/modules/initialization/requirements.md、.tiller/specs/modules/standards/design.md、.tiller/specs/modules/workflow/design.md、.tiller/specs/modules/workflow/hygiene-invariants.md、.tiller/specs/modules/workflow/no-close-materialize.md、.tiller/specs/modules/workflow/requirements.md、.tiller/specs/requirements.md、.tiller/usage.md、src/plans.ts、src/pr.ts、src/project-root.ts、src/task-worktrees.ts
- 弱化测试断言：test/first-batch.test.mjs::${closeCase.id} close lifecycle behavior
- 弱化测试断言：test/first-batch.test.mjs::CASE-308 abandon does not materialize an untracked task onto primary
- 弱化测试断言：test/first-batch.test.mjs::CASE-058 abandoned tasks are terminal, reopenable, and not counted as active or accepted plan work
- 弱化测试断言：test/rules.test.mjs::CASE-091 verification guidance requires execution, reporting reasons and failure-first evidence
- 弱化测试断言：test/task-worktrees.test.mjs::CASE-196 CASE-209 CASE-287 project start creates a task-local worktree, sidecars and logs in one directory
- 弱化测试断言：test/task-worktrees.test.mjs::CASE-197 CASE-210 CASE-287 workspace start keeps management and registered repositories under the task worktree root
- 弱化测试断言：test/usage-resources.test.mjs::CASE-215 docs describe task-local layout and close cleanup lifecycle
- 交付范围存在未提交改动：src/flow.ts

提示：
- 167 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 129 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 53 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 159 条用例及经过它的场景 CASE-055, CASE-001。
- 删除 2 个测试文件（请确认对应功能已删除；详情见 Git diff）。
- 修改的测试文件移除了 9 个测试用例（请确认对应功能已删除；详情见 Git diff）。
