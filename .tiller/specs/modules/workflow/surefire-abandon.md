# Surefire 默认报告与 abandon 只清本机

## 使用场景

- Java 工程使用 Maven Surefire 3.2.5 等不会把 `-Dsurefire.reportsDirectory` 当作实际输出目录的版本时，`tiller verify` 仍应从 Maven 默认的 `target/surefire-reports` 取得本次测试 XML，而不是把未生效的命令行参数当作证据来源。
- 开发者取消未验收或已验收但未合入的任务时，`close --abandon` 只负责拆除本机隔离环境；不应为了保留放弃状态而向 primary 写入任务记录或提交。

## 目标

- `junit-maven` 精确选择测试并从 Maven 默认 Surefire 报告目录核实通过、失败与唯一命中。
- `close --abandon` 只清理本机 worktree、任务目录与分支，不写共享 `task.md`/CASE，也不产生放弃提交。
- 已验收任务的正常 `close` 合入证明与本机清理语义保持不变。

## 业务范围

- 做：修正 Maven 报告来源与陈旧报告隔离；收敛 abandon 路径；同步 specs、CASE、usage、context 与回归测试。
- 不做：修复 NEW-03 的 Gradle 启动问题；改变正常 `close` 的合入证明；新增放弃记录落盘或跳过 `check` 的旁路。
- 假设与待确认：Maven 将本次 Surefire XML 写到仓库根下的 `target/surefire-reports`；多模块工程应把实际产出报告的模块登记为验证仓库根。

## 关键行为

### SV-AB-1 Maven 默认报告取证

- `junit-maven` 使用精确的 `-Dtest=<类[#方法]>` 选择器执行 `mvn test`，不依赖未生效的 `-Dsurefire.reportsDirectory`。
- 执行前清理该仓库默认 Surefire 报告目录，执行后只读取 `target/surefire-reports/*.xml`；旧报告不得让缺失或失败的新执行被误判为通过。
- 通过、失败、跳过、报告缺失或损坏都按现有唯一匹配与证据规则判定；失败命令的非零退出码继续保留在日志与验证事实中。

### SV-AB-2 abandon 只清本机

- `close --abandon` 不要求 primary 可写，不调用放弃持久化，不新增或修改 `.tiller/task/<id>/task.md` 与 `.tiller/cases/`，也不创建“放弃任务”提交。
- 放弃路径拆除任务 worktree、删除 `.tiller/local/<id>/` 并清理任务分支；结果只描述本次本机清理，不再提示或承诺 `reopen`。
- 正在读取的 worktree 任务记录随本机目录一起消失属预期；之后 `resume` 不含该任务，`confirm`、`verify`、`accept` 与 `reopen` 因记录不存在而失败。
- 已验收任务的正常 `close` 仍先验证合入证明，再只做本机清理；已合入并进入默认分支的跟踪记录保持可读。

## 异常与边界

- 默认 Surefire 报告目录缺失、损坏、零匹配或多匹配时不可核实；不能回退读取上一轮报告。
- Maven 非零退出、准备失败或工具缺失都失败；不得因报告解析成功而掩盖命令失败。
- abandon 的 worktree、目录或分支已缺失时按幂等清理处理；单个清理告警不虚构共享放弃状态，也不回写 primary。
- 记录已在默认分支跟踪时，正常 `close` 不删除该记录；没有合入证明时仍拒绝正常 `close`。

## 验收条件

- AC-1: `junit-maven` 从 Maven 默认 `target/surefire-reports` 读取本次 XML，通过、失败与精确选择器只跑一个测试均由私有证据核实
- AC-2: `close --abandon` 只清理本机 worktree、任务目录与分支，不写 primary `task.md`/CASE，也不产生放弃提交；正常 `close` 不变
