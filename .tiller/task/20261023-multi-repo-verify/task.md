# 多仓库验证与 Java 运行器

<!-- tiller-task:v1 {"version":1,"id":"20261023-multi-repo-verify","type":"feature","size":"standard","created":"2026-10-23T10:01:37.073Z","base":"d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173","scope":["src","test","resources",".tiller","README.md"],"preExisting":{".tiller/cases/modules/initialization/behavior.md":"ac110c81096ad5d94122ecf72384b8dface1254c738c2bc099abd395e6203c78",".tiller/cases/modules/initialization/interface.md":"201f58a825b0b4a00d513cebe0234f19e766f39dedcf17b578ef6318e297a68c",".tiller/cases/modules/initialization/security.md":"cb521716ec04116f6beb8fb52ef2a2c9196f7777dbeb155011f62cf4346a4659",".tiller/cases/modules/standards/behavior.md":"8aef1d3ba7379cdf170177dba35141d49e23f5f49af28ca8a748fbc6634df5c2",".tiller/cases/modules/verification/behavior.md":"6275aed8c2edef95f842a83cdd33f192ee61288059a65b2bde71fabe43edaf81",".tiller/cases/modules/verification/interface.md":"3ef6803aac66927e4b6d1e05d010c7907e042142a8597b4f10d9087e4634e4e3",".tiller/cases/modules/verification/security.md":"f934b8d9df493c6bb0b4f5ed96fa78fc76a8d44ed2034ff66b8144e9ef850ed9",".tiller/context/project.md":"c0953be25559e4c3825d0a9631d0a9f1456b85858b983688a64928cfd2185c88",".tiller/index.md":"4dc5c381037fb262888305d185cf75744d0aa3fc327b9c843925647c69f6d37d",".tiller/project.json":"a1123cc8ef61f19bd6023ba57410841207f736a886fdec50976d5ef15215fbe9",".tiller/rules/quality/verification.md":"edc57c9b9cd87686def61db4bfa5e7bbe9975ceb05c73105e92544c335b763fe",".tiller/specs/decisions.md":"c43eeb582a129c3b850f66aad8cdbef5230530b77b5a4d551f822fac9c5fde4b",".tiller/specs/design.md":"bea082f527c11e34191a94d9bf2b2fe1c865d1309ad59ca741731a1ed5e27418",".tiller/specs/modules/initialization/design.md":"b6010c1e249d3714a513700e8bfd28b433aeceaa446c8cf225c4b42babf101ba",".tiller/specs/modules/initialization/requirements.md":"e0dbe2dda4958b790ded6fd9ed7fe5254b6546e91422a8f922db1ce7cd384996",".tiller/specs/modules/standards/design.md":"d742dabca14b487dde8eb593ca28d5fca48262440e0cd8987f27a9f14153b0ea",".tiller/specs/modules/verification/design.md":"ab7a32812052040934e53d82d255734bbd808acd54b15faad3e60f49f740e9b7",".tiller/specs/modules/verification/requirements.md":"b394ac64a549316c6b2f4a018734de2a67723eb75c304308367c68de8573e5a4",".tiller/specs/modules/workflow/design.md":"9819bbefb8c7ebf92e7e0a15fa34d3d392da413cbeb88d6c694aeec1f6642465",".tiller/specs/modules/workflow/requirements.md":"fac88f51fefcd9aef9495682f5d2601314c36c4ecbdddb612e7606fe4ebccefc",".tiller/specs/requirements.md":"c112729d5c4d9edb535c1e56685700abbbb4bd7d0acf28ad3be8f592bb26d95c",".tiller/usage.md":"c95ebbed755bc04a9e941985710851741636dab11546463ef9920e421d9365a0","README.md":"cf8c42d50ba71b18a505c5b8e9a4da829b2acfe803ac2ab6500bc8f481c922c4","resources/rules/quality/verification.md":"edc57c9b9cd87686def61db4bfa5e7bbe9975ceb05c73105e92544c335b763fe","resources/usage.md":"c95ebbed755bc04a9e941985710851741636dab11546463ef9920e421d9365a0","src/core.ts":"b71b8f58372db44787db21dddda7c3dca108b1e13d406e3cc88f284c36cd635b","src/flow.ts":"d9da2e3916b4bb4f48e44eee39964103cc2782094333c8a7c2fb4c3955e45014","src/project-metadata.ts":"9999aadfc7f142bd5f45ac40d5159d603275e5fec64f51caf17a496e9a788376","src/repository-paths.ts":"6baecdcc9330da913f547772b496b7eb5417aa5060c77294f0af35d5a9da2738","src/test-output.ts":"137cee614d4ed762a48b91d8fe6381b22097cb52b9cc91853ec42de61727534d","src/types.ts":"7da89bc80833dd7c077c00acc088cf5fe7c3f1aec1424b89b7f3847894a87dec","test/case-redesign.test.mjs":"2f6ab103d58f414922906d561bfb04f6111e4c6f8c5fe1e3ae79569a3d33d147","test/core.test.mjs":"295bb8120e05e58b92cb7cd1756bee1634cfa9485d4c5f1a90ee250f21a1065c","test/repository-paths.test.mjs":"5a669e6e7f0d8aefed55e4c87c31a211b2be36b621df893e94847ac1a56b4e47","test/review-release.test.mjs":"d2512e6d14062703168c8a313675f0d41a1dd047e1c117d983011dc146c54f39","test/rules.test.mjs":"7e7f32c3ba5688872696e4c22b1c7a3978685981b4959cf241fb77357e3854e2","test/suites.json":"02451bebc90e0ac2ca3f9bb3532ad57b11514ba78f0eca87e64a59b85cb053c7","test/usage-resources.test.mjs":"c2065cd89c2ae59e75839e8143b0a8b19a5e3964d850dd19570412d78231b434","test/java-runners.test.mjs":"3cfabb37e182eca00774d7cf9bfb1dd6770d7e1d48a5e785c1a1e1af9fe4391b"},"format":"structured","slug":"multi-repo-java","summary":"按仓库选择 Maven 或 Gradle"} -->

## 需求

### 目标

一个管理工程登记多个业务仓库，每个仓库可以声明自己的验证运行方式和测试前准备。验证按测试文件所在仓库选择运行器，准备在该仓库根执行；归属不能唯一确定时拒绝，不按扩展名猜测语言。Java 同时支持 Maven 与 Gradle，只承认声明的测试。尚未适配的框架仍提交带理由的外部结论。版本保持 0.5.0。

### 范围

- 做：`src`、`test`、`resources`、`.tiller`、`README.md`
- 不做：`src`、`test`、`resources`、`.tiller`、`README.md` 以外的文件
- 涉及模块或文件：`src`、`test`、`resources`、`.tiller`、`README.md`

### 验收条件

- AC-1: 工作区仓库记录标识、路径和可选验证配置，旧标识列表仍可读，当前工程不登记仓库
- AC-2: 验证使用唯一所属仓库的运行器，准备在该仓库根执行，归属不明时拒绝，且不按扩展名猜测语言
- AC-3: Maven 只承认声明的测试，缺失、重复、跳过和额外失败不能通过
- AC-4: 尚未适配的框架仍可提交带理由的外部结论，版本保持 0.5.0
- AC-5: Gradle 只承认声明的测试，缺失、重复、跳过和额外失败不能通过
- AC-6: 运行器未知或测试路径不能唯一归属仓库时拒绝执行，且不按扩展名猜测语言

## 设计

### 方案

- `repositories` 写成对象数组，每项包含标识、路径和可选验证配置。运行方式与测试前准备按字段覆盖工程默认，不另建旁路映射。
- 仍可读旧的标识列表加路径映射。新初始化和升级写回对象，并去掉旁路映射。工作区至少一条仓库，当前工程必须为空。
- 验证先规范化测试路径，再取最长且唯一的已登记仓库。工作区没有匹配或等长重叠时拒绝。当前工程没有仓库时使用工程默认。准备和测试进程的工作目录是选中的业务仓库根。
- Maven 在仓库根执行 `mvn -Dsurefire.reportsDirectory=<私有目录> -Dtest=<类[#方法]> test`。Gradle 在同一目录执行 `gradle -Dtiller.junit.reports=<私有目录> --init-script <私有目录>/junit-gradle.init.gradle test --tests <类[.方法]>`。不嵌入 JVM。
- 报告只承认声明的类和方法。缺失、损坏、零个或多个匹配、跳过、同类额外失败都不能通过。其它类忽略。
- 测试用替身命令和报告解析覆盖这两条路径，不要求本机安装 JDK。尚未适配的框架继续使用带理由的外部结论。

### 取舍

- 仓库配置放在对象上，避免标识列表和旁路映射两套事实。
- 归属不能唯一确定时失败关闭，不回退到工程默认，以免在错误仓库执行。
- 不根据扩展名猜测语言；运行器只来自显式配置。
- 多模块工程若按模块目录解析相对报告路径，应把实际产出结果的模块登记为仓库根，或继续使用外部结论。

### 影响与风险

- 把仓库清单当成纯标识列表的外部读取方需要改为对象。tiller 仍能读取旧清单。
- 单模块报告目录是本版假设；多模块相对路径可能写不到私有目录。
- 版本保持 0.5.0，不新增资源契约。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 对象摘要：5520873714351e903fa1c0f65205a32f073200504f252f7c0321e82e44503224
- 时间：2026-10-23T10:03:17.707Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 对象摘要：9e3f980635f648b6852c2ae27c19a6b5dd0b4a69d6f95c0e1a584369fe4c09d1
- 时间：2026-10-23T10:03:17.769Z

## 验证

### run-1
- 条件：AC-2
- 测试：test/java-runners.test.mjs::CASE-168 workspace uses each repository runner and runs prepare in that repository
- 用例：CASE-168
- 命令：node '--test-name-pattern=^CASE-168 workspace uses each repository runner and runs prepare in that repository$' --test-reporter=./.tiller/local/verify-Y2zJBV/reporter.mjs --test-reporter-destination=.tiller/local/verify-Y2zJBV/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-1.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:00.961Z

### run-2
- 条件：AC-4
- 测试：test/java-runners.test.mjs::CASE-168 workspace uses each repository runner and runs prepare in that repository
- 用例：CASE-168
- 命令：node '--test-name-pattern=^CASE-168 workspace uses each repository runner and runs prepare in that repository$' --test-reporter=./.tiller/local/verify-Y2zJBV/reporter.mjs --test-reporter-destination=.tiller/local/verify-Y2zJBV/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-1.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:00.961Z

### run-3
- 条件：AC-3
- 测试：test/java-runners.test.mjs::CASE-169 junit-maven builds a precise selector and counts only the declared result
- 用例：CASE-169
- 命令：node '--test-name-pattern=^CASE-169 junit-maven builds a precise selector and counts only the declared result$' --test-reporter=./.tiller/local/verify-BAIqwc/reporter.mjs --test-reporter-destination=.tiller/local/verify-BAIqwc/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-3.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:02.054Z

### run-4
- 条件：AC-3
- 测试：test/java-runners.test.mjs::CASE-170 junit-gradle builds a precise selector and counts only the declared result
- 用例：CASE-170
- 命令：node '--test-name-pattern=^CASE-170 junit-gradle builds a precise selector and counts only the declared result$' --test-reporter=./.tiller/local/verify-2W6gWV/reporter.mjs --test-reporter-destination=.tiller/local/verify-2W6gWV/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-4.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:02.516Z

### run-5
- 条件：AC-1
- 测试：test/java-runners.test.mjs::CASE-171 repository records keep id and path and still read a legacy string list
- 用例：CASE-171
- 命令：node '--test-name-pattern=^CASE-171 repository records keep id and path and still read a legacy string list$' --test-reporter=./.tiller/local/verify-uw1BKm/reporter.mjs --test-reporter-destination=.tiller/local/verify-uw1BKm/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-5.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:02.950Z

### run-6
- 条件：AC-2
- 测试：test/java-runners.test.mjs::CASE-172 verify fails closed for an unknown runner or a path that is not uniquely owned
- 用例：CASE-172
- 命令：node '--test-name-pattern=^CASE-172 verify fails closed for an unknown runner or a path that is not uniquely owned$' --test-reporter=./.tiller/local/verify-e79UbQ/reporter.mjs --test-reporter-destination=.tiller/local/verify-e79UbQ/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-6.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:03.630Z

### run-7
- 条件：AC-4
- 测试：test/java-runners.test.mjs::CASE-173 decisions and usage name the Java runners and keep version 0.5.0
- 用例：CASE-173
- 命令：node '--test-name-pattern=^CASE-173 decisions and usage name the Java runners and keep version 0\.5\.0$' --test-reporter=./.tiller/local/verify-05XVXr/reporter.mjs --test-reporter-destination=.tiller/local/verify-05XVXr/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-7.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：3e7e1daad071ad50f4247c5c102242a5ddc96da2b9ccd3963079f74d1ca4b2d3
- 时间：2026-10-23T10:02:04.057Z

### run-8
- 条件：AC-1
- 测试：test/java-runners.test.mjs::CASE-171 repository records keep id and path and still read a legacy string list
- 用例：CASE-171
- 命令：node '--test-name-pattern=^CASE-171 repository records keep id and path and still read a legacy string list$' --test-reporter=./.tiller/local/verify-d3RjVn/reporter.mjs --test-reporter-destination=.tiller/local/verify-d3RjVn/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-8.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：b0773d151fe03d75b55cf279a550e0931baa4fed776ec9c36b5ca03beed1eb94
- 时间：2026-10-23T10:03:23.589Z

### run-9
- 条件：AC-2
- 测试：test/java-runners.test.mjs::CASE-168 workspace uses each repository runner and runs prepare in that repository
- 用例：CASE-168
- 命令：node '--test-name-pattern=^CASE-168 workspace uses each repository runner and runs prepare in that repository$' --test-reporter=./.tiller/local/verify-Nx8QMC/reporter.mjs --test-reporter-destination=.tiller/local/verify-Nx8QMC/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-9.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：b0773d151fe03d75b55cf279a550e0931baa4fed776ec9c36b5ca03beed1eb94
- 时间：2026-10-23T10:03:24.267Z

### run-10
- 条件：AC-3
- 测试：test/java-runners.test.mjs::CASE-169 junit-maven builds a precise selector and counts only the declared result
- 用例：CASE-169
- 命令：node '--test-name-pattern=^CASE-169 junit-maven builds a precise selector and counts only the declared result$' --test-reporter=./.tiller/local/verify-jiAZ5g/reporter.mjs --test-reporter-destination=.tiller/local/verify-jiAZ5g/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-10.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：b0773d151fe03d75b55cf279a550e0931baa4fed776ec9c36b5ca03beed1eb94
- 时间：2026-10-23T10:03:25.352Z

### run-11
- 条件：AC-5
- 测试：test/java-runners.test.mjs::CASE-170 junit-gradle builds a precise selector and counts only the declared result
- 用例：CASE-170
- 命令：node '--test-name-pattern=^CASE-170 junit-gradle builds a precise selector and counts only the declared result$' --test-reporter=./.tiller/local/verify-qcxUpK/reporter.mjs --test-reporter-destination=.tiller/local/verify-qcxUpK/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-11.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：b0773d151fe03d75b55cf279a550e0931baa4fed776ec9c36b5ca03beed1eb94
- 时间：2026-10-23T10:03:25.776Z

### run-12
- 条件：AC-6
- 测试：test/java-runners.test.mjs::CASE-172 verify fails closed for an unknown runner or a path that is not uniquely owned
- 用例：CASE-172
- 命令：node '--test-name-pattern=^CASE-172 verify fails closed for an unknown runner or a path that is not uniquely owned$' --test-reporter=./.tiller/local/verify-cBBGwB/reporter.mjs --test-reporter-destination=.tiller/local/verify-cBBGwB/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-12.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：b0773d151fe03d75b55cf279a550e0931baa4fed776ec9c36b5ca03beed1eb94
- 时间：2026-10-23T10:03:26.200Z

### run-13
- 条件：AC-4
- 测试：test/java-runners.test.mjs::CASE-173 decisions and usage name the Java runners and keep version 0.5.0
- 用例：CASE-173
- 命令：node '--test-name-pattern=^CASE-173 decisions and usage name the Java runners and keep version 0\.5\.0$' --test-reporter=./.tiller/local/verify-RUAGqu/reporter.mjs --test-reporter-destination=.tiller/local/verify-RUAGqu/report.jsonl test/java-runners.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-multi-repo-verify/run-13.log
- 提交：d69f7f13eb34cb93ee6a0e07ebf45baeb1dc2173
- 代码树摘要：b0773d151fe03d75b55cf279a550e0931baa4fed776ec9c36b5ca03beed1eb94
- 时间：2026-10-23T10:03:26.637Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [ ] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- AC-2 的验证测试 test/java-runners.test.mjs::CASE-172 verify fails closed for an unknown runner or a path that is not uniquely owned 与全局用例 CASE-168 的测试引用不一致。
- AC-3 的验证测试 test/java-runners.test.mjs::CASE-170 junit-gradle builds a precise selector and counts only the declared result 与全局用例 CASE-169 的测试引用不一致。
- AC-4 的验证测试 test/java-runners.test.mjs::CASE-173 decisions and usage name the Java runners and keep version 0.5.0 与全局用例 CASE-168 的测试引用不一致。
- 弱化测试断言：test/core.test.mjs::CASE-116 workspace groups repositories while keeping stable ids, navigation and ignore rules
- 交付范围存在未提交改动：.tiller/cases/modules/initialization/behavior.md、.tiller/cases/modules/initialization/interface.md、.tiller/cases/modules/initialization/security.md、.tiller/cases/modules/standards/behavior.md、.tiller/cases/modules/verification/behavior.md、.tiller/cases/modules/verification/interface.md、.tiller/cases/modules/verification/security.md、.tiller/context/project.md、.tiller/index.md、.tiller/project.json、.tiller/rules/quality/verification.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/initialization/design.md、.tiller/specs/modules/initialization/requirements.md、.tiller/specs/modules/standards/design.md、.tiller/specs/modules/verification/design.md、.tiller/specs/modules/verification/requirements.md、.tiller/specs/modules/workflow/design.md、.tiller/specs/modules/workflow/requirements.md、.tiller/specs/requirements.md、.tiller/usage.md、README.md、resources/rules/quality/verification.md、resources/usage.md、src/core.ts、src/flow.ts、src/project-metadata.ts、src/repository-paths.ts、src/test-output.ts、src/types.ts、test/case-redesign.test.mjs、test/core.test.mjs、test/java-runners.test.mjs、test/repository-paths.test.mjs、test/review-release.test.mjs、test/rules.test.mjs、test/suites.json、test/usage-resources.test.mjs

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 分支名应为“类型/任务编号[-简短描述]”，类型限 feat/fix/docs/refactor/test/chore，仅用小写字母、数字和连字符。
- 本次改动涉及模块 initialization：建议回归该模块 57 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 21 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 36 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 57 条用例及经过它的场景 CASE-055, CASE-001。
