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

## CASE-233 初始化基线功能通过全量质量门禁且版本保持 0.5.0

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-init-baseline#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`package.json`, `.tiller/project.json`, `test/init-baseline.test.mjs`

### 前置条件

- 初始化基线实现与指定 CASE 已完成

### 步骤

1. 运行 build、lint、typecheck、test 与 test:package

### 输入

- 仓库当前质量门禁

### 预期结果

全部命令通过，package、资源与 CLI 版本保持 0.5.0
