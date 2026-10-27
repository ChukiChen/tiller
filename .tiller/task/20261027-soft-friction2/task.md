# init只写worktree与verify/基线卫生

<!-- tiller-task:v1 {"version":1,"id":"20261027-soft-friction2","type":"feature","size":"standard","created":"2026-10-27T10:07:39.310Z","base":"c2e25c5868ddc052b747a8bd2f3f8dd30411f4b2","scope":["src","test","scripts",".tiller","resources"],"format":"structured","summary":"init只写worktree、基线不脏project.json、设计前拒verify","requirementFile":".tiller/specs/modules/workflow/soft-friction2-init-verify.md"} -->

## 需求

### 使用场景

post-#43 狗粮后仍有三项软摩擦：设计确认前误跑 `verify` 会写入错序段，随后过程卫生阻断确认，需手工清记录；`init` 仍先在 primary 落受管文档再清理，常留未跟踪 `.tiller/` / 任务树挡 `git pull`；合入后 `markInitBaselineMerged` 只改工作区里的跟踪 `.tiller/project.json`，造成偶发脏树。维护者与执行 AI 需要这三项按根因收口，与 #43「start 只写 worktree」同精神。

### 目标

需求来源：`.tiller/specs/modules/workflow/soft-friction2-init-verify.md`

一次性按根因修这三项：`verify` 在 standard 且设计未确认时拒跑（可观测错误），并提供一键清除过早 verify 段的能力，避免手工改 `task.md`；`init` 受管产物只写入 init 任务 worktree，primary 不预建 `.tiller/` 文档树 / 未跟踪种子；合入后不再靠改跟踪 `project.json` 标记 merged（本地状态进 `.tiller/local/`，或合入证明不脏工作区）。版本保持 0.5.0。`--requirement` 短目标通道不改。

### 业务范围

- 做：改 `src/` 中 `initialize` / `createInitBaseline` / `markInitBaselineMerged` / `proveInitBaselineMerged` / `verifyFlow` / 可选 clear 子命令或 confirm 修复路径；更新受管文档一句、initialization/workflow specs 与 decisions；CASE + 测试；必要 CLI/usage；按 worktree-only 同步 `scripts/package-smoke.mjs`。
- 不做：升版本；放开 `--requirement` 多行完整需求；给 `pr`/`pull` 加“忽略未跟踪”特判作为主修复；CloudAgent；合入本 PR（由人审阅）；扩大到无关重构。
- 假设：init 后、人工合入前，primary 可以没有完整 `.tiller/` 骨架；门禁可从 init worktree 或 `.tiller/local/` 读取 pending 基线。merged 证明优先 git 祖先 / 平台 API，本地标记仅缓存且不修改已跟踪 `project.json`。

### 关键行为

1. **verify 顺序**：standard 任务在尚无有效设计确认时，`verify` 直接失败（稳定错误码 + 中文说明须先 `confirm … design`），不写入 verify 段。若历史已有过早 verify 段，提供一键清除（如 `tiller verify <id> --clear-premature` 或等价命令），清除后可再确认设计；过程卫生门禁（check/accept）仍保留。
2. **init 只写 worktree**：有 Git HEAD 并创建初始化基线时，受管改动（含 `.tiller/**`、`AGENTS.md`、`.gitignore`、平台模板、`project.json`、空目录 gitkeep 等）只 `apply`/提交到 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees`；primary 不预写这些文档，也不再依赖「先写 primary 再 cleanup」作为主路径。失败回滚不在 primary 留未跟踪受管树。
3. **initBaseline 不脏跟踪文件**：init PR 内 `project.json` 记录基线 id/branch/commit（及初始 status 若保留）；`markInitBaselineMerged` / doctor / merge / close 证明合入后，把 merged 记在 `.tiller/local/`（已 gitignore），**不**把跟踪的 `.tiller/project.json` 改成仅工作区脏的 `status: merged`。primary 在 init 成功后对受管文件无未跟踪残留（含不再保留 META 最小例外）。

### 异常与边界

- 无 Git / 无法建 worktree：保持现有降级（可写 primary），并警告；不假装已建基线。
- 重复 init / 已有 initBaseline：不新建冲突分支，行为与现网一致。
- 已合入但 local 标记缺失：祖先或平台证明仍可通过，并补写 local 标记。
- small / 无设计门禁的任务：`verify` 不套用「先设计后验证」拒绝。
- 用户手工改过的 primary 文件：init 清理/不写路径不得覆盖或误删。

### 验收条件

- AC-1: standard 任务在有效设计确认前执行 `verify` 被拒绝且不写入验证段；若已有过早验证段，一键清除后可继续设计确认；过程卫生门禁仍在
- AC-2: 有 Git 的首次 `init` 成功后，primary 工作区对受管文件无未跟踪残留（含 `.tiller/project.json`）；全部 init 产物仅在 init worktree 提交中；合入/close/doctor 证明 merged 后跟踪的 `project.json` 不被改成仅工作区脏
- AC-3: 相关 CASE/测试与 package smoke 通过；版本保持 0.5.0；CLI/usage/decisions 反映上述行为

## 设计

### 方案

1. **verify 拒跑 + 清错序段**  
   `verifyFlow`：若 `requiresDesign(task)` 且尚无有效设计确认（`gate=design` 且 subject 匹配），在执行测试/写记录前以 `VERIFY_BEFORE_DESIGN`（或同等稳定码）失败，中文提示先 `confirm <id> design`。  
   新增 `tiller verify <id> --clear-premature`：删除「当前有效设计确认之前」的 verify 段（若尚无设计确认则删除全部已记录 verify）；重写 task.md 验证区与旁路索引；可自动 `chore:` 提交本任务记录（与 confirm 一致）。过程卫生门禁保留。

2. **init 只写 worktree**  
   `initialize` 在将创建 initBaseline 时：不再 `applyChanges(primary, changes)`；把 `changes` 交给 `createInitBaseline`，在 worktree `add` 后直接写入 worktree 并提交。primary 不落受管文档。  
   无 Git/跳过基线时仍可写 primary（现有降级）。  
   本地 pending 指针写入 `.tiller/local/<init-id>/`（已 ignore），供合入前 doctor/start 识别；合入后 primary 仅经 git pull 获得跟踪文件。  
   `cleanupPrimaryInitChanges` 保留为安全网，主路径应无可清残留；CASE-289 改为 primary 受管文件零未跟踪（含无 META 例外）。

3. **merged 不脏跟踪 project.json**  
   `markInitBaselineMerged` 改为写入 `.tiller/local/init-baseline-merged.json`（或 `<id>/merged`），不修改跟踪的 `.tiller/project.json`。  
   `initBaselinePending` / `proveInitBaselineMerged`：local merged 标记或 status===merged 或祖先/平台证明即视为已合入；证明成功只更新 local。  
   init PR 内 project.json 可保留 `status: pending` 作为创建时快照；合入后不强制改写该字段。

### 失败处理

- verify 拒跑：不写段、不跑测试。  
- clear-premature：无过早段时 no-op 成功并说明。  
- init 写 worktree 失败：回滚 worktree/分支，确保 primary 无受管未跟踪树。  
- mark 写 local 失败：返回可观测错误；merge 已合入远端时提示手动补 local 标记，不要求改 project.json。

### 取舍

- 不在合入前把 tracked status 写成 merged（谎报）。  
- 不把 pending/merged 继续靠脏工作区同步。  
- 不采用「pull 忽略未跟踪」特判。  
- `--requirement` 不在本任务放开。

### 影响与风险

- 影响：`src/core.ts`、`src/init-baseline.ts`、`src/flow.ts`、`src/cli.ts`、`src/pr.ts`、doctor、usage/delivery 文案、CASE-175/228/253/288/289 等断言、测试 settle 假设。  
- 兼容：已有 `status: merged` 的 project.json 仍识别；local 标记优先加速。  
- 风险：合入前 primary 无骨架时，误在 primary 跑非 init 命令会「未初始化」——符合「先合入 init」顺序。

### 验证入口

- `node --test test/init-baseline.test.mjs test/flow-hardening.test.mjs` 及相关 soft-friction2 新测  
- `npm test` 全量；`npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T10:43:56.730Z | f46a1564da22 | 一起修改吧，是否还有别的问题 |
| 设计 | boon yu | 2026-10-27T10:43:56.979Z | 06dfb75053a3 | 一起修改吧，是否还有别的问题 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"32de2c40162b300ae8b07368ec95f60bd830bee12827507a8e2f73c567c5f174","commit":"f46a1564da22d78ebbdc4a8893f7de85d294e7ad","by":"boon yu","quote":"一起修改吧，是否还有别的问题","at":"2026-10-27T10:43:56.730Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"dddf2b07aaa61a37c3aca1d708f191a3eee30d3161b6dc3689598be0b5eb4be1","commit":"06dfb75053a3ad6a23949090e60ad78475e022c4","by":"boon yu","quote":"一起修改吧，是否还有别的问题","at":"2026-10-27T10:43:56.979Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-175 CASE-307 standard verify before design is rejected; clear-premature restores hygiene$' \u002d\u002dtest-reporter=./.tiller/local/verify-heiswO/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-heiswO/report.jsonl test/flow-hardening.test.mjs","exitCode":0,"tree":"c6485df55876c5fb178e778a07fb9db259e03e5bab3fd9a5eab5f9d41dcecbeb","commit":"f46a1564da22d78ebbdc4a8893f7de85d294e7ad"} -->
- 条件：AC-1
- 测试：test/flow-hardening.test.mjs::CASE-175 CASE-307 standard verify before design is rejected; clear-premature restores hygiene
- 用例：CASE-307
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-soft-friction2/logs/run-1.log
- 提交：f46a1564da22
- 时间：2026-10-27T10:43:29.975Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-289 CASE-305 init leaves no untracked managed residue$' \u002d\u002dtest-reporter=./.tiller/local/verify-Xktt7Z/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Xktt7Z/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"c6485df55876c5fb178e778a07fb9db259e03e5bab3fd9a5eab5f9d41dcecbeb","commit":"f46a1564da22d78ebbdc4a8893f7de85d294e7ad"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-289 CASE-305 init leaves no untracked managed residue
- 用例：CASE-305
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-soft-friction2/logs/run-2.log
- 提交：f46a1564da22
- 时间：2026-10-27T10:43:34.948Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-253 CASE-306 init baseline merged through the platform API unlocks start and records merged$' \u002d\u002dtest-reporter=./.tiller/local/verify-PCx1hq/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-PCx1hq/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"c6485df55876c5fb178e778a07fb9db259e03e5bab3fd9a5eab5f9d41dcecbeb","commit":"f46a1564da22d78ebbdc4a8893f7de85d294e7ad"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-253 CASE-306 init baseline merged through the platform API unlocks start and records merged
- 用例：CASE-306
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261027-soft-friction2/logs/run-3.log
- 提交：f46a1564da22
- 时间：2026-10-27T10:43:36.346Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 改动超出范围：scripts/package-smoke.mjs

提示：
- 172 条历史用例仍以 <任务>#AC-n 记录关联 AC；这是可迁移的历史债，不阻断当前覆盖。
- 135 条用例的关联 AC 为无；覆盖以需求字段和 verify 的 AC→测试→CASE 记录为准。
- 本次改动涉及模块 initialization：建议回归该模块 69 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 37 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 45 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 154 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 3 个测试用例（请确认对应功能已删除；详情见 Git diff）。
