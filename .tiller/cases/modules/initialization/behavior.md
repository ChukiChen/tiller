# initialization / behavior

## CASE-015 历史 work 记录只读保留，不进入当前任务列表

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/rules/core.md#任务记录约定`, `.tiller/rules/core.md#兼容与升级`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/flow-cli.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“历史 work 记录只读保留，不进入当前任务列表”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且历史 work 记录只读保留，不进入当前任务列表。

## CASE-050 空仓库初始化生成最小骨架且不覆盖已有文件

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-first-batch#AC-1, 20261022-first-batch#AC-6
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“空仓库初始化生成最小骨架且不覆盖已有文件”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且空仓库初始化生成最小骨架且不覆盖已有文件。

## CASE-051 兼容受管资源刷新未修改文件并保留用户修改

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-first-batch#AC-5
- 需求：`.tiller/specs/modules/initialization/requirements.md#4-升级`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/first-batch.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“兼容受管资源刷新未修改文件并保留用户修改”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且兼容受管资源刷新未修改文件并保留用户修改。

## CASE-071 初始化安装受管 PR 模板并保留已有模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round11#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“初始化安装受管 PR 模板并保留已有模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且初始化安装受管 PR 模板并保留已有模板。

## CASE-072 旧受管清单升级时补充 PR 模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round11#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#3-受管资源`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“旧受管清单升级时补充 PR 模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且旧受管清单升级时补充 PR 模板。

## CASE-078 初始化按平台生成 PR 或 MR 模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round12#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“初始化按平台生成 PR 或 MR 模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且初始化按平台生成 PR 或 MR 模板。

## CASE-079 升级只补齐已配置平台的合并请求模板

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round12#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md#4-升级`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/pr.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“升级只补齐已配置平台的合并请求模板”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且升级只补齐已配置平台的合并请求模板。

## CASE-095 验证运行器与准备步骤配置

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261022-round15#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/verification-integrity.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“验证运行器与准备步骤配置”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且验证运行器与准备步骤配置。

## CASE-114 初始化摘要容忍受管换行但拒绝内容变化

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 空工程可执行 initialize

### 步骤

1. 对受管文件执行换行转换并再次检查
2. 修改受管内容后再次初始化

### 输入

- 混合、CRLF、LF 三种换行以及被修改的 AGENTS.md

### 预期结果

换行差异保持 ready 且不重写；内容变化使检查失败并拒绝初始化

## CASE-115 工作区限制仓库范围且不修改业务内容

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工作区含两个 Git 仓库

### 步骤

1. 初始化工作区并尝试缩小仓库范围
2. 尝试注册越界仓库

### 输入

- 已登记仓库列表和越界路径

### 预期结果

只管理已声明仓库且不修改仓库文件，范围变化和越界输入被拒绝

## CASE-116 工作区分组仓库保持稳定编号、导航与忽略规则

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工作区含直接和分组布局的 Git 仓库

### 步骤

1. 初始化两种仓库布局并重复初始化

### 输入

- service-a、repositories/service-b

### 预期结果

仓库编号稳定，索引和忽略规则按明确映射生成且重复初始化无变化

## CASE-117 工作区拒绝歧义简写且不静默重映射编号

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工作区同时存在直接和分组同名仓库

### 步骤

1. 使用歧义简写和已登记映射的不同输入初始化

### 输入

- service-a、repositories/service-a 及绝对路径

### 预期结果

歧义输入在写元信息前被拒绝，已登记编号不会被静默改变

## CASE-120 恢复校验全部前后态并拒绝后续编辑

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 存在未完成事务和 before/after 记录

### 步骤

1. 修改事务文件后执行恢复
2. 恢复原值后再次恢复

### 输入

- 预期 after、后续用户编辑和事务记录

### 预期结果

任何不一致都阻止恢复；全部匹配时原子恢复并清除事务

## CASE-121 文件事务拒绝基线错配并串行化写入

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程锁可用且事务目标不存在

### 步骤

1. 锁内再次申请锁
2. 提交错误 before 的变更
3. 提交正确变更

### 输入

- 并发锁、错误基线和合法新文件

### 预期结果

并发锁和错误基线被拒绝，合法事务完成后不残留事务记录

## CASE-124 工作区验证真实 Git 仓库并接受 gitdir 文件

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工作区含伪 .git 目录和独立 git-dir 仓库

### 步骤

1. 初始化伪仓库
2. 初始化 separate-git-dir 仓库后删除 git 数据

### 输入

- fake 和 actual 仓库

### 预期结果

伪仓库被拒绝；有效 gitdir 仓库可登记，数据消失后检查失败

## CASE-140 当前无变更操作保留索引周边与显式仓库映射

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程或工作区已初始化

### 步骤

1. 在索引中加入前后文并运行升级预览与应用

### 输入

- 用户索引文本和 project/workspace 两种模式

### 预期结果

预览不写文件，应用无变化并保留索引周边及已登记仓库对象

## CASE-142 当前无变更操作按原始资源字节判断并容忍允许的换行转换

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程已初始化

### 步骤

1. 转换 usage 换行后应用旧计划
2. 重新规划并修改受管规则

### 输入

- CRLF/LF 转换后的 usage 和用户修改的 rules/core.md

### 预期结果

旧计划失效但重新规划无变更；受管内容仍按原始字节校验，用户修改使检查失败

## CASE-143 受管资源换行等价双向且限定分发白名单

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 分发资源中有允许换行的文件

### 步骤

1. 对白名单和普通工程文件比较 LF 与 CRLF 摘要

### 输入

- AGENTS.md、索引、模板、共享资源和普通任务文件

### 预期结果

白名单文件换行等价，实质性修改不等价，非分发文件不做换行等价

## CASE-144 资源检出换行转换保持就绪且重复初始化不改字节

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程已初始化并模拟 Git 检出换行

### 步骤

1. 按 LF 或 CRLF 改写共享资源摘要与内容后初始化

### 输入

- SHARED_RESOURCES 与两种换行

### 预期结果

检查保持就绪，重复初始化不改变字节；修改共享资源后检查失败

## CASE-145 初始化与升级接受分发资源替代换行且不重写

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 分发资源可转换为另一种换行

### 步骤

1. 新工程预置替代换行后初始化
2. 现有工程替换后升级

### 输入

- usage 与共享规则的 LF/CRLF 变体

### 预期结果

初始化和升级均接受等价换行，并保持用户提供的字节不变

## CASE-146 当前无变更操作保留每个原始字节

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程或工作区已初始化

### 步骤

1. 加入自定义规则、上下文和旧 work 文件后规划并应用当前版本升级

### 输入

- 保留文件集合及自定义索引前后文

### 预期结果

预览与应用都不写文件，元信息不变且无事务残留

## CASE-149 受管分段保留双向换行和全部节外字节

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 索引、入口和忽略文件含自定义前后文

### 步骤

1. 分别以 LF 和 CRLF 摘要规划并应用升级

### 输入

- 两种换行与自定义节外文本

### 预期结果

检查就绪，升级无变化并保持所有节外字节与换行方向

## CASE-176 构建文件引导运行器且骨架匹配配置

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：20261023-flow-hardening-wave1#AC-3
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程根存在 pom.xml、build.gradle 或 build.gradle.kts

### 步骤

1. 运行 init 并登记 case

### 输入

- Java 构建文件与任务用例参数

### 预期结果

Maven/Gradle 工程 init 写入对应 junit runner，case add 输出匹配运行器的骨架

## CASE-195 初始化为项目模块需求设计提供完整章节骨架

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261024-doc-templates#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 执行覆盖本用例的测试。
2. 核对实际结果与预期结果一致。

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

init 生成的项目 requirements.md 与 design.md 及 modules/README.md 包含完整章节标题和简短写作提示，不覆盖已有文件且无长示例

## CASE-228 init 创建初始化 worktree、提交并尝试开 PR

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：20261026-init-baseline#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程有 Git 提交，托管 CLI 可调用

### 步骤

1. 运行 tiller init
2. 检查 init-id worktree、分支、提交和 PR 调用

### 输入

- 已有 HEAD 的工程

### 预期结果

创建 .tiller/local/<YYYYMMDD-tiller-init>/worktrees，分支为 chore/tiller-init，提交受管初始化改动，并以固定标题尝试创建 PR/MR，不自动合入

## CASE-229 init 开 PR 失败时保留本地并返回 token/API 下一步

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：20261026-init-baseline#AC-2
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程有 Git 提交，但 REST API 推送或 PR/MR 创建失败

### 步骤

1. 运行 tiller init 并令 PR 创建失败

### 输入

- 无远程、token 缺失或 mock API 返回失败

### 预期结果

初始化 worktree 和提交仍保留，结果给出 token 环境变量、REST API 下一步及失败原因

## CASE-239 init-id merge 合入初始化分支并清理 local

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：20261026-readme-merge-close#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 初始化基线待合入，存在 chore/tiller-init 的本机 worktree，mock REST API 合入成功

### 步骤

1. 运行 tiller merge <init-id>，随后运行 start

### 输入

- 初始化任务编号与模拟成功的 GitHub API

### 预期结果

调用 GitHub REST API 以 squash 合入 chore/tiller-init；成功后 initBaseline 标为 merged、删除该 init local，后续 start 不再被初始化门禁阻断

## CASE-253 init 基线经平台 API 确认已合入后放行 start

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261026-flow-stability#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 初始化基线为 pending，平台 API 可查到同分支已合入 PR/MR。

### 步骤

1. 运行 start 且未使用 --skip-init-gate。

### 输入

- 旧基线提交不是当前 HEAD 祖先，但平台记录已合入。

### 预期结果

start 放行，project.json 基线状态更新为 merged。

## CASE-256 close init-id 后默认删除初始化本地与远端分支

- 类型：behavior
- 优先级：medium
- 模块：initialization
- 关联 AC：20261026-flow-stability#AC-2
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 初始化基线的 chore/tiller-init 分支存在本地与远端。

### 步骤

1. 运行 close <init-id>。

### 输入

- 关闭已完成且未使用 --keep-branch。

### 预期结果

初始化本机目录与 chore/tiller-init 本地、远端分支均被删除。

## CASE-305 init 受管产物只落 init worktree

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/soft-friction2-init-verify.md`

### 前置条件

- 空仓库有可提交 HEAD；可创建 worktree。

### 步骤

1. 运行 `tiller init --platform github`（带 token/mock）。
2. 检查 primary 工作区与 init worktree。

### 输入

- 合法远端与 token。

### 预期结果

primary 对受管文件（含 `.tiller/project.json`、AGENTS.md、usage 等）无未跟踪残留；全部 init 产物仅在 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees` 的提交中；local `baseline.json` 记录 pending 基线。

## CASE-320 fresh clone 在 init 已 squash 合入且分支删除后仍可证明基线

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/hygiene-invariants.md#2026-10-28-整包收口不变式`

### 前置条件

- init PR 已 squash 合入默认分支，远端与本地 `chore/tiller-init` 已删除。
- fresh clone 没有 `.tiller/local/init-baseline-merged.json`，只能读取跟踪的 `project.json`、Git 元信息和只读平台证据。

### 步骤

1. 在 fresh clone 中运行 `tiller doctor` 和 `tiller start <id> ...`。
2. 删除平台合入证据后再次运行 `tiller close <init-id> --reason "..."`。
3. 检查 init worktree、本机目录和分支是否仍保留。

### 输入

- squash 后的默认分支、已删除的 init 分支、跟踪的 init 基线 head 引用与平台已合入 PR/MR。

### 预期结果

doctor/start 仅凭跟踪元信息与平台证据放行；证明失败时 close 返回稳定错误且不清理任何 init 事实，不把未证明写成已关闭。

## CASE-321 init 基线与 PR head 可追踪且提交可区分

- 类型：behavior
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md#2-初始化`

### 前置条件

- 仓库有可提交 HEAD，可创建 init worktree，GitHub/GitLab mock 可创建 PR/MR。

### 步骤

1. 运行 `tiller init`。
2. 检查跟踪的 `project.json`、返回的 initBaseline 与 worktree 提交历史。
3. 在分支删除后解析跟踪元信息中的 head 引用。

### 输入

- 正常初始化的空仓库。

### 预期结果

跟踪元信息包含可解析到 squash 前 PR head 的稳定引用；第二个提交标题与基线提交不同或收敛为单个提交；init PR 标题包含 init id，能区分重复初始化。

