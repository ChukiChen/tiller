# 跨语言 CASE 适配器标准

## 使用场景

业务测试使用 Java、Python 等 tiller 当前不扫描其测试目录的语言时，验收条件仍需要可扫描的 CASE 入口和真实执行证据。实践是用可扫描语言的适配器测试挂 `CASE-NNN`，在测试体内调用真实语言运行器；该模式需要成为受管标准，而不是每仓临时发明。

## 目标

规定「可扫描入口挂 CASE + 内部转调真实 runner」的统一做法、运行器配置、选择器约定与骨架输出，使 verify 继续通过现有 CASE 扫描与 AC→测试→CASE 路径工作。

## 业务范围

- 做：受管 specs/rules/usage 与模板说明适配器标准；给出 Node↔junit-maven（Surefire `Class#method`）参考。
- 做：`case add` 对非扫描语言运行器输出带转调占位的可扫描入口骨架。
- 不做：在本包实现 Java AST 扫描、按扩展名自动猜测语言或自动生成完整 Maven 类方法映射。
- 不做：替代真实语言的编译、测试和报告；适配器只是一层入口。

## 关键行为

1. CASE 发现仍使用现有 `test/**/*.test.*` 与 `*.spec.*` 扫描；测试名或紧邻注释写 `CASE-NNN`。
2. 一个适配器文件可挂多个 CASE；每个测试按名筛选，体内用 `spawnSync`/等价方式调用真实 runner。
3. 适配器入口必须由 `node-test`（或其他可扫描运行器）执行；真实 Java 测试由 `junit-maven`/`junit-gradle` 执行。不要依赖文件扩展名自动切换 runner；混合工程应为入口仓库配置 node-test，为 Java 仓库配置 junit runner。
4. Maven Surefire 选择器用 `-Dtest=com.example.ExampleTest#method`；Gradle 用 `--tests com.example.ExampleTest.method`。
5. 真实 runner 失败、缺失或报告不可核实即验证失败，不因适配器文件存在而假绿。
6. 纯 Node 或已扫描语言工程可直接按普通测试名挂 CASE，不强制建立适配器。

## 异常与边界

- Maven/Gradle 不在 PATH：适配器测试失败，verify 记录真实失败。
- 适配器只转调而没有 CASE 名：无法反查，不作为覆盖证据。
- 适配器不能伪造通过；仍以真实 runner 的退出码和 tiller 私有报告为准。

## 验收条件

- AC-1: 受管文档规定可扫描入口挂 CASE、内部转调真实 runner，并说明适配器入口与真实语言运行器的仓库/运行器配置
- AC-2: 给出 Node↔junit-maven 参考形态，含 Surefire `Class#method` 选择器和失败透传
- AC-3: `case add` 对 junit-maven/junit-gradle 输出带转调 TODO 的可扫描入口骨架，不要求自动完成类方法映射
- AC-4: verify 仍通过现有测试扫描与 AC→测试→CASE 记录关联适配器；真实 runner 失败不得假绿
