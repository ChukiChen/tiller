# verification / interface

## CASE-012 未绑定全局用例的验证会阻塞交付自检

- 类型：interface
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-24-在各环节形成测试依据并保存执行事实`
- 源码：`src/cases.ts`, `src/flow.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“未绑定全局用例的验证会阻塞交付自检”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且未绑定全局用例的验证会阻塞交付自检。

## CASE-045 验证测试与引用用例的测试不一致时阻塞

- 类型：interface
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/rules/quality/verification.md#记录方式`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证测试与引用用例的测试不一致时阻塞”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证测试与引用用例的测试不一致时阻塞。

## CASE-046 旧用例布局、未知类型、缺失模块和坏引用被拒绝

- 类型：interface
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/verification/requirements.md#5-当前轻量验证边界2026-10-22`
- 源码：`src/cases.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“旧用例布局、未知类型、缺失模块和坏引用被拒绝”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且旧用例布局、未知类型、缺失模块和坏引用被拒绝。

## CASE-048 全局用例按模块类型和场景组织且引用可解析

- 类型：interface
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/cases/index.md`, `.tiller/specs/modules/verification/requirements.md#5-当前轻量验证边界2026-10-22`
- 源码：`.tiller/cases/index.md`, `src/cases.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“全局用例按模块类型和场景组织且引用可解析”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且全局用例按模块类型和场景组织且引用可解析。

## CASE-053 case add 自动编号并支持模块用例与场景来源 AC

- 类型：interface
- 优先级：medium
- 模块：verification
- 关联 AC：20261022-first-batch#AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md#2-全局用例`
- 源码：`src/cases.ts`, `src/cli.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“case add 自动编号并支持模块用例与场景来源 AC”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且case add 自动编号并支持模块用例与场景来源 AC。

## CASE-099 测试扫描建立用例到测试的反查且不存引用字段

- 类型：interface
- 优先级：high
- 模块：verification
- 关联 AC：20261022-round16#AC-2
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/cases.ts`

### 前置条件

- 用例库与测试文件位于同一工程，测试文件采用当前命名约定。

### 步骤

1. 在测试名或紧邻注释中写入 CASE 编号。
2. 读取用例库并检查反查结果与用例字段。

### 输入

- 一个测试覆盖多个 CASE 编号，以及多个测试覆盖同一 CASE 编号的测试文件。

### 预期结果

tiller 扫描测试源建立 case→tests 反查；用例文件不含测试引用字段，也没有 case link 命令。

## CASE-154 文件级验证引用不绑定文件内全部测试

- 类型：interface
- 优先级：medium
- 模块：verification
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/flow.ts`, `src/cases.ts`, `test/flow-cli.test.mjs`

### 前置条件

- 任务已验证整个测试文件且该文件含多测试

### 步骤

1. 按文件引用执行验证后运行 check

### 输入

- 仅文件路径的 verify --test

### 预期结果

验证不建立用例绑定，check 指出 AC 未绑定全局用例

## CASE-169 Maven 只运行并承认声明的测试

- 类型：interface
- 优先级：high
- 模块：verification
- 关联 AC：20261023-multi-repo-verify#AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md#3-用例先行`
- 源码：`src/test-output.ts`, `test/java-runners.test.mjs`

### 前置条件

- 运行器名称为 junit-maven，且不依赖本机 JDK

### 步骤

1. 构造 Maven 测试命令
2. 解析只包含声明结果、缺失、重复、跳过、额外失败和损坏的报告

### 输入

- 类名#方法名、整个类名，以及 src/test/java 下的方法名

### 预期结果

命令使用精确的测试选择并把报告写到私有目录；只有恰好命中的声明结果可以核实，其它情况不能通过

## CASE-170 Gradle 只运行并承认声明的测试

- 类型：interface
- 优先级：high
- 模块：verification
- 关联 AC：20261023-multi-repo-verify#AC-5
- 需求：`.tiller/specs/modules/verification/requirements.md#3-用例先行`
- 源码：`src/test-output.ts`, `test/java-runners.test.mjs`

### 前置条件

- 运行器名称为 junit-gradle，且不依赖本机 JDK

### 步骤

1. 构造 Gradle 测试命令和初始化脚本
2. 解析声明结果、跳过、重复和损坏的报告

### 输入

- 类名#方法名，以及整个类名

### 预期结果

命令使用精确的测试选择并把 JUnit XML 写到私有目录；缺失、重复、跳过和额外失败都不能通过

