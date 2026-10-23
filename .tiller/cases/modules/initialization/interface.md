# initialization / interface

## CASE-127 已绑定 CLI 冷启动保留参数、输入、目录和退出码

- 类型：interface
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

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
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

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
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

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
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

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
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

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
- 源码：`src/repository-paths.ts`, `test/repository-paths.test.mjs`

### 前置条件

- 元信息含显式 repositoryPaths

### 步骤

1. 解析直接、分组和根仓库路径
2. 查询未登记仓库

### 输入

- service-a、repositories/service-a、根路径和 missing

### 预期结果

直接与分组映射原样返回，根路径为点，未知仓库明确报错
