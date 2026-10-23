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
