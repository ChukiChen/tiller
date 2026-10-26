# 初始化集成基线

<!-- tiller-task:v1 {"version":1,"id":"20261026-init-baseline","type":"feature","size":"standard","created":"2026-10-26T05:27:04.374Z","base":"53d10a8e2034b8b927fe49c053e696a3311a1046","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","slug":"init-baseline","summary":"init worktree 与 start 门禁","requirementFile":".tiller/local/20261026-init-baseline-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 的人。现状：`tiller init` 后受管入口常停在主工作区未提交；随后 `start` 建出空壳任务 worktree，业务与 `.tiller/specs` 却写在主仓 cwd，合入前规格已落在 main 工作区。用户要求 init 完成后做初始化集成：在 `.tiller/local/<init-id>/worktrees` 上建 `chore/tiller-init`、提交受管文件并自动创建 PR/MR（合入仍人工）；合入后再开业务任务；`start` 在初始化基线未合入前默认阻断，放行用 `--skip-init-gate`。不考虑旧任务迁移兼容。

### 目标

`init` 后自动走初始化 worktree + 固定标题 PR；人工合入后清理该 init-id local；`start` 对未合入的初始化基线默认门禁，`--skip-init-gate` 可跳过；文档写明 init → 初始化 PR → 人工合入 → 再 start，以及 specs 在任务 worktree 修改并经合入进入 main。版本保持 0.5.0。

需求来源：`.tiller/local/20261026-init-baseline-req.md`

### 业务范围

- 做：init 后创建 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees`（分支 `chore/tiller-init`，基线=当前 HEAD），在 worktree 提交受管初始化改动并尝试自动开 PR（标题 `chore(tiller): 完成工程初始化`）；PR 失败时保留本地并给出可复制命令；合入后或 close init-id 只删该 local；`start` 增加初始化门禁与 `--skip-init-gate`；更新 usage/必要 rules；用例与测试。
- 不做：不自动合入 PR；不修演示仓 tiller-test-single；不改 post-merge-freeze；不考虑旧任务兼容；不改版本号。
- 假设与待确认：托管可用时优先 gh；project 单仓为主路径；门禁检测取最小可靠方案（建议 project.json 的 initBaseline + Git 祖先/合入判定）并文档化。

### 关键行为

1. `tiller init` 成功后创建初始化 worktree（id=`YYYYMMDD-tiller-init`，分支 `chore/tiller-init`），提交受管改动，尝试自动开 PR；不自动合入。
2. 自动开 PR 失败时仍保留 worktree+提交，返回可复制推送/开 PR 命令。
3. 初始化合入后或对 init-id `close`：只删除 `.tiller/local/<init-id>/`，不影响其它任务。
4. `start` 在初始化基线未合入前默认失败；`--skip-init-gate` 跳过；合入后可正常 start。
5. 文档写明上述顺序，并强调 specs 在任务 worktree 编辑、随任务分支合入。

### 异常与边界

- 自动开 PR 失败：不回滚本地 worktree/提交。
- 重复 init：保持现有补齐语义；未合入时不重复制造冲突分支（复用或明确失败）。
- 无 Git / 无提交：与现有 worktree 门禁对齐。
- 本功能前已存在工程：无旧任务兼容要求；可用 `--skip-init-gate`；标记策略须避免误锁死无法表达「主干上已有历史初始化」的场景（设计写清）。

### 验收条件

- AC-1: init 成功后创建 .tiller/local/<YYYYMMDD-tiller-init>/worktrees，分支 chore/tiller-init（基线=当时 HEAD），并在该 worktree 提交受管初始化改动；尝试自动创建标题为 chore(tiller): 完成工程初始化 的 PR/MR；不自动合入
- AC-2: 自动开 PR 失败时仍保留本地 worktree+提交，并返回可复制的推送/开 PR 下一步；合入后或对 init-id close 时只删除该 .tiller/local/<init-id>/，不影响其它任务 local
- AC-3: start 在初始化基线未合入前默认失败；提供 --skip-init-gate 可跳过；合入判定方式在代码/文档写明且可测
- AC-4: usage 与必要 rules（delivery/core）写明：init → 初始化 PR → 人工合入 → 再 start；specs 在任务 worktree 修改并经合入进入 main
- AC-5: 用例与测试覆盖 AC-1～4 关键路径；全量 build/lint/typecheck/test/test:package 通过；版本保持 0.5.0

## 设计

### 方案

1. **init 后初始化集成（AC-1）**
   - `initialize` 在写出受管文件成功后，调用与任务对称的初始化 worktree 流程：
     - init-id：`YYYYMMDD-tiller-init`（Asia/Shanghai 当日）。
     - 路径：`.tiller/local/<init-id>/worktrees`；分支：`chore/tiller-init`；基线：当前 HEAD。
     - 在 worktree 内 `git add` 受管初始化改动并提交，信息固定：`chore(tiller): 完成工程初始化`。
   - 在 `project.json` 写入 `initBaseline` 标记（建议字段：`id`、`branch`、`commit`、可选 `status`），随初始化提交进入该分支，合入主干后可供门禁读取。
   - 尝试自动开 PR/MR：GitHub 优先 `gh pr create`（head=`chore/tiller-init`，title=`chore(tiller): 完成工程初始化`）；不自动合入。返回结果含 worktree 路径、分支、PR URL 或失败原因。

2. **PR 失败与清理（AC-2）**
   - 自动开 PR 失败：不回滚 worktree/提交；`next`/警告给出可复制的 `git push -u` 与 `gh pr create`（或 glab）命令。
   - 对 init-id 的 `close`（或合入后的等价清理）：复用既有 `cleanupTaskWorktrees` / 删除 `.tiller/local/<id>/`，只清该 id；其它任务 local 不动。
   - 重复 init：若同 id local/分支仍在且未合入，复用或明确失败（实现选定一种并测通），禁止 silently 再建冲突分支。

3. **start 门禁（AC-3）**
   - 默认：若存在未合入的初始化基线，则 `start` 失败（建议错误码如 `INIT_BASELINE_PENDING`），提示先合入初始化 PR 或使用 `--skip-init-gate`。
   - **合入判定（最小可靠）**：读取 `project.json` 的 `initBaseline`；若其 `commit` 已是当前 HEAD 的祖先（或 `status=merged`），视为已合入；若 local 仍有该 init-id 且 commit 尚未进入 HEAD，视为未合入。本功能前无 `initBaseline` 字段的工程：视为已满足（避免锁死存量主干），开发本仓亦可 `--skip-init-gate`。
   - CLI：`start` 增加布尔选项 `--skip-init-gate`；usage 同步。

4. **文档（AC-4）**
   - 更新 `resources/usage.md`、必要的 delivery/core：init → 初始化 PR → 人工合入 → 再 start；specs 在任务 worktree 编辑并经合入进 main；同步受管镜像。

5. **测试与版本（AC-5）**
   - 新 CASE 从 CASE-228 起；覆盖 init worktree+提交+PR 尝试（可 mock 失败路径）、close 只清 init-id、start 门禁与 `--skip-init-gate`、文档关键字。
   - 版本保持 0.5.0；全量质量门禁通过。

### 失败处理

- 无 Git / HEAD 缺失：与现有 worktree 错误对齐，init 集成步骤失败时须说明，避免留下半套 local（能 rollback 则 rollback）。
- 自动开 PR 失败：保留本地，返回命令。
- start 未合入：硬失败；`--skip-init-gate` 放行并 ideally 记警告。
- close 非 init 任务：保持现有行为。

### 取舍

- **init 用独立 worktree，而非在主仓切分支**：与任务对称，主工作区保持在主干。
- **门禁用 initBaseline + Git 祖先，而非强依赖联网查 PR**：可测、无网络；PR URL 仅作提示。
- **无 initBaseline 的存量工程默认放行**：避免「不考虑旧任务兼容」时误锁死已在主干完成历史初始化的仓；真正要拦的是「刚跑完新 init、PR 未合入」。
- **不自动合入**：授权边界与现有约定一致。

### 影响与风险

- 影响：`src/core.ts`（initialize 收尾）、`src/flow.ts` / `src/cli.ts`（start 门禁与 flag）、`src/task-worktrees.ts` 或新建 init-baseline 辅助模块、`src/project-metadata.ts`/`types`、相关 `test/*.mjs`、`resources/usage.md` 与受管 rules、可能 `pr.ts` 辅助开 PR。
- 风险：init 在无远程/无 gh 环境变慢或告警增多——可接受，失败路径已定义。
- 安全：不自动合入；不写密钥；gh 调用失败即降级。

### 验证入口

- 定向：新增/扩展 init 与 start 相关 `node --test test/*.mjs`。
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T05:54:27.321Z | 773b0d627f30 | — |
| 设计 | boon yu | 2026-10-26T05:54:27.406Z | 773b0d627f30 | — |
| 交付验收 | boon yu | 2026-10-26T05:55:20.704Z | 773b0d627f30 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"35e7202b41d1dcaced6ccd455d0356515103f80a3697f1c0fbf7527fe5dfe794","commit":"773b0d627f3064951ff3d741759bf16aaf025618","by":"boon yu","quote":"","at":"2026-10-26T05:54:27.321Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"8be594a4b9fe76c206679d956688996d2f595ccaa9de60a8f214bd57d5378577","commit":"773b0d627f3064951ff3d741759bf16aaf025618","by":"boon yu","quote":"","at":"2026-10-26T05:54:27.406Z"} -->
<!-- tiller-confirm:v1 {"gate":"acceptance","object":"当前交付（需求、设计、验证与提交）","subject":"f315c5c15b95062cd0e5887cd4d0d8ea75694fdaf9b6cb6c7443e4448f988c8c","commit":"773b0d627f3064951ff3d741759bf16aaf025618","by":"boon yu","quote":"","at":"2026-10-26T05:55:20.704Z"} -->

## 验证

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-228 init creates a committed initialization worktree and attempts the titled PR$' \u002d\u002dtest-reporter=./.tiller/local/verify-BmOtCD/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-BmOtCD/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-228 init creates a committed initialization worktree and attempts the titled PR
- 用例：CASE-228
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-7.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:34.323Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-228 init creates a committed initialization worktree and attempts the titled PR$' \u002d\u002dtest-reporter=./.tiller/local/verify-clQOaR/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-clQOaR/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-228 init creates a committed initialization worktree and attempts the titled PR
- 用例：CASE-228
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-8.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:35.287Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands$' \u002d\u002dtest-reporter=./.tiller/local/verify-maizYp/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-maizYp/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands
- 用例：CASE-229
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-9.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:36.242Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands$' \u002d\u002dtest-reporter=./.tiller/local/verify-ELGOdL/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ELGOdL/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands
- 用例：CASE-229
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-10.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:37.166Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-228 init creates a committed initialization worktree and attempts the titled PR$' \u002d\u002dtest-reporter=./.tiller/local/verify-cUstNu/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-cUstNu/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-228 init creates a committed initialization worktree and attempts the titled PR
- 用例：CASE-228
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-11.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:44.374Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands$' \u002d\u002dtest-reporter=./.tiller/local/verify-WazUZg/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-WazUZg/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands
- 用例：CASE-229
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-12.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:45.290Z

### run-13
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-230 close init-id only clears that initialization local and preserves task locals$' \u002d\u002dtest-reporter=./.tiller/local/verify-Ey1xg7/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-Ey1xg7/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-230 close init-id only clears that initialization local and preserves task locals
- 用例：CASE-230
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-13.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:46.223Z

### run-14
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-231 start blocks a pending initialization commit, supports skip and merged detection$' \u002d\u002dtest-reporter=./.tiller/local/verify-YYyAh9/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-YYyAh9/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-231 start blocks a pending initialization commit, supports skip and merged detection
- 用例：CASE-231
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-14.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:47.297Z

### run-15
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-232 usage, core and delivery document initialization order and task worktree specs$' \u002d\u002dtest-reporter=./.tiller/local/verify-TADIjm/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-TADIjm/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-4
- 测试：test/init-baseline.test.mjs::CASE-232 usage, core and delivery document initialization order and task worktree specs
- 用例：CASE-232
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-15.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:49.040Z

### run-16
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-233 initialization baseline stays at version 0\\.5\\.0 with named test coverage$' \u002d\u002dtest-reporter=./.tiller/local/verify-RBWq93/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-RBWq93/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"4237ac3afee5d9ad3ef2196819fc2807de382bd30dc29dc1e42357313623f10b","commit":"773b0d627f3064951ff3d741759bf16aaf025618"} -->
- 条件：AC-5
- 测试：test/init-baseline.test.mjs::CASE-233 initialization baseline stays at version 0.5.0 with named test coverage
- 用例：CASE-233
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261026-init-baseline/logs/run-16.log
- 提交：773b0d627f30
- 时间：2026-10-26T05:54:49.521Z

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
- 本次改动涉及模块 initialization：建议回归该模块 63 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 24 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 104 条用例及经过它的场景 CASE-055, CASE-001。
