# Surefire 默认报告与 abandon 只清本机设计

## 方案

- 扩展测试运行器契约中的报告读取上下文：`loadReport` 接收业务仓库根，Maven 从该根下的 `target/surefire-reports` 读取 XML；`build` 不再传无效的 `-Dsurefire.reportsDirectory`，并声明执行前需清空的默认报告目录。
- `verify` 在执行前删除声明的新鲜输出目录，避免上一轮 XML 被当作本次证据；执行后仍从私有临时工作区解析，完整输出只进本机日志。
- `close --abandon` 删除 `persistAbandonedTask` 调用与实现，只保留 worktree、`.tiller/local/<id>/` 和分支清理；返回结果不再包含持久化提交或 reopen 提示。正常 close 分支保持原样。
- `cleanupTaskWorktrees` 在删除前比较调用进程 cwd 与待删 worktree、`.tiller/local/<id>/`；命中时先 `chdir` 到 primary，再按现有顺序拆除 worktree、Git 元数据、日志和任务目录。
- worktree Git 拆除和目录删除使用有限次数、短间隔的共享重试；成功降级路径保留 warning，任何重试耗尽或路径不安全的本机清理项汇总为 `TASK_CLEANUP_FAILED`，由 `closeFlow` 非零抛出。

## 失败处理

- 默认报告缺失、损坏、匹配不唯一或测试失败时保持不可核实；Maven 非零退出仍体现在验证日志和结果中。
- abandon 清理仍按幂等路径处理缺失项；非致命远端告警只返回 warning，不写共享记录。cwd 切换失败、worktree/任务目录删除失败或本地分支删除失败时停止宣称放弃并返回 `TASK_CLEANUP_FAILED`，保留仍存在的本机事实。任务记录不可读时，后续命令按 `TASK_NOT_FOUND` 失败。

## 取舍

- 不以继续传 `-Dsurefire.reportsDirectory` 作为主路径，因为目标 Surefire 版本会忽略它；也不把共享任务记录复制到 primary，因为这会重新引入未跟踪种子与收尾提交。
- 选择执行前清空默认报告目录而不是按时间过滤，以保证本次运行没有生成 XML 时不会被旧报告误判通过。
- 不把 EBUSY 或删除失败吞成 warning，也不通过重新持久化放弃记录制造可恢复假象；保留原目录与本机分支，由用户处理占用后重试。

## 影响与风险

- 影响 `src/test-output.ts` 的运行器契约、`src/task-worktrees.ts`/`src/branch-cleanup.ts` 的清理契约、`src/flow.ts` 的 verify/abandon 路径和相关 CASE、文档与测试；Gradle、pytest 与已验收正常 close 不受影响。
- 多模块 Maven 仍需把实际产出默认 Surefire 报告的模块登记为仓库根；否则报告缺失会明确失败，而不是静默通过。

## 验证入口

- 运行 `test/java-runners.test.mjs` 与 `test/task-worktrees.test.mjs` 中引用 CASE-169、CASE-353、CASE-354、CASE-317、CASE-322 及 worktree cwd 清理失败用例的具名测试；再运行 `npm test`。
