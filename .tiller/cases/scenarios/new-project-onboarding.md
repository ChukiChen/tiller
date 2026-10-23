# 场景：new-project-onboarding

## CASE-055 空项目接入并完成默认流程

- 类型：scenario
- 优先级：medium
- 模块：initialization, workflow, verification, standards
- 关联 AC：20261022-first-batch#AC-1, 20261022-first-batch#AC-6
- 需求：`.tiller/specs/requirements.md#3-默认工作流`, `.tiller/specs/modules/standards/requirements.md`
- 源码：`src/core.ts`, `src/flow.ts`, `src/plans.ts`, `src/cases.ts`

### 前置条件

- 对应模块 initialization, workflow, verification, standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“空项目接入并完成默认流程”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且空项目接入并完成默认流程。
