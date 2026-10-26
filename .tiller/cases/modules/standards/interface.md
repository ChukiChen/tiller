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

## CASE-242 README 以 AI 执行为主并使用 github/gitlab 名称

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-1
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`README.md`, `test/merge.test.mjs`

### 前置条件

- 需求已确认，根 README 可读取

### 步骤

1. 读取 README 的介绍与快速开始
2. 检索 AI 工作流、用户确认节点与命令名

### 输入

- README.md 当前文档

### 预期结果

README 仍只含介绍与快速开始；AI 按 start →（设计确认）→ 实现 → verify → pr → merge/close 推进，用户只确认需求、设计与交付验收；合入与本机清理一句带过，不展开 squash/网页 close/平台 CLI；pr/merge/close 不写成人类逐步必跑的命令块；无裸 gh/glab

## CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-2, 20261026-docs-cli-names#AC-3
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`resources/usage.md`, `resources/rules/core.md`, `resources/rules/activities/delivery.md`, `.tiller/usage.md`, `.tiller/rules/core.md`, `.tiller/rules/activities/delivery.md`, `test/merge.test.mjs`

### 前置条件

- 受管文档与项目镜像已落盘

### 步骤

1. 读取 usage、core、delivery 并逐对比对镜像
2. 运行 tiller --help 检索合入说明

### 输入

- resources/usage.md、resources/rules/core.md、resources/rules/activities/delivery.md 及 .tiller 镜像；CLI help

### 预期结果

usage、core、delivery 与 CLI help 均使用 github/gitlab 命令名，不再出现裸 gh/glab；resources 与 .tiller 对应镜像内容一致

## CASE-244 运行时以 github/gitlab 调用并支持官方二进制回退

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`src/platform-cli.ts`, `src/init-baseline.ts`, `src/pr.ts`, `test/merge.test.mjs`, `test/init-baseline.test.mjs`

### 前置条件

- PATH 中提供 github/gitlab 假二进制，或只提供官方 gh/glab 假二进制

### 步骤

1. 分别执行 init 与 merge
2. 记录子进程 argv0 与参数

### 输入

- 假 github/gitlab 与假 gh/glab；初始化及已验收任务

### 预期结果

PATH 优先 github/gitlab；只提供官方 gh/glab 时，tiller 以同名 shim 使 argv0、spawn 显示名与可复制命令仍为 github/gitlab；两者都无时明确报错。官方二进制名仍为 gh/glab，tiller 不重新打包

## CASE-245 全局用例同步且文档 CLI 名称任务保持 0.5.0

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`
- 源码：`.tiller/cases/modules/standards/interface.md`, `package.json`, `.tiller/project.json`, `src/cli.ts`, `test/rules.test.mjs`, `test/merge.test.mjs`

### 前置条件

- 全部实现、用例与测试已完成

### 步骤

1. 读取全局用例库并核对编号、总数和模块分布
2. 读取版本字段并运行全量质量命令

### 输入

- .tiller/cases、package.json、.tiller/project.json、src/cli.ts 与仓库测试

### 预期结果

package、project 与 CLI 版本均为 0.5.0；CASE-242 至 CASE-245 均有命名测试引用；CASE-048 的 total 为 245、standards/interface 为 8；build、lint、typecheck、test 与 test:package 全部通过
