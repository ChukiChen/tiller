# initialization / security

## CASE-118 拒绝分组仓库父链接和伪造仓库映射

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工作区包含指向外部的 repositories 链接

### 步骤

1. 通过分组路径初始化并伪造缺失仓库映射

### 输入

- 符号链接父目录、越界仓库路径，以及只有标识没有路径的旧清单

### 预期结果

链接逃逸、越界路径和缺少路径的旧清单均被拒绝

## CASE-119 拒绝把管理仓库工作树登记为业务仓库

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

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
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

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
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 工程锁已持有且存在本机恢复路径

### 步骤

1. 提交大小写变体和业务根路径
2. 提交仅大小写不同的重复路径

### 输入

- .tiller/Local、.TILLER/task 和 agents.md

### 预期结果

恢复记录与业务路径别名被拒绝，重复事务路径在写入前报错

## CASE-141 已有自定义 usage 在初始化和无变更操作中受保护

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 目标文件已存在用户内容

### 步骤

1. 新工程初始化
2. 现有工程改写后运行当前无变更升级

### 输入

- 用户自定义的 .tiller/usage.md

### 预期结果

冲突时拒绝初始化和应用，原文件字节保持不变

## CASE-147 过期计划绑定节外字节并识别宽松审批冲突

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

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
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

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
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

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
- 关联 AC：无
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 元信息可声明历史 resourceVersion

### 步骤

1. 对历史版本传入缺失、直接和分组映射并解析

### 输入

- 0.1.0 到 0.3.6 以及直接兼容 0.4.0

### 预期结果

历史版本一律拒绝映射解析；直接兼容版本接受对象路径；只有标识、没有路径的旧清单被拒绝；空的当前工程不需要旁路映射

## CASE-254 init 基线缺 token 或 API 失败时不静默放行

- 类型：security
- 优先级：medium
- 模块：initialization
- 关联 AC：20261026-flow-stability#AC-1
- 需求：`.tiller/specs/modules/initialization/requirements.md`

### 前置条件

- 初始化基线为 pending 且提交不是 HEAD 祖先。

### 步骤

1. 分别在无 token 和平台 API 失败时运行 start。

### 输入

- 两种失败环境均未提供可用合入证据。

### 预期结果

start 以 INIT_BASELINE_PENDING 失败并保留 --skip-init-gate 提示，不更新 merged。
