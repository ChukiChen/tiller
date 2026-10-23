# standards / behavior

## CASE-049 默认必读资料保持在 7000 字符预算内

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/rules/index.md`, `.tiller/rules/core.md`
- 源码：`resources/entry.md`, `resources/usage.md`, `resources/rules/index.md`, `resources/rules/core.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“默认必读资料保持在 7000 字符预算内”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且默认必读资料保持在 7000 字符预算内。

## CASE-059 规格目录与引导引用被物理删除

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round8#AC-1, 20261022-round8#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`test/first-batch.test.mjs`, `README.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“规格目录与引导引用被物理删除”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且规格目录与引导引用被物理删除。

## CASE-065 结构化确认语义在帮助与长期资料中同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round9#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md#3-执行规则`
- 源码：`src/cli.ts`, `resources/usage.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“结构化确认语义在帮助与长期资料中同步”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且结构化确认语义在帮助与长期资料中同步。

## CASE-074 提交、分支与 PR 规范同步后必读资料仍在预算内

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round11#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/rules/activities/delivery.md`, `resources/usage.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“提交、分支与 PR 规范同步后必读资料仍在预算内”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且提交、分支与 PR 规范同步后必读资料仍在预算内。

## CASE-084 恢复清晰的入口 usage 与规则文案

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round13#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `resources/entry.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“恢复清晰的入口 usage 与规则文案”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且恢复清晰的入口 usage 与规则文案。

## CASE-085 必读资料预算放宽到约 7000 字符

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round13#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`test/rules.test.mjs`, `.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“必读资料预算放宽到约 7000 字符”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且必读资料预算放宽到约 7000 字符。

## CASE-091 验证与必读预算文档同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round14#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `.tiller/specs/modules/workflow/requirements.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证与必读预算文档同步”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证与必读预算文档同步。

## CASE-097 验证规则与新流程同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round15#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/rules/core.md`, `resources/usage.md`

### 前置条件

- 对应模块 standards 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/rules.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证规则与新流程同步”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证规则与新流程同步。

## CASE-103 历史用例与文档同步测试设计语义

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261022-round16#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`.tiller/cases/index.md`, `test/rules.test.mjs`

### 前置条件

- 历史 CASE-001..097 已迁移为 Markdown，仓库规范文件可读取。

### 步骤

1. 运行用例库与必读预算测试。
2. 检查 README、规则、usage 与 specs 的表述。

### 输入

- 仓库当前历史用例、测试套件与全套规则资料。

### 预期结果

历史用例具备设计字段，历史测试名含对应 CASE 编号；文档统一说明测试引用用例的反查方向，必读预算在 7000 字符附近，全量构建、检查、测试和打包冒烟通过。

## CASE-109 评审发布与提交锚定文档同步

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261022-round17#AC-6
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`README.md`, `resources/usage.md`, `.tiller/specs/decisions.md`

### 前置条件

- src、test、resources 与 .tiller 受管资料已更新。

### 步骤

1. 运行规则测试、完整测试与打包冒烟，核对必读预算和版本。

### 输入

- 当前仓库完整工作树。

### 预期结果

文档与用例同步，必读不超过预算，版本保持 0.5.0，历史任务无新的规则型阻断。

## CASE-113 迁移不改变 0.5.0 发布契约

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261023-migrate-work#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`test/work-migration.test.mjs`

### 前置条件

- 包版本、CLI 常量与资源版本均为 0.5.0

### 步骤

1. 读取 package.json、构建产物常量和项目元信息

### 输入

- 当前迁移分支

### 预期结果

三处版本均为 0.5.0，全量验证入口保持可用

## CASE-151 活动规则约束需求设计实现与交付边界

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/rules/activities/requirements.md`, `resources/rules/activities/design.md`, `resources/rules/activities/implementation.md`, `resources/rules/activities/delivery.md`, `test/rules.test.mjs`

### 前置条件

- 分发资源中的活动规则可读取

### 步骤

1. 读取需求、设计、实现和交付规则

### 输入

- 当前活动规则文件

### 预期结果

需求包含行为接口边界，设计比较候选方案，实现限制范围并在连续失败后停止，交付核对测试与授权

## CASE-157 回填后保持 0.5.0 发布契约与全量验证入口

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261023-case-backfill#AC-3
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`test/work-migration.test.mjs`, `package.json`

### 前置条件

- 回填仅改测试名与用例，未改版本号

### 步骤

1. 读取 package.json、CLI 常量与项目资源版本并核对脚本

### 输入

- 当前分支包元信息

### 预期结果

package.json、CLI 与资源版本仍为 0.5.0；test 与 test:package 脚本入口仍可用

## CASE-159 规格需求只保留业务能力与验收方向

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261023-specs-pure-req#AC-1
- 需求：`.tiller/specs/requirements.md`
- 源码：`test/rules.test.mjs`

### 前置条件

- 总体与四个模块的规格需求可读取

### 步骤

1. 读取五份 requirements.md 并检查是否混入技术契约

### 输入

- 当前规格需求正文

### 预期结果

不出现 CLI 开关、仓库实现路径、测试框架或报告内部细节、源码模块名、提交或分支字符串格式，也没有范围内或范围外专节

## CASE-160 迁出的技术契约由对应设计承接

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261023-specs-pure-req#AC-2
- 需求：`.tiller/specs/requirements.md`
- 源码：`test/rules.test.mjs`

### 前置条件

- 需求与设计文件均可读取

### 步骤

1. 对照需求迁出项检查总体与四个模块的设计

### 输入

- 当前 design.md 正文

### 预期结果

CLI 参数、实现路径、测试执行细节、源码模块、提交与分支格式，以及原有产品行为约束均可在对应设计中定位

## CASE-161 规则文档与用例引用仍符合纯化需求

- 类型：behavior
- 优先级：medium
- 模块：standards
- 关联 AC：20261023-specs-pure-req#AC-3
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`.tiller/cases/index.md`, `test/rules.test.mjs`

### 前置条件

- 规则、使用指引、README、工程索引与全局用例可读取

### 步骤

1. 检查文档是否仍把技术细节当作规格需求，并解析用例引用

### 输入

- 当前文档与用例库

### 预期结果

不矛盾的文档保持原文，引用继续有效；纯化口径与规则和用例判定一致

## CASE-162 0.5.0 全量验证入口保持可用

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261023-specs-pure-req#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`package.json`, `test/rules.test.mjs`

### 前置条件

- 包元信息与测试脚本可读取

### 步骤

1. 核对版本以及 build、lint、typecheck、test 和包冒烟入口

### 输入

- 当前 package.json 与项目配置

### 预期结果

版本仍为 0.5.0，五个全量验证入口存在并可执行

## CASE-164 历史空 AC 长期提示且禁止伪造回填

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261023-hygiene-p1p2#AC-2
- 需求：`.tiller/specs/modules/standards/requirements.md#3-执行规则`
- 源码：`.tiller/specs/decisions.md`, `test/rules.test.mjs`

### 前置条件

- 历史用例中存在未绑定来源 AC 的用例

### 步骤

1. 读取长期决定并统计历史空来源用例

### 输入

- decisions.md 与全局用例库

### 预期结果

决定明确接受长期 warn、不批量回填；历史空来源用例保持原状

## CASE-165 项目规则与背景对齐 0.5.0 且无旧流程引导

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261023-hygiene-p1p2#AC-3
- 需求：`.tiller/specs/modules/standards/requirements.md#2-必读与按需读取`
- 源码：`.tiller/rules/project.md`, `.tiller/context/project.md`, `test/rules.test.mjs`

### 前置条件

- 项目规则与背景可读取

### 步骤

1. 检查版本、当前流程和遗留目录表述

### 输入

- rules/project.md 与 context/project.md

### 预期结果

均描述 0.5.0 当前能力，不引导 archive、旧 work 流程或历史待验收状态

## CASE-167 README 只保留能力、流程与验证入口

- 类型：behavior
- 优先级：high
- 模块：standards
- 关联 AC：20261023-hygiene-p1p2#AC-5
- 需求：`.tiller/specs/requirements.md#3-默认工作流`
- 源码：`README.md`, `test/rules.test.mjs`

### 前置条件

- README 可读取且版本为 0.5.0

### 步骤

1. 检查默认流程、能力说明和内部实现细节

### 输入

- README.md

### 预期结果

保留工作流、验证与升级能力，削减参数表、内部实现路径和框架细节，版本仍为 0.5.0
