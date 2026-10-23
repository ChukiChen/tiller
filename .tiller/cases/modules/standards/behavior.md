# standards / behavior

## CASE-049 默认必读资料保持在 7000 字符预算内

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/rules/index.md`, `.tiller/rules/core.md`
- 源码：`resources/entry.md`, `resources/usage.md`, `resources/rules/index.md`, `resources/rules/core.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“默认必读资料保持在 7000 字符预算内”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且默认必读资料保持在 7000 字符预算内。

## CASE-059 规格目录与引导引用被物理删除

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round8#AC-1, 20261022-round8#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`test/first-batch.test.mjs`, `README.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“规格目录与引导引用被物理删除”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且规格目录与引导引用被物理删除。

## CASE-065 结构化确认语义在帮助与长期资料中同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round9#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md#3-执行规则`
- 源码：`src/cli.ts`, `resources/usage.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“结构化确认语义在帮助与长期资料中同步”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且结构化确认语义在帮助与长期资料中同步。

## CASE-074 提交、分支与 PR 规范同步后必读资料仍在预算内

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round11#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/rules/activities/delivery.md`, `resources/usage.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“提交、分支与 PR 规范同步后必读资料仍在预算内”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且提交、分支与 PR 规范同步后必读资料仍在预算内。

## CASE-084 恢复清晰的入口 usage 与规则文案

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round13#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `resources/entry.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“恢复清晰的入口 usage 与规则文案”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且恢复清晰的入口 usage 与规则文案。

## CASE-085 必读资料预算放宽到约 7000 字符

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round13#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`test/rules.test.mjs`, `.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“必读资料预算放宽到约 7000 字符”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且必读资料预算放宽到约 7000 字符。

## CASE-091 验证与必读预算文档同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round14#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `.tiller/specs/modules/workflow/requirements.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证与必读预算文档同步”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证与必读预算文档同步。

## CASE-097 验证规则与新流程同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round15#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/rules/core.md`, `resources/usage.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证规则与新流程同步”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证规则与新流程同步。

## CASE-103 历史用例与文档同步测试设计语义

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261022-round16#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`.tiller/cases/index.md`, `test/rules.test.mjs`

### 前置条件

- 历史 CASE-001..097 已迁移为 Markdown，仓库规范文件可读取。

### 步骤

1. 运行用例库与必读预算测试。
2. 检查 README、规则、usage 与 specs 的表述。

### 输入

- 仓库当前历史用例、测试套件与全套规则资料。

### 预期结果

历史用例具备设计字段，历史测试名含对应 CASE 编号；文档统一说明测试引用用例的反查方向，必读预算在 7000 字符附近，全量构建、检查、测试和打包冒烟通过。

## CASE-109 评审发布与提交锚定文档同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round17#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`README.md`, `resources/usage.md`, `.tiller/specs/decisions.md`

### 前置条件

- src、test、resources 与 .tiller 受管资料已更新。

### 步骤

1. 运行规则测试、完整测试与打包冒烟，核对必读预算和版本。

### 输入

- 当前仓库完整工作树。

### 预期结果

文档与用例同步，必读不超过预算，版本保持 0.5.0，历史任务无新的规则型阻断。
