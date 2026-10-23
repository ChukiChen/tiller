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

## CASE-106 规格未回写时检查告警

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261022-round17#AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 任务基线之后没有 .tiller/specs 或 .tiller/context 的回写提交。

### 步骤

1. 运行 check 并读取 warnings。

### 输入

- 只改代码与测试、未同步长期结论的任务。

### 预期结果

check 给出 specs 回写告警，但不新增阻断。

## CASE-108 已验收任务按验收提交检查

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261022-round17#AC-5
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/flow.ts`, `src/test-output.ts`

### 前置条件

- 任务在提交 A 验收，之后代码漂移到提交 B。

### 步骤

1. 在提交 B 运行 check，并对照验收提交 A 的树与测试文件。

### 输入

- 验收时完整、后续代码变化的已验收任务；以及验收时验证不完整的任务。

### 预期结果

前者不因后续漂移误报验证过期；后者仍失败且原因指向验收时的问题。

## CASE-156 仓库用例库无悬空 CASE 引用且夹具编号保留

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261023-case-backfill#AC-2
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`test/case-redesign.test.mjs`, `src/cases.ts`

### 前置条件

- 已完成历史测试 CASE 回填

### 步骤

1. 扫描仓库用例库与测试名中的 CASE 引用

### 输入

- 当前分支 .tiller/cases 与 test/

### 预期结果

真实仓库用例扫描无悬空 CASE 引用；CASE-900/901/999 夹具保持不动；待实现旧用例可无测试

## CASE-168 按所属仓库选择运行器并在仓库根准备

- 类型：behavior
- 优先级：high
- 模块：verification
- 关联 AC：20261023-multi-repo-verify#AC-2
- 需求：`.tiller/specs/modules/verification/requirements.md#3-用例先行`
- 源码：`src/flow.ts`, `src/test-output.ts`, `test/java-runners.test.mjs`

### 前置条件

- 管理工程登记了多个业务仓库，仓库之间的运行方式可以不同

### 步骤

1. 对每个仓库执行其测试引用
2. 对不属于任何仓库的测试执行外部结论

### 输入

- Maven 仓库、Gradle 仓库、Node 仓库，以及未登记路径

### 预期结果

每个测试使用所属仓库的运行器；准备步骤的工作目录是该仓库根；未登记路径拒绝执行；尚未适配的框架仍可提交带理由的外部结论

## CASE-181 verify 日志记录命令、起止时间与退出码

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261023-flow-hardening-wave2#AC-2
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/flow.ts`, `test/verification-integrity.test.mjs`

### 前置条件

- 已确认任务和可用 node-test 测试

### 步骤

1. 执行 verify 后读取记录的本机日志

### 输入

- 无 stdout/stderr 的成功测试

### 预期结果

日志不是单行命令，包含显示命令、开始与结束时间以及退出码

## CASE-182 check 与 resume 明确报告验证已过期

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261023-flow-hardening-wave2#AC-2
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/flow.ts`, `test/flow-hardening.test.mjs`

### 前置条件

- 任务已有通过的当前树验证

### 步骤

1. 修改范围内代码并分别运行 check 与 resume

### 输入

- 验证后发生变化的 src 文件

### 预期结果

范围内代码变化后，check issue 和 resume stageReason 均使用验证已过期类文案
