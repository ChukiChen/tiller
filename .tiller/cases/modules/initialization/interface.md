# initialization / interface

## CASE-152 仓库路径保留显式直接与分组布局

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 元信息用对象登记直接目录与分组目录

### 步骤

1. 解析直接、分组和根仓库路径
2. 查询未登记仓库

### 输入

- service-a、repositories/service-a、根路径和 missing

### 预期结果

直接与分组映射原样返回，根路径为点，未知仓库明确报错

## CASE-171 仓库清单使用对象并仍可读旧的标识列表

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：20261023-multi-repo-verify#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md#3-受管资源`

### 前置条件

- 新工程按对象登记仓库；历史元信息可能仍是标识列表加路径映射

### 步骤

1. 初始化当前工程和工作区
2. 读取带验证配置的对象，并把旧清单升级为对象

### 输入

- 空的当前工程、带验证配置的仓库对象，以及标识列表加路径映射

### 预期结果

新元信息只保留标识、路径和可选验证配置；旧清单仍可读取并在升级时写成对象；当前工程不登记仓库

## CASE-230 close init-id 只清理该初始化 local

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：20261026-init-baseline#AC-2
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 初始化 worktree 与其他任务 local 同时存在

### 步骤

1. 运行 tiller close <init-id> --reason

### 输入

- 初始化编号与普通任务编号

### 预期结果

删除 .tiller/local/<init-id>/ 及其 worktree 登记，不影响其他任务 local

## CASE-232 接入文档写明初始化 PR 顺序与 specs 位置

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：20261026-init-baseline#AC-4
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 受管 usage 和 delivery/core 文档已分发

### 步骤

1. 读取 resources 与项目内镜像

### 输入

- init → 初始化 PR → 人工合入 → start

### 预期结果

文档写明初始化 PR、人工合入、start 门禁、close init-id 清理，以及 specs 仅在任务 worktree 修改并随任务分支合入

## CASE-306 initBaseline merged 只写 local 不脏 project.json

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/soft-friction2-init-verify.md`

### 前置条件

- 存在尚未写 local merged marker 的 initBaseline；平台可证明分支已合入，或提交已是 HEAD 祖先。

### 步骤

1. 运行 `doctor` / `start` / `close <init-id>` 触发合入证明。
2. 检查 `.tiller/project.json` 与 `.tiller/local/init-baseline-merged.json`。

### 输入

- 平台已合入证据或祖先证明。

### 预期结果

跟踪的 `project.json` 中 `initBaseline` 只含 id/branch/commit，不含 status/headRef；本机快照保留 tip head；merged 只记在 `.tiller/local/init-baseline-merged.json`；工作区不因合入证明出现脏跟踪改动。

## CASE-319 新初始化与受管清单不含启动器

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 干净 Git 工程与当前 0.5.0 安装可用。

### 步骤

1. 运行 `tiller init`。
2. 读取受管清单并运行 `upgrade --plan`。

### 输入

- 新初始化工程。

### 预期结果

init 不写 `.tiller/run.cjs`，管理清单不登记该文件，升级预览无变更。

## CASE-327 status 展示 init 当前合入证明

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- init 基线已合入，跟踪 project.json 不含 initBaseline.status 或 headRef

### 步骤

1. 运行 tiller status <root> 并读取 JSON

### 输入

- 已合入 init 基线与只含事实字段的跟踪元信息

### 预期结果

status 只通过 initBaselineStatus 暴露当前结论 merged；metadata.initBaseline 只含事实字段，不出现 status/headRef，也不改写 project.json

## CASE-330 初始化状态只暴露 effective 并剥离旧 status/headRef

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- project.json 或本机 baseline 带有旧 status/headRef 字段

### 步骤

1. 读取 init、status、doctor 的 JSON 输出
2. 检查 metadata.initBaseline 与 initBaselineStatus

### 输入

- 尚未合入与已经合入的初始化基线

### 预期结果

metadata.initBaseline 只含 id/branch/commit，不含 status/headRef；本机快照可含 tip head；当前结论只出现在 initBaselineStatus，init 与 status 同形，doctor 不依赖旧字段

## CASE-333 本机记录 expected head 与 open PR 且重初始化清旧证明

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- init 已创建 worktree 并尝试开 PR/MR；同日再次以相同 init-id 初始化

### 步骤

1. 检查 .tiller/local/<init-id>/baseline.json 与 init-baseline-merged.json，再执行同日 re-init

### 输入

- 首次 init 的 head/open PR 与旧 merged marker，随后产生新 head

### 预期结果

本机记录本次 expected head 与 open PR/MR；re-init 改写 expected head 并清除旧 merged marker，旧 marker 不能放行新 head

## CASE-362 init 与 start 预检 Git 身份

- 类型：interface
- 优先级：high
- 模块：initialization
- 关联 AC：AC-6
- 需求：`.tiller/specs/modules/workflow/abandon-parent-cwd-pack.md`

### 前置条件

- 仓库未设置 user.name 或 user.email

### 步骤

1. 分别执行 init 与 start

### 输入

- 仅含空提交夹具、无本地和全局身份

### 预期结果

写盘或建树前返回 GIT_IDENTITY_MISSING，并提示设置 user.name 与 user.email
