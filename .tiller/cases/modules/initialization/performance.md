# initialization / performance

## CASE-020 启动器版本和帮助只启动一个 Node 进程

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `src/cli.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/launcher-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“启动器版本和帮助只启动一个 Node 进程”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且启动器版本和帮助只启动一个 Node 进程。

## CASE-021 导入完整 CLI 不执行命令或产生输出

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/cli.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/launcher-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“导入完整 CLI 不执行命令或产生输出”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且导入完整 CLI 不执行命令或产生输出。

## CASE-022 从标准输入导入 CLI 不要求文件入口或执行命令

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/cli.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/launcher-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“从标准输入导入 CLI 不要求文件入口或执行命令”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且从标准输入导入 CLI 不要求文件入口或执行命令。

## CASE-023 启动器在执行命令前拒绝未选业务模块的语法错误

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/launcher-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“启动器在执行命令前拒绝未选业务模块的语法错误”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且启动器在执行命令前拒绝未选业务模块的语法错误。

## CASE-024 启动器拒绝无效导出契约且不产生命令副作用

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/launcher-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“启动器拒绝无效导出契约且不产生命令副作用”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且启动器拒绝无效导出契约且不产生命令副作用。

## CASE-025 选定命令失败不会切换安装或重复执行

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/launcher-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“选定命令失败不会切换安装或重复执行”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且选定命令失败不会切换安装或重复执行。

## CASE-026 元信息检查不启动 Git 或受管资源扫描

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/project-metadata.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/project-inspection-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“元信息检查不启动 Git 或受管资源扫描”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且元信息检查不启动 Git 或受管资源扫描。

## CASE-027 元信息读取每次返回独立当前值而不复用结果

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/project-metadata.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/project-inspection-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“元信息读取每次返回独立当前值而不复用结果”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且元信息读取每次返回独立当前值而不复用结果。

## CASE-028 未知或缺失元信息在创建锁之前拒绝

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/project-metadata.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/project-inspection-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“未知或缺失元信息在创建锁之前拒绝”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且未知或缺失元信息在创建锁之前拒绝。

## CASE-029 仓库元信息没有隐藏读取轮次并观察独立读取

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/repository-metadata-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“仓库元信息没有隐藏读取轮次并观察独立读取”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且仓库元信息没有隐藏读取轮次并观察独立读取。

## CASE-030 显式元信息输入可校验且不隐式保留来源

- 类型：performance
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/files.ts`, `src/repository-paths.ts`

### 前置条件

- 对应模块 initialization 的规格与运行环境可用。

### 步骤

1. 执行测试文件 `test/repository-metadata-performance.test.mjs` 中引用本用例的具名测试。
2. 核对实际结果与预期结果一致，且没有失败、跳过或伪造记录。

### 输入

- 按“显式元信息输入可校验且不隐式保留来源”的场景准备正常输入和必要的边界输入。

### 预期结果

测试通过，并且显式元信息输入可校验且不隐式保留来源。
