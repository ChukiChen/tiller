# 任务开工 worktree 与关闭清日志

<!-- tiller-task:v1 {"version":1,"id":"20261024-task-worktrees","type":"feature","size":"standard","created":"2026-10-24T04:07:12.039Z","base":"14e73196e74a3bc80594db46aa1c44b80c7e6ceb","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","plan":"20261024-task-worktrees","item":"P-1","slug":"task-worktrees","summary":"start 建 local worktree，close/abandon 拆除并清日志","requirementFile":".tiller/local/20261024-task-worktrees-req.md"} -->

## 需求

### 面向谁与问题

并行开发多个 tiller 任务的人（本仓维护与外部采用者）。现状：`start` 只登记 task.md，不提供隔离工作区，多人/多任务易在同一脏目录互相干扰；`close`/`abandon` 也不清理 `.tiller/local/logs/<id>/`，本机日志堆积。用户已确认：start 在 `.tiller/local/worktrees/<任务编号>/` 建 worktree；close/abandon 拆除；须覆盖 `mode: workspace` 多仓库；日志在 close/abandon 时按任务删除。

### 目标

需求来源：`.tiller/local/20261024-task-worktrees-req.md`

`start` 即为任务创建本机 git worktree（含 workspace 下管理仓与各业务仓），分支名 `类型/任务编号[-描述]`；`close` 与 `abandon` 拆除对应 worktree，并删除该任务 verify 日志目录。布局与生命周期写入 design、usage 与 workflow specs。

### 业务范围

- 做：project 与 workspace 两种模式下的 start 建树、close/abandon 拆树与清日志；约定目录布局；返回/提示 worktree 路径；同步受管 usage/rules 与 specs；用例覆盖。
- 不做：不改版本号；不自动 commit/push/merge；不做远端托管或云端 worktree；不改造 bugfix `--expect-fail` 的临时基线 worktree；不在 reopen 时强制重建（可在设计中说明幂等补建为可选增强，本轮可不做）；不把管理仓的 `repositories/` 容器本身登记成业务仓 worktree。
- 假设与待确认：工程根与各业务仓路径均为可 `git worktree` 的 Git 仓库；分支名沿用现有 `类型/任务编号[-slug]` 约定；task.md 等共享事实仍写在管理/工程主检出的 `.tiller/`（本轮不把任务记录迁入 worktree 作为唯一副本）。

### 关键行为

1. `tiller start` 成功后，在约定路径存在已登记的 git worktree，当前分支为任务分支；命令结果给出路径列表。
2. project：单路径 `.tiller/local/worktrees/<id>/`。
3. workspace：`.tiller/local/worktrees/<id>/management` 为管理仓检出；每个已登记仓库在 `.tiller/local/worktrees/<id>/<登记相对路径>`（常见 `repositories/<repo-id>`）各有检出；分支名一致。
4. `close` / `close --abandon` 成功后上述路径不再作为 worktree 存在（或本就不存在时跳过），且 `.tiller/local/logs/<id>/` 已删除。
5. 未关闭任务的日志目录保持不动。

### 异常与边界

- 无 Git / 目标路径已占用 / 分支名冲突：start 失败并给出明确错误，不留下半套目录（能清则清）。
- 业务仓路径不是 Git 仓库：workspace start 失败。
- close/abandon 时 worktree 或日志目录已不存在：幂等成功。
- 旧任务从未建过 worktree：close/abandon 只尝试清日志，不因缺 worktree 失败。
- worktree 内有未提交改动：拆除使用强制移除策略并在设计写明，避免 close 被脏树卡住。

### 验收条件

- AC-1: project 模式下 start 在 .tiller/local/worktrees/<任务编号>/ 创建 git worktree，检出分支为 类型/任务编号[-描述]；返回路径可供后续开发
- AC-2: workspace 模式下 start 为管理仓与每个已登记业务仓创建隔离检出，路径落在 .tiller/local/worktrees/<任务编号>/ 下并镜像登记路径（management + repositories/<id> 或登记 path）；各仓使用同一任务分支名
- AC-3: close 与 abandon 拆除该任务全部 worktree（缺失则幂等跳过），并删除 .tiller/local/logs/<任务编号>/；不删除未关闭任务的日志
- AC-4: usage/rules/workflow specs 与 design 写明布局与生命周期；旧任务无 worktree 时 close/abandon 仍可清日志且不报错；用例自 CASE-196 起覆盖 project/workspace/拆除与清日志

## 规划

- 规划：20261024-task-worktrees
- 条目：P-1

## 设计

### 方案

1. **分支名**：复用现有约定，由任务 `type` + `id` + 可选 `slug` 生成 `类型/任务编号[-描述]`（与 `pr`/check 分支提示一致）。
2. **project 布局**：`git worktree add -b <分支> .tiller/local/worktrees/<id>`（若分支已存在则改为检出已有分支到该路径，或明确失败——实现取「路径已存在则失败；分支已存在则 `worktree add <path> <branch>` 不新建分支」）。基线为 start 时 HEAD（写入 meta.base 的同一时刻）。
3. **workspace 布局**（与历史隔离目录对齐并落地）：
   - 根：`.tiller/local/worktrees/<id>/`
   - 管理仓：`.../management` ← 对管理根执行 worktree add
   - 每个 `project.json.repositories[]`：`.../<repository.path>`（例如 `repositories/service-a`）← 对该业务仓根执行 worktree add
   - 各仓分支名相同。私有报告与 task.md 仍在管理工程主树的 `.tiller/`；开发者在对应 worktree 改代码，tiller 命令仍以管理根 `--path` 为准（附加 worktree 可借 `run.cjs` 找 CLI）。
4. **生命周期**：在 `startFlow` 写完 task 后创建 worktree；失败则回滚已建 worktree。`closeFlow`（含 abandon）在写入关闭记录后：按布局拆除全部相关 worktree（`git worktree remove --force` + prune），再 `rm` `.tiller/local/logs/<id>/`。可选 sidecar `.tiller/local/tasks/<id>/worktrees.json` 记录实际路径，close 优先读清单，缺省回退约定路径。
5. **文档**：更新 workflow design/requirements、usage、相关 rules；decisions 记一条长期约定。版本保持 0.5.0。

### 失败处理

- start 中途失败：删除本任务已添加的 worktree 与空父目录，不保留半套；task.md 若已写入则按现有 TASK_EXISTS 语义——优先先建树再写任务，或写任务失败时拆树；实现选「先写 task 元数据事务，再 best-effort 建树；建树失败则删 task 并报错」或「先建树再写 task」，须在测试中固定一种且可恢复。
- close 拆树失败：报告路径与 git 错误；日志目录仍尝试删除；是否阻断 close 取「记录关闭成功 + warnings」以免任务卡死，测试覆盖。
- 路径穿越与目录必须落在 `.tiller/local/worktrees/<id>/` 下，经现有安全路径校验。

### 取舍

- 采用约定目录 + 可选 sidecar，而不是把路径写入 task.md 共享标记（本机路径不应进共享事实）。
- workspace 用 `management` + 镜像 `repository.path`，与既有「repositories/ 分组、标识与路径分离」叙述一致，避免把 repo id 直接当主目录。
- close 使用 `--force` 拆除，避免脏 worktree 阻塞收尾；不在本轮做 reopen 自动重建。
- 不改变 expect-fail 临时 worktree。

### 影响与风险

- 影响：`src/flow.ts`（及可能抽出的 worktree 辅助模块）、`cli` 帮助文案、resources/usage、rules、workflow specs、测试夹具需真实 git 仓。
- 风险：测试并行创建 worktree 路径冲突；Windows 路径；workspace 夹具变重。
- 缓解：用例在临时目录 init git；CASE-196 起覆盖 project/workspace/close 清日志/旧任务无树；全量 npm test。

### 验证入口

- 自动化：`case add` 自 CASE-196；`test/task-worktrees.test.mjs`（或等价）覆盖 AC-1～AC-4；结束全量 `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package（包测试按仓库脚本）`。
- 人工：在临时 project/workspace 工程各跑一遍 start→改文件→abandon，确认目录出现与消失。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 用户原话：可以，开始吧
- 原话用途：可选附注，不替代已写明的正文
- 提交：14e73196e74a3bc80594db46aa1c44b80c7e6ceb
- 对象摘要：6a0bd9101a95f91de8cb7a1bea13fceab9fc737fbf30d4830332df5b334f6bdb
- 时间：2026-10-24T04:07:37.705Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 用户原话：可以，开始吧
- 原话用途：可选附注，不替代已写明的正文
- 提交：14e73196e74a3bc80594db46aa1c44b80c7e6ceb
- 对象摘要：b45175308e4635be20367048919f7041fe073b2450dfc02ff76006fb1fbb5f52
- 时间：2026-10-24T04:07:41.687Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：boon yu
- 用户原话：进度
- 原话用途：可选附注，不替代已写明的正文
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 对象摘要：040c1dfe87bf46f6322da85289d50d31370b19fbcc5b3e13e223f6413a7709d2
- 时间：2026-10-24T06:12:55.464Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-196 project start creates a task worktree on the task branch and returns its path
- 用例：CASE-196
- 命令：node '--test-name-pattern=^CASE-196 project start creates a task worktree on the task branch and returns its path$' --test-reporter=./.tiller/local/verify-vt1PvG/reporter.mjs --test-reporter-destination=.tiller/local/verify-vt1PvG/report.jsonl test/task-worktrees.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-task-worktrees/run-1.log
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 代码树摘要：406660f2835703e13acf88c705ea1b9af08fd798cf341073395b4e0d04dab51b
- 时间：2026-10-24T06:12:43.420Z

### run-2
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-197 workspace start mirrors management and registered repositories under one task branch
- 用例：CASE-197
- 命令：node '--test-name-pattern=^CASE-197 workspace start mirrors management and registered repositories under one task branch$' --test-reporter=./.tiller/local/verify-7EpcpJ/reporter.mjs --test-reporter-destination=.tiller/local/verify-7EpcpJ/report.jsonl test/task-worktrees.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-task-worktrees/run-2.log
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 代码树摘要：406660f2835703e13acf88c705ea1b9af08fd798cf341073395b4e0d04dab51b
- 时间：2026-10-24T06:12:44.308Z

### run-3
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-198 close and abandon force-remove every task worktree and only clear that task log
- 用例：CASE-198
- 命令：node '--test-name-pattern=^CASE-198 close and abandon force-remove every task worktree and only clear that task log$' --test-reporter=./.tiller/local/verify-kNlgPU/reporter.mjs --test-reporter-destination=.tiller/local/verify-kNlgPU/report.jsonl test/task-worktrees.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-task-worktrees/run-3.log
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 代码树摘要：406660f2835703e13acf88c705ea1b9af08fd798cf341073395b4e0d04dab51b
- 时间：2026-10-24T06:12:45.300Z

### run-4
- 条件：AC-4
- 测试：test/task-worktrees.test.mjs::CASE-199 old tasks without worktrees still close or abandon and clear their logs
- 用例：CASE-199
- 命令：node '--test-name-pattern=^CASE-199 old tasks without worktrees still close or abandon and clear their logs$' --test-reporter=./.tiller/local/verify-02iCyc/reporter.mjs --test-reporter-destination=.tiller/local/verify-02iCyc/report.jsonl test/task-worktrees.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-task-worktrees/run-4.log
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 代码树摘要：406660f2835703e13acf88c705ea1b9af08fd798cf341073395b4e0d04dab51b
- 时间：2026-10-24T06:12:46.983Z

### run-5
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-200 start failures leave no task record or partially created worktree
- 用例：CASE-200
- 命令：node '--test-name-pattern=^CASE-200 start failures leave no task record or partially created worktree$' --test-reporter=./.tiller/local/verify-4HxQC2/reporter.mjs --test-reporter-destination=.tiller/local/verify-4HxQC2/report.jsonl test/task-worktrees.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-task-worktrees/run-5.log
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 代码树摘要：406660f2835703e13acf88c705ea1b9af08fd798cf341073395b4e0d04dab51b
- 时间：2026-10-24T06:12:48.608Z

### run-6
- 条件：AC-2
- 测试：test/task-worktrees.test.mjs::CASE-200 start failures leave no task record or partially created worktree
- 用例：CASE-200
- 命令：node '--test-name-pattern=^CASE-200 start failures leave no task record or partially created worktree$' --test-reporter=./.tiller/local/verify-4HxQC2/reporter.mjs --test-reporter-destination=.tiller/local/verify-4HxQC2/report.jsonl test/task-worktrees.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261024-task-worktrees/run-5.log
- 提交：8ade9adc2293a293aba6eed5002b0b6101be6b0c
- 代码树摘要：406660f2835703e13acf88c705ea1b9af08fd798cf341073395b4e0d04dab51b
- 时间：2026-10-24T06:12:48.608Z

## 关闭

### close
- 状态：已关闭
- 原因：AC-1～AC-4 已核实；实现已合入分支 feat/20261024-task-worktrees，待开 PR
- 时间：2026-10-24T06:13:00.049Z

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
- 本次改动涉及模块 initialization：建议回归该模块 59 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 23 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 39 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 77 条用例及经过它的场景 CASE-055, CASE-001。
