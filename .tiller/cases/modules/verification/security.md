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
