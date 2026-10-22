# workflow / interface

## CASE-011 默认帮助只展示默认工作流，旧审计命令不可用

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#按目标选择流程`
- 源码：`src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“默认帮助只展示默认工作流，旧审计命令不可用”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且默认帮助只展示默认工作流，旧审计命令不可用。

## CASE-042 CLI JSON 版本输出形状和值稳定

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#按目标选择流程`
- 源码：`src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“CLI JSON 版本输出形状和值稳定”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且CLI JSON 版本输出形状和值稳定。

## CASE-043 未知命令以退出码 2 返回稳定的 JSON 错误形状

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#按目标选择流程`
- 源码：`src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“未知命令以退出码 2 返回稳定的 JSON 错误形状”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且未知命令以退出码 2 返回稳定的 JSON 错误形状。

## CASE-044 start 缺少需求或验收条件时退出码为 2 且不生成任务

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/activities/requirements.md#本次需求`, `.tiller/rules/core.md#按目标选择流程`
- 源码：`src/cli.ts`, `src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“start 缺少需求或验收条件时退出码为 2 且不生成任务”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且start 缺少需求或验收条件时退出码为 2 且不生成任务。

## CASE-047 check 汇总模块用例、场景并提示本次相关回归

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#测试与验证资料`
- 源码：`src/cases.ts`, `src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“check 汇总模块用例、场景并提示本次相关回归”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且check 汇总模块用例、场景并提示本次相关回归。

## CASE-061 规划确认可省略用户原话

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#3-规划拆分`
- 源码：`src/plans.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“规划确认可省略用户原话”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且规划确认可省略用户原话。

## CASE-068 PR 草稿包含标题、五段说明、AC 状态与建议分支

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round11#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`, `src/commit-conventions.ts`, `src/branch-conventions.ts`, `src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 草稿包含标题、五段说明、AC 状态与建议分支”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 草稿包含标题、五段说明、AC 状态与建议分支。

## CASE-069 提交主题不合规只提示并跳过合并提交

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round11#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/commit-conventions.ts`, `src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“提交主题不合规只提示并跳过合并提交”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且提交主题不合规只提示并跳过合并提交。

## CASE-070 分支名建议与校验遵循类型和任务编号

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round11#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/branch-conventions.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“分支名建议与校验遵循类型和任务编号”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且分支名建议与校验遵循类型和任务编号。

## CASE-073 提交主题校验类型、模块、中文摘要与任务链接

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round11#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/commit-conventions.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“提交主题校验类型、模块、中文摘要与任务链接”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且提交主题校验类型、模块、中文摘要与任务链接。

## CASE-075 PR 标题由范围首个模块组成并支持省略

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round12#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 标题由范围首个模块组成并支持省略”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 标题由范围首个模块组成并支持省略。

## CASE-076 建议分支描述按参数、任务元数据和当前分支优先

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round12#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/branch-conventions.ts`, `src/pr.ts`, `src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“建议分支描述按参数、任务元数据和当前分支优先”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且建议分支描述按参数、任务元数据和当前分支优先。

## CASE-080 PR 关联任务为纯文本且文案兼容 PR 与 MR

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round12#AC-5
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`, `resources/pull_request_template.md`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 关联任务为纯文本且文案兼容 PR 与 MR”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 关联任务为纯文本且文案兼容 PR 与 MR。

## CASE-083 PR 验证结果按 AC 使用普通嵌套列表

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round13#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 验证结果按 AC 使用普通嵌套列表”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 验证结果按 AC 使用普通嵌套列表。

## CASE-086 verify 只执行并记录同一命令，拒绝旧拆分参数

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round14#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-24-在各环节形成测试依据并保存执行事实`
- 源码：`src/flow.ts`, `src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“verify 只执行并记录同一命令，拒绝旧拆分参数”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且verify 只执行并记录同一命令，拒绝旧拆分参数。

## CASE-090 standard 开工必须声明范围，small 默认仓库根

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round14#AC-5
- 需求：`.tiller/specs/modules/workflow/requirements.md#2-开始与接续`
- 源码：`src/flow.ts`, `src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“standard 开工必须声明范围，small 默认仓库根”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且standard 开工必须声明范围，small 默认仓库根。

## CASE-092 自主执行并记录实际测试命令

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round15#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `src/test-output.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“自主执行并记录实际测试命令”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且自主执行并记录实际测试命令。

## CASE-101 verify case 执行全部覆盖测试

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261022-round16#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `src/cli.ts`

### 前置条件

- 任务需求已确认，用例关联当前任务 AC，且至少两个测试名引用该用例。

### 步骤

1. 运行 verify <任务> --case CASE 编号。
2. 检查执行条目、用例编号和私有报告核实状态。

### 输入

- 一个用例被两个通过的 node:test 测试覆盖。

### 预期结果

tiller 依次自主执行两个测试，写入全部条目并经私有报告核实为通过；--case 与 --test、--criterion 语义兼容。
