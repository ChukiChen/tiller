# Surefire 默认报告与 abandon 只清本机设计

## 方案

- 扩展测试运行器契约中的报告读取上下文：`loadReport` 接收业务仓库根，Maven 从该根下的 `target/surefire-reports` 读取 XML；`build` 不再传无效的 `-Dsurefire.reportsDirectory`，并声明执行前需清空的默认报告目录。
- `verify` 在执行前删除声明的新鲜输出目录，避免上一轮 XML 被当作本次证据；执行后仍从私有临时工作区解析，完整输出只进本机日志。
- `close --abandon` 删除 `persistAbandonedTask` 调用与实现，只保留 worktree、`.tiller/local/<id>/` 和分支清理；返回结果不再包含持久化提交或 reopen 提示。正常 close 分支保持原样。

## 失败处理

- 默认报告缺失、损坏、匹配不唯一或测试失败时保持不可核实；Maven 非零退出仍体现在验证日志和结果中。
- abandon 清理由现有幂等清理函数处理；局部告警只返回 warning，不写共享记录。任务记录不可读时，后续命令按 `TASK_NOT_FOUND` 失败。

## 取舍

- 不以继续传 `-Dsurefire.reportsDirectory` 作为主路径，因为目标 Surefire 版本会忽略它；也不把共享任务记录复制到 primary，因为这会重新引入未跟踪种子与收尾提交。
- 选择执行前清空默认报告目录而不是按时间过滤，以保证本次运行没有生成 XML 时不会被旧报告误判通过。

## 影响与风险

- 影响 `src/test-output.ts` 的运行器契约、`src/flow.ts` 的 verify/abandon 路径和相关 CASE、文档与测试；Gradle、pytest 与已验收正常 close 不受影响。
- 多模块 Maven 仍需把实际产出默认 Surefire 报告的模块登记为仓库根；否则报告缺失会明确失败，而不是静默通过。

## 验证入口

- 运行 `test/java-runners.test.mjs` 与 `test/task-worktrees.test.mjs` 中引用 CASE-169、CASE-353、CASE-354、CASE-317、CASE-322 的具名测试；再运行 `npm test`。
