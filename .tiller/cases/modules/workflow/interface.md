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

## CASE-197 workspace 模式 start 镜像管理仓与业务仓布局

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-task-worktrees#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `test/task-worktrees.test.mjs`

### 前置条件

- 管理仓与业务仓均为有提交的 Git 仓库

### 步骤

1. 初始化 workspace 并执行 start
2. 核对 management、repositories/<id> 与分支名

### 输入

- 至少两个已登记业务仓

### 预期结果

管理仓检出到 management，各业务仓检出到其登记 path；各仓同名任务分支，task.md 仍在管理主树

## CASE-201 验证段以人读摘要渲染并在旁路保留机器证据

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261024-slim-verify-render#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/verification-integrity.test.mjs`

### 前置条件

- 任务已完成一次由 tiller 执行的验证

### 步骤

1. 读取 task.md 的验证段

### 输入

- 已核实的 node-test 验证记录

### 预期结果

人读段含条件、测试、用例、结果、来源、核实、日志、短提交与时间，不含命令、退出码、reporter 路径或树摘要；旁路含命令、退出码、树和全量提交

## CASE-204 新确认段为紧凑表并保留机器旁路

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-taskmd-cleanup#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/flow-cli.test.mjs`

### 前置条件

- 任务存在待确认的结构化正文

### 步骤

1. 执行 confirm 写入需求确认
2. 读取 task.md 的确认段并重新 resume

### 输入

- 带确认人和可选原话的需求确认

### 预期结果

确认段为部分|确认人|时间|短提交|原话的 Markdown 表，并有可还原 gate/object/subject/commit/by/quote/at 的 tiller-confirm:v1 旁路；确认摘要校验保持有效

## CASE-207 需求设计模板与规则去噪保钉

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-taskmd-cleanup#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `resources/rules/quality/documents.md`, `.tiller/rules/quality/documents.md`

### 前置条件

- 新建 standard 任务且已初始化受管规则

### 步骤

1. 读取 start 生成的需求和设计注释
2. 读取 resources 与 .tiller/rules 的 QUALITY-DOC、ACT-REQ、ACT-DES

### 输入

- 包含交付范围和验证入口的任务

### 预期结果

注释与规则强调业务约束，避免交付路径枚举、长命令菜谱和 specs 全文复述；默认模板仍缺业务正文，空壳确认继续被拒绝，AC 与确认门禁保留

## CASE-208 slug 已是任务编号后缀时分支不双拼

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-taskmd-cleanup#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/branch-conventions.ts`, `src/task-worktrees.ts`, `test/pr.test.mjs`, `test/task-worktrees.test.mjs`

### 前置条件

- 任务编号已包含描述，start 或 pr 再传相同 slug

### 步骤

1. 生成建议分支并创建任务 worktree
2. 核对 worktree 路径

### 输入

- id 为 20261024-slim-verify-render，slug 为 slim-verify-render 或有额外描述

### 预期结果

slug 是任务编号的 -<slug> 后缀时分支为 类型/任务编号；额外描述仍追加；worktree 路径只使用任务编号一次

## CASE-209 project 任务本机目录按任务聚合

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-local-task-layout#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `src/flow.ts`

### 前置条件

- Git 工程已初始化且基线已提交

### 步骤

1. start 一个 project 任务

### 输入

- 任务编号为 20261026-layout-project

### 预期结果

git worktree 位于 .tiller/local/<id>/worktrees，worktrees.json、pre-existing.json 与 logs 同属 .tiller/local/<id>，旧三棵树不创建

## CASE-214 旧开工前旁路按新后旧读取

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-local-task-layout#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 任务同时存在新旧开工前改动摘要

### 步骤

1. 读取任务并随后移除新旁路

### 输入

- 新旧 pre-existing.json 内容不同

### 预期结果

同时存在时采用新布局，新缺失时回退旧布局且摘要有效

## CASE-215 文档与规格写明任务本机目录布局与 close 生命周期

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-local-task-layout#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `test/usage-resources.test.mjs`

### 前置条件

- 受管 usage/rules 与 workflow specs 已随本任务更新

### 步骤

1. 阅读 usage、core/delivery 规则与 workflow requirements/design、decisions
2. 确认写路径与 close 清理语义与实现一致

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

usage、rules、workflow specs 与 decisions 描述 .tiller/local/<id>/ 聚合布局，以及 close/abandon 删除整棵任务目录并兼容旧路径

## CASE-220 交付文档写明 pr 前提交任务记录

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`resources/usage.md`, `resources/rules/activities/delivery.md`, `.tiller/specs/decisions.md`

### 前置条件

- 受管 usage、delivery 规则与长期决定已更新

### 步骤

1. 阅读 usage、delivery 与 decisions

### 输入

- 按任务交付流程阅读文档

### 预期结果

文档写明 verify/check 与 cases/specs 回写后先提交任务记录再 pr，合入后收尾修改需另提交

## CASE-222 全量质量门禁通过且版本保持 0.5.0

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`package.json`, `README.md`, `test/pr.test.mjs`, `scripts/package-smoke.mjs`

### 前置条件

- 实现与文档已合入本分支

### 步骤

1. 读取 package.json 与 README 版本
2. 断言为 0.5.0 且 PR 相关测试存在

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

package.json 与 README 版本为 0.5.0；定向 pr 测试与 package-smoke 覆盖门禁相关断言

## CASE-225 交付文档固化合入后冻结约定

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-post-merge-freeze#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-35-prmr-前同步任务记录`
- 源码：`resources/usage.md`, `resources/rules/activities/delivery.md`, `.tiller/specs/decisions.md`, `test/pr.test.mjs`

### 前置条件

- usage、delivery 规则、workflow 规格与 decisions 已更新

### 步骤

1. 阅读 usage、delivery、workflow requirements/design 与 decisions

### 输入

- 按标准交付链阅读文档

### 预期结果

文档写明 accept 在 pr 前、合入即交付完成、合入后 close 只清 local 且不再改写共享 task.md，且不再要求合入后 accept 或另作收尾提交

## CASE-227 版本保持 0.5.0 且质量门禁覆盖冻结行为

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-post-merge-freeze#AC-5
- 需求：`.tiller/specs/modules/workflow/requirements.md#7-验收方向`
- 源码：`package.json`, `README.md`, `test/pr.test.mjs`, `test/review-release.test.mjs`

### 前置条件

- 实现、文档与用例已更新

### 步骤

1. 读取版本并运行全量 build、lint、typecheck、test 与 test:package

### 输入

- 本任务分支

### 预期结果

package.json 与 README 版本保持 0.5.0，全量质量命令通过且测试引用冻结行为用例

## CASE-231 start 初始化基线未合入时阻断并支持跳过

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-init-baseline#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/init-baseline.ts`, `src/flow.ts`, `src/cli.ts`, `test/init-baseline.test.mjs`

### 前置条件

- project.json 含未合入的 initBaseline

### 步骤

1. 默认运行 start
2. 使用 --skip-init-gate 重试
3. 将初始化提交合入 HEAD 后再次 start

### 输入

- 待合入、跳过和已合入三种状态

### 预期结果

未合入默认返回 INIT_BASELINE_PENDING；--skip-init-gate 放行并警告；commit 成为 HEAD 祖先或 status=merged 后放行

## CASE-234 README 面向最终用户的介绍与快速开始

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-readme-merge-close#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`README.md`

### 前置条件

- 仓库根 README 可读取

### 步骤

1. 读取 README 的结构与关键文案

### 输入

- 根目录 README.md

### 预期结果

README 只保留介绍与快速开始，包含安装包安装、初始化 PR 标题、合入后 git pull、用 AI 开发功能与用户关键确认；合入与本机清理由 AI 按约定完成，不展开 merge/close 手敲细节；不含决策、npm 未发布或维护者资料堆砌

## CASE-251 文档与 help 以 token/API 为主并记录 push 选择

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-api-remote-ops#AC-1, 20261026-api-remote-ops#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`README.md`, `resources/usage.md`, `resources/rules/core.md`, `resources/rules/activities/delivery.md`, `src/cli.ts`, `.tiller/specs/decisions.md`, `test/merge.test.mjs`, `test/init-baseline.test.mjs`

### 前置条件

- 实现、资源和 decisions 已更新

### 步骤

1. 读取 README、usage、core、delivery、CLI help 与 decisions
2. 核对镜像和关键词

### 输入

- resources、.tiller 与 src/cli.ts 的当前文本

### 预期结果

README/usage/core/delivery/CLI help 说明 GitHub/GitLab token 环境变量与 REST API，不以安装平台 CLI 为主路径；resources 与 .tiller 镜像一致；decisions 写明 GitHub 纯 Git Data API 与 GitLab tokenized HTTPS git push 的传输回退

## CASE-252 API 远端操作保持 0.5.0 且打包模块同步

- 类型：interface
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-api-remote-ops#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`package.json`, `.tiller/project.json`, `scripts/package-smoke.mjs`, `test/merge.test.mjs`, `test/rules.test.mjs`

### 前置条件

- 实现、用例和文档已完成

### 步骤

1. 读取版本与 package-smoke expectedModules
2. 运行全量质量命令并核对 CASE-048 用例总数和模块分布

### 输入

- 本任务分支与临时 npm 缓存

### 预期结果

package.json、project.json 与 CLI 版本均为 0.5.0；发行包以 platform-api 替换 platform-cli；全量 build、lint、typecheck、test、test:package 通过且 CASE-048 计数同步
