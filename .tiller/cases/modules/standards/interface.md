# standards / interface

## CASE-189 受管摘要采纳与已有任务挂接规划

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261024-gap-closure#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`src/upgrade.ts`, `src/plans.ts`, `src/flow.ts`

### 前置条件

- 已有受管文件与已确认规划及任务记录

### 步骤

1. 修改受管文件当前内容并执行采纳
2. 将已关闭任务挂到规划条目
3. 运行 plan status 核对任务关联

### 输入

- 受管文件路径、任务标识、规划标识与条目

### 预期结果

upgrade --adopt 写入当前受管内容摘要并消除漂移；plan attach 为已有任务写入 plan/item 且 plan status 可汇总
