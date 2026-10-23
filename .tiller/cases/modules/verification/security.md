# verification / security

## CASE-100 待实现与不存在用例编号被明确识别

- 类型：security
- 优先级：high
- 模块：verification
- 关联 AC：20261022-round16#AC-3
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/cases.ts`, `src/flow.ts`

### 前置条件

- 用例库含至少一条无测试引用的用例和一条被测试引用的正常用例。

### 步骤

1. 扫描测试并核对用例状态、反查关系和错误列表。
2. 加入引用不存在 CASE 编号的测试后重新扫描。

### 输入

- 一个测试同时覆盖两个已存在用例，另一个测试引用不存在的 CASE-999。

### 预期结果

无引用用例显示待实现；一测可覆盖多个用例且一个用例可被多个测试覆盖；不存在编号产生明确错误。

## CASE-125 共享路径检查遵循祖先忽略并拒绝裸仓库

- 类型：security
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/shared-paths.ts`, `test/core.test.mjs`

### 前置条件

- 嵌套目录位于含忽略规则的父仓库中

### 步骤

1. 检查嵌套共享路径
2. 在裸仓库中检查共享路径

### 输入

- private/evidence.md、public/evidence.md 和裸仓库

### 预期结果

祖先忽略规则生效，非忽略路径允许，裸仓库无工作树时拒绝

## CASE-126 共享路径检查保留致命配置和缺失 Git 的失败

- 类型：security
- 优先级：medium
- 模块：verification
- 关联 AC：无
- 需求：`.tiller/specs/modules/verification/requirements.md`
- 源码：`src/shared-paths.ts`, `test/core.test.mjs`

### 前置条件

- 测试环境可控且 Git 配置或可执行文件可缺失

### 步骤

1. 使用损坏全局配置检查路径
2. 移除 Git 后检查根与嵌套路径

### 输入

- malformed.gitconfig、缺失 PATH 和不同忽略规则

### 预期结果

损坏配置和无法判定忽略状态时失败，明确排除本机路径时允许非 Git 回退
