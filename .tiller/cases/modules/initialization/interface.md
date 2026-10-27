# initialization / interface

## CASE-127 已绑定 CLI 冷启动保留参数、输入、目录和退出码

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程已初始化并绑定测试 CLI

### 步骤

1. 从工程启动器传入特殊参数和标准输入

### 输入

- 中文空格、shell 元字符、stdin 和退出码 7

### 预期结果

参数、cwd、stdin 与退出码原样保留，启动器字节不变

## CASE-129 发现本地 CLI 并为过期或缺失安装提供恢复

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程未绑定但存在本地或工程内 CLI

### 步骤

1. 查询本地安装并绑定后删除 CLI
2. 无可用 CLI 时启动

### 输入

- tiller/local/cli 和 node_modules/tiller

### 预期结果

本地安装无需预先绑定即可发现；失效后状态失败并给出绑定或安装恢复提示

## CASE-130 跳过过期本地 CLI 并绑定精确当前 CLI

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 本地安装版本与当前资源不匹配

### 步骤

1. 绑定外部当前 CLI 并启动版本命令

### 输入

- 旧版本 0.3.2、0.4.4、9.9.9 和预发布版本

### 预期结果

跳过旧本地安装，绑定并执行精确当前 CLI，项目元信息不变

## CASE-134 真实 Git 工作树解析主检出且拒绝复制本地数据

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 主工程已绑定外部 CLI 并创建 Git 工作树

### 步骤

1. 在工作树启动并读取状态
2. 复制 .git 与启动器到独立目录

### 输入

- 活动工作树、复制目录和无效 Git 环境

### 预期结果

工作树解析到主检出并忽略无效 Git 环境；复制目录不能冒用本地绑定

## CASE-137 工程内 CLI 可直接使用且不依赖 Git

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程含 node_modules/tiller 且 Git 文件无效

### 步骤

1. 启动版本命令

### 输入

- gitdir 指向不存在路径

### 预期结果

直接使用工程内 CLI 成功输出当前版本

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

- 存在 pending initBaseline；平台可证明分支已合入，或提交已是 HEAD 祖先。

### 步骤

1. 运行 `doctor` / `start` / `close <init-id>` 触发合入证明。
2. 检查 `.tiller/project.json` 与 `.tiller/local/init-baseline-merged.json`。

### 输入

- 平台已合入证据或祖先证明。

### 预期结果

跟踪的 `project.json` 中 `initBaseline.status` 保持 pending 快照（若文件已在主干）；merged 记在 `.tiller/local/init-baseline-merged.json`；工作区不因仅 status 字段出现脏跟踪改动。

