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

## CASE-105 发布清单可执行并纳入检查

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round17#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/release.ts`, `src/flow.ts`, `src/cli.ts`

### 前置条件

- 任务已验收，项目具备 README、包元数据或非 npm 项目说明。

### 步骤

1. 运行 release 门禁，并查看 check 返回的发布清单。

### 输入

- 干净且满足发布准备的项目；以及缺失 README 或存在未提交范围改动的项目。

### 预期结果

release 逐项给出 pass/fail/na 并以未通过项决定退出状态；check 同时展示发布清单。

## CASE-107 从需求文件开始任务

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round17#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `src/cli.ts`

### 前置条件

- 工程内存在非空需求 Markdown，任务尚未创建。

### 步骤

1. 使用 start --requirement-file 读取需求文件。

### 输入

- 合法相对路径、越界路径、绝对路径和空文件。

### 预期结果

合法文件内容进入结构化需求并记录来源；非法路径或空文件明确报错。

## CASE-112 外部旧仓 work 仅作只读遗留读取

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-migrate-work#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#2-开始与接续`
- 源码：`src/flow.ts`

### 前置条件

- 测试工程保留 .tiller/work/<id>/work.md，但没有同 id task

### 步骤

1. 运行 resume 并启动当前 task，随后检查旧文件字节

### 输入

- 旧 work 记录与当前 task 并存

### 预期结果

旧 work 不出现在当前任务列表，内容保持只读，当前 task 正常发现

## CASE-155 默认工作流源码使用 flow 命名而非 lite

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/doc-templates.test.mjs`

### 前置条件

- 默认工作流源码和旧模块文件可检查

### 步骤

1. 读取 flow 源码并检查 lite 文件

### 输入

- src/flow.ts 与 src/lite.ts

### 预期结果

startFlow 导出存在，旧 lite 模块不存在且源码不含 lite 标识

## CASE-183 分支名缺少任务编号时 check 明确提示

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave2#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/branch-conventions.ts`, `test/flow-hardening.test.mjs`

### 前置条件

- 任务已在执行且当前分支不是 main/master

### 步骤

1. 切到不含任务编号的分支后运行 check

### 输入

- feat/flow-hardening 分支

### 预期结果

check warning 指出当前分支未包含当前任务编号，并给出类型/任务编号格式

## CASE-184 usage、help 与 AGENTS 覆盖本波约定

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave2#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/cli.ts`, `resources/usage.md`, `AGENTS.md`

### 前置条件

- 分发资源与受管入口已同步

### 步骤

1. 读取 help、usage 与 AGENTS 入口区段

### 输入

- 当前 0.5.0 资源

### 预期结果

公开入口简述过薄检查、日志可读内容和分支命名约定

## CASE-186 check 给出规格与背景回写路径及提纲

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261024-gap-closure#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 任务已有有效需求确认与改动

### 步骤

1. 在临时工程创建任务并修改业务文件
2. 运行 check 并读取 warnings

### 输入

- 包含 src 或模块改动的任务

### 预期结果

基线后未回写 specs/context 时，check 警告列出可定位路径与简短提纲，且不单独阻断 accept

## CASE-192 结构化需求模板分离业务范围与交付路径

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-doc-templates#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/flow-cli.test.mjs`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

start 生成面向谁与问题、目标、业务范围、关键行为、异常与边界、验收条件；业务范围不含 target 路径，路径只进入 meta.scope
