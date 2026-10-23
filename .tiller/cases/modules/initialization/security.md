# initialization / security

## CASE-118 拒绝分组仓库父链接和伪造仓库映射

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/repository-paths.ts`, `test/core.test.mjs`

### 前置条件

- 工作区包含指向外部的 repositories 链接

### 步骤

1. 通过分组路径初始化并伪造缺失仓库映射

### 输入

- 符号链接父目录和缺少 repositoryPaths 的元信息

### 预期结果

链接逃逸与伪造映射均被拒绝，不写入项目元信息

## CASE-119 拒绝把管理仓库工作树登记为业务仓库

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `test/core.test.mjs`

### 前置条件

- 管理仓库本身是 Git 工作副本

### 步骤

1. 在该仓库内创建工作树并作为业务仓库初始化

### 输入

- repositories/service-a 工作树

### 预期结果

重复 Git 身份被识别并拒绝初始化

## CASE-122 路径检查拒绝越界和符号链接逃逸

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/files.ts`, `src/core.ts`, `test/core.test.mjs`

### 前置条件

- 工程根外存在测试目录

### 步骤

1. 检查父目录和规范化越界路径
2. 把 .tiller 链接到外部后初始化

### 输入

- ../outside、.tiller/../outside 和外部目录

### 预期结果

越界路径及链接逃逸被拒绝，外部目录不被写入

## CASE-123 事务拒绝路径大小写别名和非规范根

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/files.ts`, `test/core.test.mjs`

### 前置条件

- 工程锁已持有且存在本机恢复路径

### 步骤

1. 提交大小写变体和业务根路径
2. 提交仅大小写不同的重复路径

### 输入

- .tiller/Local、.TILLER/task 和 agents.md

### 预期结果

恢复记录与业务路径别名被拒绝，重复事务路径在写入前报错

## CASE-128 运行时绑定在状态查询后重新核对启动器字节

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 已绑定 CLI 且刚执行过状态查询

### 步骤

1. 状态查询后修改共享启动器再绑定

### 输入

- 变更后的 .tiller/run.cjs

### 预期结果

绑定重新读取并核对当前启动器摘要，失败时不创建绑定记录

## CASE-131 拒绝过期本地 CLI 且不改动安装或元信息

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 本地安装版本与当前资源不匹配

### 步骤

1. 查询运行时状态并尝试启动版本命令

### 输入

- 旧版本 CLI、当前元信息和启动器

### 预期结果

状态和启动均失败，旧 CLI 与项目元信息字节保持不变

## CASE-132 不受支持的资源版本保留运行时绑定状态

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 工程元信息可改为不受支持版本

### 步骤

1. 分别在已有绑定和无绑定时改写资源版本并启动

### 输入

- 0.3.2、0.4.4、9.9.9 和有无 runtime 记录

### 预期结果

状态与启动失败，绑定和元信息按原字节保留或无记录，且不残留临时文件

## CASE-133 保留并拒绝损坏或他项目绑定及链接路径

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 工程本地目录可写入绑定记录和符号链接

### 步骤

1. 写入损坏记录
2. 写入他项目记录
3. 通过链接目录绑定

### 输入

- 坏 JSON、foreign projectRoot 和 node_modules 链接

### 预期结果

所有异常绑定保持原样并被拒绝，链接路径不被接受

## CASE-135 缺失启动器阻止绑定与就绪状态

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 工程存在可安装 CLI 但共享启动器被删除

### 步骤

1. 删除启动器后绑定并读取记录

### 输入

- 缺少 .tiller/run.cjs

### 预期结果

绑定失败且不生成 runtime 记录或临时文件

## CASE-138 运行时状态按受管摘要拒绝被修改的启动器

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 工程已绑定 CLI

### 步骤

1. 修改共享启动器后查询运行时状态

### 输入

- 被替换的 run.cjs

### 预期结果

状态不就绪并在问题中指向启动器摘要不符

## CASE-139 重新绑定前拒绝已变化的共享启动器

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/runtime.ts`, `test/runtime.test.mjs`

### 前置条件

- 工程已有绑定记录且启动器被修改

### 步骤

1. 用替代 CLI 重新绑定

### 输入

- 变更后的 run.cjs 与原绑定记录

### 预期结果

绑定失败，原记录与修改后的启动器均保持原字节且无临时文件

## CASE-141 已有自定义 usage 或启动器在初始化和无变更操作中受保护

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/upgrade.ts`, `test/usage-resources.test.mjs`

### 前置条件

- 目标文件已存在用户内容

### 步骤

1. 新工程初始化
2. 现有工程改写后运行当前无变更升级

### 输入

- 用户自定义的 .tiller/usage.md 和 .tiller/run.cjs

### 预期结果

冲突时拒绝初始化和应用，原文件字节保持不变

## CASE-147 过期计划绑定节外字节并识别宽松审批冲突

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/upgrade.ts`, `test/upgrade.test.mjs`

### 前置条件

- 已生成升级计划且受管文件外可编辑

### 步骤

1. 修改入口前后文后应用旧计划
2. 加入宽松审批表述后重新规划

### 输入

- AGENTS.md 外部字节和宽松审批语句

### 预期结果

旧计划因外部字节变化失效；宽松审批仍被视为冲突且不写入

## CASE-148 验证失败保留恢复数据且后续编辑阻止恢复

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/files.ts`, `src/core.ts`, `test/upgrade.test.mjs`

### 前置条件

- 事务已写入 after 且复验失败

### 步骤

1. 随后编辑受管文件并恢复
2. 退回 after 后再次恢复

### 输入

- 事务日志、用户后续编辑和原文件

### 预期结果

后续编辑使恢复冲突且日志保留；匹配后恢复原字节并清除事务

## CASE-150 换行等价接受检出转换但拒绝实质修改

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/core.ts`, `src/upgrade.ts`, `test/upgrade.test.mjs`

### 前置条件

- 工程已初始化且资源含换行差异

### 步骤

1. 改坏索引链接后检查
2. 转换规则文件换行
3. 追加实质编辑

### 输入

- 索引、core.md、换行差异和用户修改

### 预期结果

链接错误与实质修改被拒绝，仅允许分发资源的换行等价

## CASE-153 历史版本不能提供或推断仓库映射

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261023-case-backfill#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`
- 源码：`src/repository-paths.ts`, `src/project-metadata.ts`, `test/repository-paths.test.mjs`

### 前置条件

- 元信息可声明历史 resourceVersion

### 步骤

1. 对历史版本传入缺失、直接和分组映射并解析

### 输入

- 0.1.0 到 0.3.6 以及直接兼容 0.4.0

### 预期结果

历史版本一律拒绝映射解析；直接兼容版本只接受显式映射，缺失映射报错
