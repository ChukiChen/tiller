# verification / behavior

## CASE-006 范围内变化会使既有验证过期

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-06-处理要求和方案变化`, `.tiller/specs/modules/workflow/requirements.md#flow-09-依据验证结果判断交付`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“范围内变化会使既有验证过期”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且范围内变化会使既有验证过期。

## CASE-007 删除断言或新增跳过测试会阻塞交付自检

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-24-在各环节形成测试依据并保存执行事实`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“删除断言或新增跳过测试会阻塞交付自检”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且删除断言或新增跳过测试会阻塞交付自检。

## CASE-008 功能下线删除测试会提示，但保留测试的断言损失仍会阻塞

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-05-处理失败与阻碍`, `.tiller/specs/modules/workflow/requirements.md#flow-24-在各环节形成测试依据并保存执行事实`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“功能下线删除测试会提示，但保留测试的断言损失仍会阻塞”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且功能下线删除测试会提示，但保留测试的断言损失仍会阻塞。

## CASE-054 check 阻塞未回指当前 AC 的全局用例

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261022-first-batch#AC-4
- 需求：`.tiller/specs/modules/verification/requirements.md#4-检查`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 verification 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“check 阻塞未回指当前 AC 的全局用例”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且check 阻塞未回指当前 AC 的全局用例。
