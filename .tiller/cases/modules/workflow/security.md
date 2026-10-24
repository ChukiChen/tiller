# workflow / security

## CASE-004 范围检查分别报告越界提交和未提交改动

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-04-在授权边界内持续推进`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“范围检查分别报告越界提交和未提交改动”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且范围检查分别报告越界提交和未提交改动。

## CASE-005 开工前未变化的外部改动不会冒充本次越界

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-04-在授权边界内持续推进`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“开工前未变化的外部改动不会冒充本次越界”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且开工前未变化的外部改动不会冒充本次越界。

## CASE-009 记录中的密钥和本机绝对路径会被拒绝

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#任务记录约定`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“记录中的密钥和本机绝对路径会被拒绝”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且记录中的密钥和本机绝对路径会被拒绝。

## CASE-087 外部报告默认阻断，显式放行并在草稿标注

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：20261022-round14#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-09-依据验证结果判断交付`
- 源码：`src/flow.ts`, `src/pr.ts`, `src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“外部报告默认阻断，显式放行并在草稿标注”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且外部报告默认阻断，显式放行并在草稿标注。

## CASE-089 bugfix 必须提供基线失败与当前通过证据

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：20261022-round14#AC-4, 20261022-round15#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-24-在各环节形成测试依据并保存执行事实`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“bugfix 必须提供基线失败与当前通过证据”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且bugfix 必须提供基线失败与当前通过证据。

## CASE-093 私有报告防止伪造通过

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：20261022-round15#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `src/test-output.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“私有报告防止伪造通过”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且私有报告防止伪造通过。

## CASE-203 验证旁路不放松已核实判定

- 类型：security
- 优先级：high
- 模块：workflow
- 关联 AC：20261024-slim-verify-render#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/verification-integrity.test.mjs`

### 前置条件

- 任务验证段已有新格式人读摘要

### 步骤

1. 破坏旁路或未核实记录后运行 check

### 输入

- 缺失有效机器证据或未验收的验证记录

### 预期结果

无法还原命令、退出码、树与全量提交的记录不成为已核实，check 仍按原规则阻断
