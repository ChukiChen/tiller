# 场景：task-lifecycle

## CASE-001 小改动只生成 task.md，并在当前验证后记录交付验收

- 类型：scenario
- 优先级：medium
- 模块：workflow, verification, initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-03-选择必要工作与验证安排`, `.tiller/specs/modules/workflow/requirements.md#flow-24-在各环节形成测试依据并保存执行事实`

### 前置条件

- 对应模块 workflow, verification, initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“小改动只生成 task.md，并在当前验证后记录交付验收”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且小改动只生成 task.md，并在当前验证后记录交付验收。
