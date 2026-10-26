# workflow / behavior

## CASE-002 标准开发任务在需求确认后仍需设计确认

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-03-选择必要工作与验证安排`, `.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“标准开发任务在需求确认后仍需设计确认”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且标准开发任务在需求确认后仍需设计确认。

## CASE-003 需求和范围变化会使命中旧确认失效

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-02-明确要求与交付边界`, `.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“需求和范围变化会使命中旧确认失效”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且需求和范围变化会使命中旧确认失效。

## CASE-010 未通过技术自检的任务不能记录交付验收

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-09-依据验证结果判断交付`, `.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“未通过技术自检的任务不能记录交付验收”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且未通过技术自检的任务不能记录交付验收。

## CASE-013 需求确认绑定已写明的需求正文，正文变化后确认失效

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#人工确认`, `.tiller/rules/core.md#任务记录约定`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“需求确认绑定已写明的需求正文，正文变化后确认失效”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且需求确认绑定已写明的需求正文，正文变化后确认失效。

## CASE-014 用户原话不能替代缺失的需求正文

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：`.tiller/rules/core.md#人工确认`, `.tiller/rules/activities/requirements.md#确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“用户原话不能替代缺失的需求正文”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且用户原话不能替代缺失的需求正文。

## CASE-052 规划依赖阻塞、未覆盖需求提示与正文失效

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-first-batch#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#3-规划拆分`
- 源码：`src/plans.ts`, `src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“规划依赖阻塞、未覆盖需求提示与正文失效”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且规划依赖阻塞、未覆盖需求提示与正文失效。

## CASE-056 任务阶段由记录事实推导并在失效时回退

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round8#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-25-从事实推导任务阶段`, `.tiller/specs/modules/workflow/requirements.md#flow-09-依据验证结果判断交付`
- 源码：`src/flow.ts`, `src/plans.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“任务阶段由记录事实推导并在失效时回退”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且任务阶段由记录事实推导并在失效时回退。

## CASE-057 已验收任务关闭后阻塞推进并可重新打开

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round8#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-26-关闭放弃与恢复`, `.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“已验收任务关闭后阻塞推进并可重新打开”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且已验收任务关闭后阻塞推进并可重新打开。

## CASE-058 放弃任务不污染规划统计且可恢复

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round8#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md#3-规划拆分`, `.tiller/specs/modules/workflow/requirements.md#flow-26-关闭放弃与恢复`
- 源码：`src/plans.ts`, `src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“放弃任务不污染规划统计且可恢复”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且放弃任务不污染规划统计且可恢复。

## CASE-060 无原话确认自动记录确认人

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“无原话确认自动记录确认人”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且无原话确认自动记录确认人。

## CASE-062 结构化任务模板在确认前校验必填段落

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#2-开始与接续`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“结构化任务模板在确认前校验必填段落”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且结构化任务模板在确认前校验必填段落。

## CASE-063 需求与设计确认使用独立摘要

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-06-处理要求和方案变化`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“需求与设计确认使用独立摘要”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且需求与设计确认使用独立摘要。

## CASE-064 旧任务正文与旧确认记录保持有效

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md#4-任务记录`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“旧任务正文与旧确认记录保持有效”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且旧任务正文与旧确认记录保持有效。

## CASE-066 验收确认可省略原话并记录验收人

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验收确认可省略原话并记录验收人”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验收确认可省略原话并记录验收人。

## CASE-067 设计确认要求方案与影响非空

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round9#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-27-结构化正文与去原话确认`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“设计确认要求方案与影响非空”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且设计确认要求方案与影响非空。

## CASE-077 PR 验证结果按验收条件列出全部记录

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round12#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 验证结果按验收条件列出全部记录”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 验证结果按验收条件列出全部记录。

## CASE-081 PR 标题摘要按显式、元数据、提交、任务标题回退

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round13#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`, `src/flow.ts`, `src/cli.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 标题摘要按显式、元数据、提交、任务标题回退”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 标题摘要按显式、元数据、提交、任务标题回退。

## CASE-082 PR 变更内容按提交时间正序

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round13#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`src/pr.ts`, `src/commit-conventions.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“PR 变更内容按提交时间正序”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且PR 变更内容按提交时间正序。

## CASE-088 按 node:test 输出核实具名测试与文件结果

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round14#AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md#3-用例先行`
- 源码：`src/flow.ts`, `src/test-output.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“按 node:test 输出核实具名测试与文件结果”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且按 node:test 输出核实具名测试与文件结果。

## CASE-094 失败先行复用私有报告适配器

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round15#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `src/test-output.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“失败先行复用私有报告适配器”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且失败先行复用私有报告适配器。

## CASE-096 验证摘要与详细日志

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round15#AC-5
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 对应模块 workflow 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证摘要与详细日志”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证摘要与详细日志。

## CASE-098 用例先于测试登记完整测试设计

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261022-round16#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/cases.ts`, `src/cli.ts`

### 前置条件

- 已确认任务的 AC-1 与 workflow 模块规范存在。

### 步骤

1. 在该任务尚未创建任何测试文件时执行 case add。
2. 读取生成的 Markdown 用例并核对设计字段。

### 输入

- 任务 20261022-round16、workflow/behavior、标题、AC-1、预期结果与源码路径。

### 预期结果

用例获得稳定 CASE 编号，Markdown 含前置条件、步骤、输入、预期结果、类型、优先级和关联 AC；命令不要求测试引用，返回待实现状态与测试骨架。

## CASE-102 check 分阶段要求用例与引用测试

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261022-round16#AC-5
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 一个任务的需求与设计确认有效，验收条件带编号。

### 步骤

1. 设计确认后先运行 check，再登记缺字段或用例未实现的用例。
2. 验证后运行 check，核对引用测试、当前核实和新鲜度要求。

### 输入

- 无用例、缺少预期结果、无测试引用、验证缺失或过期等阶段输入。

### 预期结果

设计阶段要求每个 AC 有具备预期结果等关键字段的用例；验证或验收阶段要求每个用例至少一个引用测试，且相关验证当前通过、已核实、未过期。

## CASE-104 评审发现持久化并阻塞验收

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-round17#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `src/cli.ts`

### 前置条件

- 任务已进入验收前阶段，评审人可运行 review。

### 步骤

1. 记录阻塞发现，执行 accept；清除发现后再次验收。

### 输入

- 带阻塞发现与已解决发现的 task.md。

### 预期结果

发现写入 task.md；未解决阻塞存在时 accept 失败，清除后可验收。

## CASE-110 历史 work 记录迁入结构化 task

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-migrate-work#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#4-任务记录`
- 源码：`test/work-migration.test.mjs`

### 前置条件

- 仓库基于 aed8a9b，迁移前存在 .tiller/work 历史目录

### 步骤

1. 读取迁移映射与每个 .tiller/task/<id>/task.md
2. 核对原 work.md 标题、历史正文与附属文件引用

### 输入

- 迁移前 17 个 work 目录的标识清单

### 预期结果

17 个同 id task.md 均存在，保留原历史内容且不伪造确认、验证或验收

## CASE-111 现行文档与初始化只使用 task 目录

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-migrate-work#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md#4-任务记录`, `.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`test/work-migration.test.mjs`

### 前置条件

- 空工程可由 initialize 建立骨架

### 步骤

1. 检查 README、usage、rules、context、specs、index 与 generated skeleton

### 输入

- 当前仓库和全新初始化工程

### 预期结果

文档不再把 work 表述为现行模型，初始化不创建 work 目录或列出 work 分类

## CASE-158 回填任务记录保留测试名到 CASE 的映射表

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-case-backfill#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`.tiller/task/20261023-case-backfill/task.md`, `test/case-redesign.test.mjs`

### 前置条件

- 任务 20261023-case-backfill 已实现回填

### 步骤

1. 读取 .tiller/task/20261023-case-backfill/task.md 映射节

### 输入

- 映射表正文

### 预期结果

task.md 含「映射」节，列出文件::旧测试名到 CASE 的复用或新建及理由

## CASE-163 近期已验收任务完成关闭且不伪造遗留验收

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261023-hygiene-p1p2#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md#6-任务阶段与结束`
- 源码：`.tiller/task/20261023-hygiene-p1p2/task.md`, `test/rules.test.mjs`

### 前置条件

- 近期任务已验收且未关闭

### 步骤

1. 执行 close 后读取 resume 的任务阶段

### 输入

- first-batch、round8/9/11-17、migrate-work、case-backfill、specs-pure-req

### 预期结果

上述任务均为已关闭，迁移遗留任务未被伪造为已验收

## CASE-166 本地陈旧分支清理保留主分支且不触碰远端

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-hygiene-p1p2#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md#5-提交与-prmr-草稿`
- 源码：`.tiller/task/20261023-hygiene-p1p2/task.md`, `test/rules.test.mjs`

### 前置条件

- 本地存在已合入的 codex、backup 与旧 round 分支

### 步骤

1. 删除点名的本地陈旧分支后列出 refs/heads

### 输入

- 当前仓库本地分支列表

### 预期结果

陈旧分支不再存在，main 与当前任务分支保留，远端分支未被删除

## CASE-174 缺少日期前缀的任务编号得到明确警告

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave1#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-id.ts`, `src/flow.ts`, `resources/usage.md`

### 前置条件

- 工程已初始化且任务编号合法但无日期前缀

### 步骤

1. 以无日期前缀编号执行 start

### 输入

- 任务编号 legacy-task

### 预期结果

start 返回 YYYYMMDD- 前缀警告，保留原任务编号不改写，公开示例均带日期前缀

## CASE-175 设计确认前验证与确认后未提交业务改动可见

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave1#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- standard 任务需求和设计均可确认，Git 工作区可用

### 步骤

1. 设计确认前执行 verify，并在确认提交后修改业务文件

### 输入

- 验证早于设计确认；src 文件未提交

### 预期结果

verify 仍可执行；check 汇总过程卫生 issue 并阻断默认 accept

## CASE-178 日期前缀过程卫生与运行器引导共享回归入口

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave1#AC-5
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`test/flow-hardening.test.mjs`, `package.json`

### 前置条件

- 实现已完成且构建产物可用

### 步骤

1. 运行新增具名测试与全量 npm 验证脚本

### 输入

- 全量构建、lint、类型检查、测试和包冒烟

### 预期结果

新增行为均有具名测试并通过全量验证

## CASE-179 标准任务设计的空白或占位字段产生可定位提示

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave2#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/flow-hardening.test.mjs`

### 前置条件

- 存在已确认的 standard 任务

### 步骤

1. 将设计字段改为空白或占位后运行 check

### 输入

- 空白设计与 TODO 占位设计

### 预期结果

check 对空白或占位的方案、取舍、影响与风险逐字段给出指向 task.md 的 warning，且不单独阻断

## CASE-180 decisions 与模块设计空壳在 check 中可定位预警

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave2#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/flow-hardening.test.mjs`

### 前置条件

- 工程包含 specs/decisions.md 和本任务涉及模块

### 步骤

1. 写入空壳 decisions 与模块 design 后运行 check

### 输入

- 仅标题和引导文字的两类规格文件

### 预期结果

decisions.md 无有效决定条目、任务涉及模块的 design.md 仅有标题时，check 分别给出带路径的 warning

## CASE-185 流程硬化第二波用例与版本保持一致

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261023-flow-hardening-wave2#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`test/flow-hardening.test.mjs`, `package.json`, `.tiller/project.json`

### 前置条件

- 第二波实现和测试已完成

### 步骤

1. 扫描测试引用与版本字段

### 输入

- 测试目录、package.json 和 project.json

### 预期结果

CASE-179 至 CASE-185 均有具名测试引用，包与资源版本保持 0.5.0

## CASE-187 同一 AC 或 CASE 连续失败后停止自动重试

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261024-gap-closure#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 任务有两条可失败验证或一个关联用例

### 步骤

1. 连续执行两次失败验证
2. 运行 check 并读取停止提示
3. 执行一次成功验证后再运行 check

### 输入

- 失败与成功的验证记录

### 预期结果

同一 AC 或 CASE 连续两次失败且无成功核实后，verify 与 check 给出 FLOW-05 停止提示；成功核实清零

## CASE-190 新任务标记省略开工前摘要并写入本机旁路

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-doc-templates#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/doc-templates.test.mjs`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

新 task.md 的 tiller-task 标记不含 preExisting，开工前脏文件摘要保存在 .tiller/local/tasks/<id>/pre-existing.json

## CASE-191 旧标记与旁路摘要兼容且不误报超范围

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-doc-templates#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/doc-templates.test.mjs`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

旧标记内的 preExisting 仍被解析，旁路摘要可过滤开工前脏文件，check 不误报超出范围

## CASE-193 需求确认拒绝关键章节空白或占位

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-doc-templates#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/doc-templates.test.mjs`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

confirm requirements 对空白或占位关键章节返回可定位缺失，旧任务仅有范围章节仍可确认

## CASE-194 设计模板与确认校验覆盖失败处理验证入口

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-doc-templates#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/doc-templates.test.mjs`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

standard 设计模板包含方案、失败处理、取舍、影响与风险、验证入口，空白或占位关键节在 confirm design 与 check 中可定位

## CASE-196 project 模式 start 创建任务 worktree

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-task-worktrees#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `test/task-worktrees.test.mjs`

### 前置条件

- 临时 Git 工程已有提交

### 步骤

1. 在 project 工程执行 start
2. 读取结果并用 Git 核对路径和当前分支

### 输入

- 带 type 与可选 slug 的任务

### 预期结果

start 在 .tiller/local/worktrees/<id>/ 创建分支为类型/任务编号[-描述]的 Git worktree，并在结果中返回路径

## CASE-198 close 与 abandon 强拆 worktree 并清理本任务日志

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-task-worktrees#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `test/task-worktrees.test.mjs`

### 前置条件

- 两个任务各有 worktree 与日志，另有未关闭任务日志

### 步骤

1. 关闭已验收任务并放弃另一任务
2. 核对 worktree 与本任务日志消失，旁观任务日志仍在

### 输入

- 含未提交改动的 worktree

### 预期结果

close 与 close --abandon 删除该任务全部 worktree 和 .tiller/local/logs/<id>/，其他任务日志保持

## CASE-199 旧任务无 worktree 时 close 与 abandon 仍清理日志

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-task-worktrees#AC-4
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `test/task-worktrees.test.mjs`

### 前置条件

- 任务记录存在但 worktree 与本机清单均不存在

### 步骤

1. 为旧任务准备日志目录
2. 分别执行 close 与 close --abandon

### 输入

- 缺少 worktree 的任务

### 预期结果

worktree 缺失按幂等跳过，close/abandon 成功并删除既有日志目录

## CASE-200 start 建树失败不留半套

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-task-worktrees#AC-1, 20261024-task-worktrees#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `test/task-worktrees.test.mjs`

### 前置条件

- project 目标路径已存在；workspace 一个业务仓不是 Git 仓库；另有环境无法执行 Git

### 步骤

1. 分别在冲突路径、失效业务仓与无 Git 环境执行 start
2. 核对错误码、task.md 与 management 路径

### 输入

- 冲突路径、失效业务仓与缺失 Git

### 预期结果

目标路径已占用、workspace 业务仓非 Git 或 Git 不可用时 start 失败，不写 task.md，也不遗留已建 worktree

## CASE-202 旧版冗长验证块仍可解析与复用

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261024-slim-verify-render#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/verification-integrity.test.mjs`

### 前置条件

- 任务记录只含旧版命令、退出码和代码树摘要子弹

### 步骤

1. 读取任务并运行 check

### 输入

- 无机器旁路的旧版验证记录

### 预期结果

旧版字段仍被解析为同一验证事实，check 不因格式旧而误报或放宽

## CASE-205 旧版冗长确认块仍可解析

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-taskmd-cleanup#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/flow-cli.test.mjs`

### 前置条件

- 任务记录只含旧版 ## 确认 bullet 且无机器旁路

### 步骤

1. 读取任务并执行 check
2. 核对需求确认状态与摘要

### 输入

- 旧版对象、用户原话、提交、对象摘要和时间字段

### 预期结果

旧版确认被解析为同一门禁事实，check 不误报失效，也不放宽摘要或字段校验

## CASE-206 关单后自检收起长提示但 check 仍报告

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261024-taskmd-cleanup#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`, `test/review-release.test.mjs`

### 前置条件

- 已验收任务触发模块回归与规格回写提示

### 步骤

1. 执行 check 并读取 warnings
2. 执行 close 后读取 task.md 的 ## 自检

### 输入

- 已验收且 specs 未回写的任务

### 预期结果

check 的 warnings 仍包含回归与回写提示；关单写入的 ## 自检 不堆这些长提示，只保留短检查项或运行指引

## CASE-210 workspace 任务本机目录保留 management 与登记路径

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-local-task-layout#AC-2
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`

### 前置条件

- workspace 已登记多个业务仓

### 步骤

1. start 一个 workspace 任务

### 输入

- 任务编号为 20261026-layout-workspace

### 预期结果

management 和各 repository.path 均位于 .tiller/local/<id>/worktrees 下并使用同一任务分支

## CASE-211 close 与 abandon 删除新布局整个任务目录

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-local-task-layout#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`, `src/flow.ts`

### 前置条件

- 新布局任务已创建 worktree、日志和旁路

### 步骤

1. 分别执行 close 与 close --abandon

### 输入

- 已验收任务和未验收任务各一个

### 预期结果

任务 worktree 被拆除，整棵 .tiller/local/<id> 删除，其他任务目录保留

## CASE-212 close 兼容清理旧布局旁路

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-local-task-layout#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/task-worktrees.ts`

### 前置条件

- 进行中任务仍使用旧三棵树布局

### 步骤

1. 执行 close 或 close --abandon

### 输入

- 旧 worktree、logs 与 tasks 旁路，允许部分缺失

### 预期结果

旧 worktree 可拆除，旧 .tiller/local/worktrees|logs|tasks/<id> 均清理，缺失幂等且不删其他任务

## CASE-216 pr 阻断本任务未提交记录

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/pr.ts`, `test/pr.test.mjs`

### 前置条件

- 任务已确认且工作树可读取

### 步骤

1. 修改本任务 task.md 或范围内 cases/specs 后运行 pr

### 输入

- 本任务记录相对 HEAD 有未提交改动

### 预期结果

pr 以 PR_TASK_RECORDS_DIRTY 失败并列出记录路径

## CASE-217 pr 在任务记录已提交后生成草稿

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/pr.ts`, `test/pr.test.mjs`

### 前置条件

- 本任务记录与范围内 cases/specs 已提交

### 步骤

1. 运行 pr 并读取五段草稿

### 输入

- 干净工作树

### 预期结果

pr 成功生成既有五段 PR/MR 草稿

## CASE-218 其他任务脏记录不阻断本任务 pr

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/pr.ts`, `test/pr.test.mjs`

### 前置条件

- 本任务记录干净，另一任务 task.md 有未提交改动

### 步骤

1. 运行本任务 pr

### 输入

- 仅其他任务 .tiller/task/<other>/ 变脏

### 预期结果

本任务 pr 成功且不把其他任务路径列为阻断项

## CASE-219 无 Git 工作树时 pr 跳过记录门禁并提示

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/pr.ts`, `test/pr.test.mjs`

### 前置条件

- 任务记录存在但 Git 工作树不可读取

### 步骤

1. 运行 pr 并读取 warnings

### 输入

- 移除 Git 元数据后的任务工作树

### 预期结果

pr 不因记录门禁失败，并在 warnings 说明无法读取未提交改动

## CASE-221 已关闭任务收尾记录随本分支提交

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：20261026-pr-task-sync#AC-3
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`.tiller/task/20261026-local-task-layout/task.md`

### 前置条件

- 本任务分支包含该关闭任务的 task.md 清理提交

### 步骤

1. 读取已关闭任务 task.md
2. 断言含验收与关闭事实

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

仓库中 .tiller/task/20261026-local-task-layout/task.md 含验收与关闭记录，且相对 HEAD 已提交
