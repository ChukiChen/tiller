# 提交信息、分支名与 PR 规范及 PR 草稿生成

<!-- tiller-task:v1 {"version":1,"id":"20261022-round11","type":"feature","size":"standard","created":"2026-10-22T08:09:30.545Z","base":"0e80e5e5d003cdd1a9f69e08f1db7989f34b67be","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{"src/cli.ts":"220df71a47cd02220bdca7c66d3e0d0d15d11f4969f0a46d010e8820b46a7e65","src/core.ts":"d524d9838d70dca5f5e575e68bc56391fe67dbaddd0a4e2b794f8a71c9d25d13","src/flow.ts":"7bcc673f4f3411e1905b6cf19d91e73263f45f39ea1cc79551546f2ab871f999","src/project-metadata.ts":"a8605c1698d1087e443fc1a5f7b409f8ab3116c72cd0220a9415834de2be67ed","src/upgrade.ts":"bc0a989c0d7545c2990d271cd85e031d3ef404b084bf88c7d7d5aeb425491302",".github/pull_request_template.md":"dc34095bbe979b30112daeb491755c4d161ede0ac8ebad9310a85412a5907bc9","resources/pull_request_template.md":"dc34095bbe979b30112daeb491755c4d161ede0ac8ebad9310a85412a5907bc9","src/commit-conventions.ts":"270a62a2a4eed08c5683cbed0d87c6f9bcc8fa139002f91814cfe08fad40cf98","src/pr.ts":"8d42a1421ba05f8637a0f1594fb52d251c3ba89a1b586ad98e818bc8c81fac50","test/pr.test.mjs":"5f79cf6439635830cfb892249b16cee31b704197777e4ce9e2145feac6a7e940"},"format":"structured"} -->

## 需求

### 目标

统一 tiller 的提交信息、分支名和 PR 标题与说明格式，并由 tiller pr 根据 task.md 生成 PR 草稿，check 对不合规的提交主题和分支名给出提示。

### 范围

- 做：提交主题与分支名的格式校验（check 提示）、`tiller pr` 草稿生成、PR 模板及 init 受管资源、相关规则/usage/README/specs/用例与测试。
- 不做：调用 GitHub 或联网创建 PR、阻塞式提交钩子、改写已有提交历史、版本号变更。
- 涉及模块：workflow（pr、check）、initialization（init 模板、受管资源）、standards（规则与文档）。

### 验收条件

- AC-1: 提交主题规范为 类型(模块): 中文摘要，类型限 feat/fix/docs/refactor/test/chore，check 对任务基线之后不合规的提交主题给出不阻塞提示，合并提交跳过
- AC-2: 分支名规范为 类型/任务编号[-简短英文描述]，仅小写字母、数字、连字符和一个斜杠，check 对不合规或编号与任务不符的分支给出不阻塞提示，main/master 与 detached HEAD 跳过
- AC-3: tiller pr 输出 PR 标题（规范格式且末尾带 [任务编号]）、建议分支名和五段说明：关联任务（相对链接）、变更内容、验收条件、验证结果、影响与风险，支持 --json，不联网
- AC-4: 仓库自带 .github/pull_request_template.md 五段模板，init 为用户项目生成该模板且不覆盖已有文件，纳入受管资源
- AC-5: 规则、usage、README、specs 与全局用例和具名测试同步，必读资料不超过约 5000 字符，版本号保持 0.5.0

## 设计

### 方案

- 新增提交与分支规范模块：解析提交主题 `类型(模块): 摘要` 与分支名 `类型/任务编号[-描述]`，类型限 feat/fix/docs/refactor/test/chore。
- `check` 读取任务基线到 HEAD 的非合并提交主题和当前分支名，不合规时写入提示，不计入阻塞项；main/master 与 detached HEAD 跳过分支检查。
- `tiller pr <task-id>`：类型由任务类型推导，模块由范围推导，摘要取任务标题，生成标题（末尾 ` [任务编号]`）、建议分支名和五段说明；关联任务用相对链接，验收条件按当前验证勾选，验证结果与影响与风险取自 task.md；默认输出 Markdown，`--json` 输出结构化结果，不联网。
- 仓库与 init 资源新增 `.github/pull_request_template.md` 五段模板，作为受管资源，已有文件不覆盖。

### 取舍

- 规范只提示不阻塞，避免历史提交或外部协作者的提交让交付卡住。
- PR 说明里的“变更内容”只给草稿，由人修订，不追求全自动。
- 提交信息不带任务链接，任务关联统一放在 PR 标题编号和说明的相对链接里。

### 影响与风险

- 受影响：`check` 输出新增提示项、新增 `pr` 命令、init 和 upgrade 的受管资源清单。
- 需回归：workflow 的 check 与阶段用例、initialization 的 init/upgrade 用例、standards 的必读资料预算与文档一致性。
- 风险：已有项目 upgrade 后多出 PR 模板，若用户已有同名文件会作为冲突保留，不覆盖。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：0e80e5e5d003cdd1a9f69e08f1db7989f34b67be
- 对象摘要：0967cd8e7df04fbdd47e5b4cfb9473a95e0969be18c5f4ded5ec263af05417c7
- 时间：2026-10-22T08:09:59.169Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：0e80e5e5d003cdd1a9f69e08f1db7989f34b67be
- 对象摘要：8d00090a148a8ee9c30bb6c7b722fd80afe6d4a1a056dc8b8099cc43fce531cd
- 时间：2026-10-22T08:09:59.250Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 对象摘要：477178c11adb80992e69c9fd5e36f6b1e8e3d0e7090d64291104a7d2ddcdb19c
- 时间：2026-10-22T08:21:58.483Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/pr.test.mjs::commit subjects enforce type, module, Chinese summary and no task links
- 用例：CASE-073
- 命令：node --test --test-name-pattern="commit subjects enforce type, module, Chinese summary and no task links" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:50.008Z

### run-2
- 条件：AC-1
- 测试：test/pr.test.mjs::check warns about nonconforming commit subjects and skips merge subjects
- 用例：CASE-069
- 命令：node --test --test-name-pattern="check warns about nonconforming commit subjects and skips merge subjects" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:50.914Z

### run-3
- 条件：AC-2
- 测试：test/pr.test.mjs::branch names follow type and task prefix rules
- 用例：CASE-070
- 命令：node --test --test-name-pattern="branch names follow type and task prefix rules" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:51.106Z

### run-4
- 条件：AC-3
- 测试：test/pr.test.mjs::pr draft derives title, five sections and current AC state
- 用例：CASE-068
- 命令：node --test --test-name-pattern="pr draft derives title, five sections and current AC state" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:52.440Z

### run-5
- 条件：AC-4
- 测试：test/pr.test.mjs::init installs a managed pull request template and preserves an existing one
- 用例：CASE-071
- 命令：node --test --test-name-pattern="init installs a managed pull request template and preserves an existing one" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:52.788Z

### run-6
- 条件：AC-4
- 测试：test/pr.test.mjs::upgrade adds the pull request template to a previous managed set
- 用例：CASE-072
- 命令：node --test --test-name-pattern="upgrade adds the pull request template to a previous managed set" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:53.168Z

### run-7
- 条件：AC-5
- 测试：test/rules.test.mjs::required reading stays within the default-flow budget
- 用例：CASE-049, CASE-074
- 命令：node --test --test-name-pattern="required reading stays within the default-flow budget" test/rules.test.mjs
- 结果：passed
- 退出码：0
- 提交：7850747882a73c91ae9d99cd43192c5d0bbd5ed6
- 代码树摘要：0360ec8a9350d7485e47a7e30bd30f9c8ea431e0ad6a5a52d98c75b65b7ef558
- 来源：executed
- 时间：2026-10-22T08:21:53.365Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。
- AC-5 引用的历史用例 CASE-049 未绑定来源 AC；可在本次修改该用例时补上 criteria: ["20261022-round11#AC-5"]。
- 本次改动涉及模块 initialization：建议回归该模块 16 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 4 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 28 条用例及经过它的场景 CASE-055, CASE-001。
