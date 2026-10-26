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

## CASE-240 接入文档说明 merge 与网页合入手动 close

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：20261026-readme-merge-close#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `resources/rules/activities/delivery.md`

### 前置条件

- resources 中的 usage、core 与 delivery 已分发并与项目镜像一致

### 步骤

1. 读取受管文档并检索 merge 与网页合入约定

### 输入

- resources/usage.md、resources/rules/core.md、resources/rules/activities/delivery.md

### 预期结果

文档写明 tiller merge 成功后自动 close、init-id 可 merge，以及网页合入后仍需手动 tiller close

## CASE-241 版本保持 0.5.0 且新用例均有测试引用

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：20261026-readme-merge-close#AC-5
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`package.json`, `.tiller/project.json`, `src/cli.ts`, `test/merge.test.mjs`

### 前置条件

- 任务实现与测试已落地

### 步骤

1. 读取包、项目元信息、CLI 版本与 merge 测试

### 输入

- package.json、.tiller/project.json、src/cli.ts、test/merge.test.mjs

### 预期结果

版本均为 0.5.0，CASE-234 至 CASE-241 在 merge 测试中有命名引用
