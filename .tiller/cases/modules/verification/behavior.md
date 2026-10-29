# verification / behavior

## CASE-006 范围内变化会使既有验证过期

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/requirements.md#flow-06-处理要求和方案变化`, `.tiller/specs/modules/workflow/requirements.md#flow-09-依据验证结果判断交付`

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

### 前置条件

- 任务已有通过的当前树验证

### 步骤

1. 修改范围内代码并分别运行 check 与 resume

### 输入

- 验证后发生变化的 src 文件

### 预期结果

范围内代码变化后，check issue 和 resume stageReason 均使用验证已过期类文案

## CASE-259 历史用例无源码字段仍可解析并完成迁移

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：20261026-flow-stability#AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md`

### 前置条件

- 用例文件没有源码字段，或残留旧源码行。

### 步骤

1. 扫描全局用例库。

### 输入

- 既有用例按新模板迁移。

### 预期结果

解析不要求源码字段，旧源码行被忽略，仓库用例结构与引用有效。

## CASE-266 历史 task#AC 与空 criteria 可读且不硬阻断

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/verification/requirements.md`

### 前置条件

- 库中存在历史用例

### 步骤

1. 解析含历史关联 AC 的用例库
2. 对新模型任务执行 check
3. 跑全量门禁

### 输入

- 历史用例文件与新任务

### 预期结果

历史含 task#AC 或关联 AC 为无的用例仍可解析；check 最多 warning；版本 0.5.0；全量门禁通过

## CASE-268 稳定 AC 写在 specs 且任务用例引用 specs

- 类型：behavior
- 优先级：high
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/verification/requirements.md`, `.tiller/specs/modules/verification/case-req-link.md`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

稳定验收条件正文在 .tiller/specs；任务与用例引用 specs 条件；覆盖不依赖 taskId#AC

## CASE-341 case add 写入需求 specs 的 AC-n 并拒绝任务#AC

- 类型：behavior
- 优先级：high
- 模块：verification
- 关联 AC：AC-1, AC-2
- 需求：`.tiller/specs/modules/verification/requirements.md#7-验收条件`

### 前置条件

- 已确认任务与模块需求 specs 存在；需求文件含 `- AC-1:`、`- AC-2:` 验收条件。

### 步骤

1. 运行 `tiller case add ... --criterion AC-1 --criterion AC-2`。
2. 检查用例正文的关联 AC 与需求路径。
3. 分别尝试不存在的 AC、`任务#AC-n` 与非 specs 需求路径。

### 输入

- 合法 specs AC 列表，以及不存在、任务作用域和非 specs 的边界输入。

### 预期结果

合法输入写入 `- 关联 AC：AC-1, AC-2` 和对应 specs 路径；不存在或 `任务#AC` 被拒绝，失败时不写用例文件。

## CASE-342 历史空关联 AC 与 task#AC 保持可读

- 类型：behavior
- 优先级：medium
- 模块：verification
- 关联 AC：AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md#7-验收条件`

### 前置条件

- 用例库包含历史「关联 AC：无」、留空和 `task#AC` 记录。

### 步骤

1. 解析历史用例库并运行全量检查。
2. 核对历史记录的关联 AC 与迁移提示。

### 输入

- 既有 Markdown 用例。

### 预期结果

历史三种写法均可读取；空值与 task#AC 只产生迁移提示，不因新写入规则阻断历史用例。

## CASE-344 CRLF 工作区与 LF 提交共用 tree 摘要且不掩盖实质变化

- 类型：behavior
- 优先级：high
- 模块：verification
- 关联 AC：AC-4
- 需求：`.tiller/specs/modules/verification/requirements.md#7-验收条件`

### 前置条件

- 工程位于 Git 仓库，任务范围内的文本在提交中为 LF。
- 测试模拟 Windows 检出：工作区改为 CRLF，Git clean 后与索引无差异。
- 范围内另有一个含 NUL 字节的二进制文件。

### 步骤

1. 运行 `verify` 记录通过结果，再把文本工作区文件改为 CRLF，运行 `check`。
2. 修改二进制文件的一个字节，运行 `check` 并核对过期提示。
3. 恢复二进制内容，完成 `accept` 后再次运行 `check`。

### 输入

- 仅换行风格不同的文本、被改写一个字节的二进制，以及保持 LF blob 的验收提交。

### 预期结果

文本 CRLF 与 LF 提交产生相同 tree 摘要，`verify`、`check` 与 acceptance 复查均不因换行误报过期；二进制内容变化仍使验证过期，且既有的验收提交复查继续可用。

## CASE-349 Windows 调用真实 Java 与 pytest runner

- 类型：behavior
- 优先级：high
- 模块：verification
- 关联 AC：AC-3
- 需求：`.tiller/specs/modules/workflow/windows-fresh-hygiene.md`

### 前置条件

- Windows 或可控平台探测；mvn.cmd、gradle.bat、pytest.exe 可执行并产出私有报告；辅助脚本可扫描

### 步骤

1. 运行 junit-maven、junit-gradle 与 pytest 验证，并生成 junit CASE 适配器骨架
2. 检查 runner 构造、适配器平台分支及 helper/package smoke 的进程捕获

### 输入

- 通过、失败、跳过、工具缺失与含空格/元字符参数

### 预期结果

真实工具被调用且仅由私有报告核实；失败/缺失透传，适配器含 Windows 启动分支，辅助脚本不依赖 /bin/sh

## CASE-354 Maven 默认 Surefire 报告核实通过、失败与精确选择

- 类型：behavior
- 优先级：high
- 模块：verification
- 关联 AC：AC-1
- 需求：`.tiller/specs/modules/workflow/surefire-abandon.md`

### 前置条件

- Maven fixture 使用 Surefire 默认 target/surefire-reports 布局，仓库配置 junit-maven

### 步骤

1. 执行通过测试、失败测试与 Class#method 精确选择
2. 核对报告来源、选择器、证据与退出码

### 输入

- 两个 Maven 测试方法与只选择其中一个的调用

### 预期结果

通过与失败均从本次默认 Surefire XML 核实；精确选择器只承认 1 个声明测试，旧或缺失报告不能通过
