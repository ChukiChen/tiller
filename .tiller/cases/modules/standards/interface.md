# standards / interface

## CASE-189 受管摘要采纳与已有任务挂接规划

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261024-gap-closure#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`

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

### 前置条件

- 任务实现与测试已落地

### 步骤

1. 读取包、项目元信息、CLI 版本与 merge 测试

### 输入

- package.json、.tiller/project.json、src/cli.ts、test/merge.test.mjs

### 预期结果

版本均为 0.5.0，CASE-234 至 CASE-241 在 merge 测试中有命名引用

## CASE-242 README 以 AI 执行为主并使用 REST API 与 token

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-1
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 需求已确认，根 README 可读取

### 步骤

1. 读取 README 的介绍与快速开始
2. 检索 AI 工作流、用户确认节点、REST API 与 token 名称

### 输入

- README.md 当前文档

### 预期结果

README 仍只含介绍与快速开始；AI 按 start →（设计确认）→ 实现 → verify → pr → merge/close 推进，用户只确认需求、设计与交付验收；合入与本机清理一句带过，不展开 squash 或平台 CLI；pr/merge/close 不写成人类逐步必跑的命令块；初始化说明 REST API 与 token，无裸 gh/glab

## CASE-243 受管文档与 CLI help 使用 REST API 并保持镜像一致

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-2, 20261026-docs-cli-names#AC-3
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 受管文档与项目镜像已落盘

### 步骤

1. 读取 usage、core、delivery 并逐对比对镜像
2. 运行 tiller --help 检索合入说明

### 输入

- resources/usage.md、resources/rules/core.md、resources/rules/activities/delivery.md 及 .tiller 镜像；CLI help

### 预期结果

usage、core、delivery 与 CLI help 均说明 GitHub/GitLab REST API 与 token 环境变量，不再出现裸 gh/glab；resources 与 .tiller 对应镜像内容一致

## CASE-244 运行时只调用 REST API 与 tokenized git transport

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：20261026-api-remote-ops#AC-1
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 工程 origin 可解析、token 已设置；PATH 不提供任何平台 CLI

### 步骤

1. 分别执行 init 与 merge
2. 检查 HTTP 请求、token header 与源码调用

### 输入

- mock HTTP、tokenized git push 与已验收任务

### 预期结果

init 推送、PR/MR 创建与 squash 合入均走平台 REST API；GitHub 优先 Git Data API，GitLab 传输层使用 tokenized HTTPS git push；生产源码不再引用平台 CLI 或平台 shim

## CASE-245 全局用例同步且 API 远端操作任务保持 0.5.0

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-docs-cli-names#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 全部实现、用例与测试已完成

### 步骤

1. 读取全局用例库并核对编号、总数和模块分布
2. 读取版本字段并运行全量质量命令

### 输入

- .tiller/cases、package.json、.tiller/project.json、src/cli.ts 与仓库测试

### 预期结果

package、project 与 CLI 版本均为 0.5.0；CASE-242 至 CASE-245 均有命名测试引用；CASE-048 的 total 为 286、standards/interface 为 15；build、lint、typecheck、test 与 test:package 全部通过

## CASE-246 代码质量与安全通用规则纳入受管资源

- 类型：interface
- 优先级：high
- 模块：standards
- 关联 AC：20261026-quality-code-rules#AC-1, 20261026-quality-code-rules#AC-2, 20261026-quality-code-rules#AC-3, 20261026-quality-code-rules#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 需求已确认，resources 与 .tiller/rules 镜像可读取

### 步骤

1. 读取双份 code.md、documents.md、活动规则与规则索引
2. 核对 RULES、project.json 受管摘要与全局用例计数
3. 运行覆盖本用例的规则测试

### 输入

- resources/ 与 .tiller/rules/ 当前规则、src/project-metadata.ts、test/rules.test.mjs

### 预期结果

quality/code.md 在双份镜像中包含命名、结构、扩展性、反过度设计、可读性、边界校验一次、保持简单、假想风险与注释约束；documents.md 双份保留密钥和绝对路径限制并补充记录凭据、输入校验与授权边界、可信依赖、危险操作确认和无具体威胁不过度加固；implementation、delivery 与 rules/index 双份形成质量/安全交叉引用；RULES 含 rules/quality/code.md，project.json 摘要覆盖新文件及被改文件；CASE-048 的 total 为 286、standards/interface 为 15；版本保持 0.5.0，资源镜像一致且规则测试通过

## CASE-261 帮助与受管文档同步基线 API、清分支、无源码与 check warning

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：20261026-flow-stability#AC-4
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- CLI 与受管 usage/rules/decisions 已更新。

### 步骤

1. 读取 help 与镜像文档并核对关键描述。

### 输入

- 文档发布前检查。

### 预期结果

文档一致说明 API 基线放行、默认清分支与 --keep-branch、无源码字段和业务路径 warning。

## CASE-267 文档与 decisions 写明 task 到需求与用例到需求

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- 受管文档与 decisions 可写

### 步骤

1. 阅读 usage/rules/decisions/resources
2. 核对关键字与旧表述已替换

### 输入

- 文档路径

### 预期结果

usage、rules、decisions、受管 resources 写明 task→需求、用例→需求，不再要求用例来源 AC 回指任务

## CASE-272 rules 与文档槽位措辞为使用场景

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/req-scene-heading.md`

### 前置条件

- 资源与 specs 已更新

### 步骤

1. 检索受管规则与规格描述

### 输入

- 旧槽位名作为输入

### 预期结果

activities/requirements、quality/documents、模块 README 说明与相关 specs 描述使用「使用场景」而非旧标题作为该槽位名

## CASE-275 文档引导路径作用域 AC-n 且无模块前缀示例

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/ac-criteria-link.md`

### 前置条件

- 可读取 rules、usage、decisions 与相关 specs 示例

### 步骤

1. 检索验收条件标题、LIB-AC、对照 与 AC 编号引导

### 输入

- 受管文档与示例 specs

### 预期结果

引导为路径作用域 AC-n、任务只引用、用例关联 AC 为无；新示例不输出（稳定）或 LIB-AC

## CASE-278 文档禁止默认分支直推 specs 且示范 worktree 合入

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/specs/modules/standards/requirements.md`

### 前置条件

- resources 与受管 .tiller 镜像一致

### 步骤

1. 读取 usage/core/delivery/cli 文案
2. 断言禁止直推与正确路径关键词；断言无新 LIB-AC/（稳定）标题

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

usage、core、delivery、CLI 写明 specs 经任务 worktree/PR 合入并禁止默认分支直改/直推；无 LIB-AC 与验收条件（稳定）新写法

## CASE-282 文档主路径为真实 pr 且无手搓 API 双轨

- 类型：interface
- 优先级：medium
- 模块：standards
- 关联 AC：无
- 需求：`.tiller/specs/modules/workflow/flow-exec-stability.md`

### 前置条件

- 对应模块与运行环境可用。

### 步骤

1. 检索 resources 与受管镜像及 CLI help

### 输入

- 按用例描述准备正常输入及必要的边界输入。

### 预期结果

usage/rules/AGENTS/CLI help 主路径描述 accept→pr（API 创建）→merge；不把「仅草稿再手搓 API」作主路径；无 LIB-AC/对照/验收条件（稳定）新写法示范
