# initialization / behavior

## CASE-015 历史 work 记录只读保留，不进入当前任务列表

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/rules/core.md#任务记录约定`, `.tiller/rules/core.md#兼容与升级`
- 源码：`src/flow.ts`, `src/core.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“历史 work 记录只读保留，不进入当前任务列表”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且历史 work 记录只读保留，不进入当前任务列表。

## CASE-050 空仓库初始化生成最小骨架且不覆盖已有文件

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-first-batch#AC-1, 20261022-first-batch#AC-6
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`
- 源码：`src/core.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“空仓库初始化生成最小骨架且不覆盖已有文件”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且空仓库初始化生成最小骨架且不覆盖已有文件。

## CASE-051 兼容受管资源刷新未修改文件并保留用户修改

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-first-batch#AC-5
- 需求：`.tiller/specs/modules/initialization/requirements.md#4-升级`
- 源码：`src/upgrade.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“兼容受管资源刷新未修改文件并保留用户修改”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且兼容受管资源刷新未修改文件并保留用户修改。

## CASE-071 初始化安装受管 PR 模板并保留已有模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round11#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`
- 源码：`src/core.ts`, `resources/pull_request_template.md`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“初始化安装受管 PR 模板并保留已有模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且初始化安装受管 PR 模板并保留已有模板。

## CASE-072 旧受管清单升级时补充 PR 模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round11#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#3-受管资源`
- 源码：`src/upgrade.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“旧受管清单升级时补充 PR 模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且旧受管清单升级时补充 PR 模板。

## CASE-078 初始化按平台生成 PR 或 MR 模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round12#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`
- 源码：`src/core.ts`, `src/project-metadata.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“初始化按平台生成 PR 或 MR 模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且初始化按平台生成 PR 或 MR 模板。

## CASE-079 升级只补齐已配置平台的合并请求模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round12#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#4-升级`
- 源码：`src/upgrade.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“升级只补齐已配置平台的合并请求模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且升级只补齐已配置平台的合并请求模板。

## CASE-095 验证运行器与准备步骤配置

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round15#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/project-metadata.ts`, `src/flow.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证运行器与准备步骤配置”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证运行器与准备步骤配置。
