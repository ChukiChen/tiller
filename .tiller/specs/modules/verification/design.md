# 验证与反馈设计

## 1. 用例文件

模块用例位于 `.tiller/cases/modules/<模块>/{behavior,interface,performance,security}.md`，跨模块流程位于 `.tiller/cases/scenarios/<场景>.md`，均使用 Markdown。例如：

```md
## CASE-050 用例标题

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：`20261022-task#AC-1`
- 需求：`.tiller/specs/modules/workflow/requirements.md`

### 前置条件
### 步骤
### 输入
### 预期结果
```

场景使用同一格式，类型为 `scenario` 并声明经过的 `modules`。读取器解析固定字段，校验模块、类型白名单、编号唯一和必备测试设计字段。

## 2. 编号、写入与反查

`case add` 在工程锁内只扫描用例二级标题中的已有 `CASE-NNN`，取最大编号加一；正文中的示例编号不占用编号。编号跨模块和场景全局唯一，不复用。写入前校验任务存在且 AC 属于该任务，模块在 specs 中存在，类型合法，需求引用非空；不保存源码字段或测试引用。场景模块取重复 `--module`。

测试扫描器遍历 `test/**/*.test.*` 与 `*.spec.*`，解析 `test`/`it` 名称，并读取测试前紧邻注释中的 `CASE-NNN`。扫描结果构成 case→tests 反查；一个测试可关联多个编号，一个用例可保留多个测试。未知编号写入用例库错误；无引用用例标记待实现。

## 3. 回归提示

按模块统计行为、接口、性能和安全用例数。比较本次 Git 变更与模块 specs、模块用例文件、用例需求引用和测试路径；命中时提示该模块用例数及经过它的场景。未被任何场景覆盖的模块只提示，不阻塞。

## 4. 检查算法

`check` 按任务阶段读取用例库：

1. 需求/设计确认后，每条 AC 必须映射至少一个带完整设计字段的用例；
2. 有验证记录后，每个用例必须有至少一个测试名或紧邻注释引用它；
3. 校验最新验证覆盖对应测试、结果为 passed、代码树等于当前树且测试文件仍存在；
4. 校验执行证据已核实；外部报告有理由且仅在 `--allow-reported` 时放行；bugfix 的 `--expect-fail` 失败先行测试与当前通过测试一致；
5. 校验用例 `criteria` 包含 `<task>#<AC>`，除非用例相对任务基线新增或修改；
6. 把覆盖状态写入结果和 task 自检。

已验收任务的“当前树”取对象摘要仍有效的 acceptance 确认中的提交：`git ls-tree` 列出范围，`git show` 读取文件摘要；测试存在性、范围 diff 和测试弱化也以该提交为端点。提交不可读时回退工作区并告警。未验收或验收失效的任务不固定端点，继续核对工作区/HEAD 和未提交改动。钉住提交不跳过执行证据、外部报告理由或 bugfix 证据检查。

结构错误、缺失用例、待实现测试、缺失测试和错配是阻塞项；历史空 criteria、无 Git、未覆盖场景、提交或分支格式不合规是提示。验证树变化时，检查结果与恢复阶段说明都明确标为“验证已过期”。

测试运行由 `project.json` 的 `verify.runner` 选择已注册适配器，缺省为 node-test；`verify.prepare` 在测试前执行，参数数组为空或准备失败即验证失败。已注册名称还有 `junit-maven` 和 `junit-gradle`。选择顺序是：测试文件路径 → 唯一拥有该路径的已登记仓库 → 该仓库的 runner，缺项回退到根级 `verify`。工作区没有匹配或匹配长度相同的多个仓库时失败关闭；`mode: project` 且仓库为空时使用根配置。准备命令的 cwd 是选中的业务仓库根，私有报告仍在管理工程的 `.tiller/local/`。`--reported` 继续服务尚未适配的框架。

## 6. Java 运行器

`junit-maven` 与 `junit-gradle` 都由 tiller 拉起子进程，不嵌入 JVM。测试引用仍是 `路径::名称`。名称用 `com.example.BillingTest#addsInvoice` 或整个类名；没有 `#` 且不含点时，仅当路径位于 `src/test/java/` 下才从路径得到类名并把名称当作方法。扩展名本身不参与选择运行器。

Maven 在业务仓库根执行 `mvn -Dsurefire.reportsDirectory=<相对私有目录> -Dtest=<类[#方法]> test`。Gradle 在同一目录执行 `gradle -Dtiller.junit.reports=<相对私有目录> --init-script <相对私有目录>/junit-gradle.init.gradle test --tests <类[.方法]>`，初始化脚本把 JUnit XML 写到该私有目录。多模块工程若按各自模块目录解析相对报告路径，应把实际出测试结果的模块登记为仓库根，或继续使用 `--reported`。

报告只承认声明的类（以及声明的方法）。缺失、损坏、0 个或多个匹配、跳过、同类额外失败都不能核实为通过；其它类的用例不计入本次声明，和 node-test 忽略其它文件一样。真实命令不依赖本仓库安装 JDK：单模块 Maven 工程在仓库根执行上面的 `mvn -Dtest=... test`，Gradle 工程执行上面的 `gradle test --tests ...`。

基线后没有 `.tiller/specs/` 或 `.tiller/context/` 变化时增加回写提示，不并入阻塞项。

## 5. 边界

该模块不提交原始输出、自举工程、安装包和全文文件快照。`verify` 只接受 `--test` 或 `--case`；子进程输出只写 `.tiller/local/<id>/logs/`，默认不显示，`--verbose` 时同时转发；日志至少记录显示命令、开始与结束时间和退出码，判定只读私有临时报告。`src/test-output.ts` 暴露 `TestRunner` 的构造命令与报告解析接口并注册适配器，`src/test-reporter.ts` 生成仅含测试事件和总结的 JSONL 报告。无法本机执行时使用 `verify --reported --command ... --result ... --reason`，`--allow-reported` 才放行；缺陷修复使用 `--expect-fail --test`。需要复查时从 `task.md` 的人读摘要与机器旁路取命令、提交、代码树和日志定位，并从 Git 或重跑取得事实。
