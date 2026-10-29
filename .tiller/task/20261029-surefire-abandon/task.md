# 修复 Surefire 默认报告与 abandon 清理

<!-- tiller-task:v1 {"version":1,"id":"20261029-surefire-abandon","type":"improvement","size":"standard","created":"2026-10-29T08:05:02.791Z","base":"aa1c4f3c087460c89954071e564e26b308806400","scope":["src","test",".tiller/specs",".tiller/cases",".tiller/context",".tiller/usage.md","resources"],"format":"structured","summary":"junit-maven 读取默认 Surefire 报告；abandon 只清理本机","requirementFile":".tiller/specs/modules/workflow/surefire-abandon.md"} -->

## 需求

### 使用场景

- 场景：Maven Surefire 3.2.5 忽略 `-Dsurefire.reportsDirectory` 时，开发者仍需要以本次默认报告核实 Java 测试；取消任务时只需清理本机隔离环境。
- 场景：已验收但未合入的任务需要放弃时，primary 不应为了记录放弃而新增任务文件或提交。

### 目标

需求来源：`.tiller/specs/modules/workflow/surefire-abandon.md`

实现 Maven 默认 Surefire 报告取证与 abandon 纯本机清理，并同步当前规格、用例、文档与回归测试。

设计见 `.tiller/specs/modules/workflow/surefire-abandon-design.md`，验收以引用的 specs AC 为准。

### 业务范围

- 做：修正 Maven 报告来源与陈旧报告隔离；收敛 abandon 为只清本机；同步 specs、CASE、usage、context 与测试。
- 不做：修复 NEW-03 Gradle 问题；改变正常 close 的合入证明；新增放弃记录落盘或跳过 check 的旁路。
- 假设与待确认：本次 Maven XML 写到仓库根下的 `target/surefire-reports`；多模块工程把实际报告模块登记为仓库根。

### 关键行为

- AC-1：junit-maven 从 Maven 默认 `target/surefire-reports` 读取本次 XML，通过、失败与精确选择器只跑一个测试均由私有证据核实。
- AC-2：`close --abandon` 只清理本机 worktree、任务目录与分支，不写 primary `task.md`/CASE，也不产生放弃提交；正常 `close` 不变。

### 异常与边界

- 默认报告缺失、损坏、零匹配或多匹配时不可核实，不能回退旧报告或伪造通过。
- abandon 后 worktree 记录消失属预期；`resume` 不再列出该任务，相关命令按记录不存在失败。
- 正常 close 缺合入证明时继续拒绝清理。

### 验收条件

- AC-1: `junit-maven` 从 Maven 默认 `target/surefire-reports` 读取本次 XML，通过、失败与精确选择器只跑一个测试均由私有证据核实
- AC-2: `close --abandon` 只清理本机 worktree、任务目录与分支，不写 primary `task.md`/CASE，也不产生放弃提交；正常 `close` 不变

## 设计

### 方案

- 运行器报告读取增加业务仓库根上下文；Maven 执行前清空默认 `target/surefire-reports`，执行后只读取该目录 XML。
- 删除 abandon 的共享任务持久化与提交，只复用现有 worktree、任务目录和分支清理；正常 close 路径不变。

### 失败处理

- 默认报告缺失、损坏或不唯一时不可核实，Maven 非零退出保留；abandon 清理按幂等处理，不再承诺 reopen。

### 取舍

- 不继续依赖无效的 reportsDirectory 参数；不以 primary 任务种子或放弃提交换取可恢复性。

### 影响与风险

- 影响 Maven 报告读取、abandon 收尾及相关 CASE/文档；Gradle、pytest 与正常 close 保持兼容。多模块 Maven 需登记实际报告模块为仓库根。

### 验证入口

- `node --test` 运行 `test/java-runners.test.mjs` 与 `test/task-worktrees.test.mjs` 的 CASE 引用测试；再执行 `npm test`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-29T08:08:07.170Z | aa1c4f3c0874 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"df9ede22d3d187f5cd1752c48cbf40daa6b3fb95af9f492c5118b4d1d095da44","commit":"aa1c4f3c087460c89954071e564e26b308806400","by":"ChukiChen","quote":"","at":"2026-10-29T08:08:07.170Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
