# tiller pr 草稿细节修正与文档表述恢复

<!-- tiller-task:v1 {"version":1,"id":"20261022-round13","type":"bugfix","size":"standard","created":"2026-10-22T09:46:31.483Z","base":"31ede941952ec549c97734d3daf61aa2da196c82","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".gitlab",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{},"format":"structured","slug":"pr-polish-docs"} -->

## 需求

### 目标

修正 tiller pr 草稿的标题摘要来源、变更内容顺序与验证结果格式，恢复第12轮为控制必读字数而过度压缩的文档表述，并将必读资料预算放宽至约 7000 字符，以清晰为先。

### 范围

- 做：`tiller pr` 标题摘要来源（任务摘要字段与 `--summary`）、变更内容顺序、验证结果格式；恢复入口、usage、规则文档中被过度压缩的表述，补充平台初始化后不可通过 CLI 切换的说明；放宽必读资料预算；相关规格、用例与测试同步。
- 不做：调用 GitHub/GitLab 接口或联网创建 PR/MR、平台切换命令、改写已有提交历史、版本号变更。
- 涉及模块：workflow（pr、start）、standards（规则、usage、入口文档与必读预算）、initialization（受管资源文案）。

### 验收条件

- AC-1: tiller pr 标题的中文摘要由任务中专门的摘要生成：优先取任务元数据中的摘要字段（可由 start 或 pr 的 --summary 写入或指定），其次取任务基线之后最早的 feat/fix 提交摘要，最后退回任务标题；与提交摘要保持一致，多模块时的选择规则明确并写入文档
- AC-2: 变更内容段按提交时间正序列出提交（较早的在前）
- AC-3: 验证结果段不再出现圆点加编号的格式：每条验收条件单独一行或一个小标题，其下以普通嵌套列表列出该条件的全部验证记录，在 GitHub 与 GitLab 上均渲染清晰
- AC-4: 恢复第12轮为控制字数而删短的文案：resources/usage.md 的恢复命令写完整（如 node .tiller/run.cjs resume，以实际路径为准），标题模块等别扭表述改为通顺的完整句子，rules/core.md 的权限与限制恢复 CLI 只检查受控操作和读取到的数据等被删内容；全面复查入口、usage 与规则文档中的类似过度压缩，并注明平台在初始化后不能通过 CLI 切换
- AC-5: 必读资料预算以清晰为先，上限放宽至约 7000 字符，测试、规格与规则中的相关表述同步更新

## 设计

### 方案

- 标题摘要：来源依次为 `pr --summary <摘要>`、任务元数据中的 `summary` 字段（由 `start --summary` 写入）、任务基线之后最早一条类型为 feat 或 fix 且符合“类型(模块): 中文摘要”格式的提交摘要、任务标题；取到即止。标题的类型仍由任务类型映射，模块沿用第12轮规则（唯一模块直接写入；多个模块取范围中首个声明的主模块；无法推导时省略括号），规则写入 usage 与规格。
- 变更内容：按提交时间正序（较早的在前）列出任务基线之后的提交。
- 验证结果：每条验收条件单独一行（如 `- AC-1：<条件摘要>`），其下以普通嵌套列表列出该条件的全部验证记录（测试、命令、结果、提交），不再使用“圆点加编号”的写法；保持记录原有顺序。
- 文档：恢复 `resources/usage.md` 中完整的恢复命令（以 init 实际生成的运行入口路径为准，如 `node .tiller/run.cjs resume`），将标题、分支等别扭的压缩表述改为通顺完整的句子；恢复 `rules/core.md` 权限与限制中被删除的说明（如 CLI 只检查受控操作和读取到的数据）；全面复查 entry、usage 与规则文档中的类似问题；注明平台在初始化时选定，之后不能通过 CLI 切换（需手动修改 project.json 并补齐模板）。
- 预算：必读资料预算以清晰为先，上限由约 5000 字符放宽至约 7000 字符，测试阈值、规格与规则中的表述同步更新。

### 取舍

- 摘要来源采用固定优先级的最简规则，不做多提交摘要合并或自然语言生成，结果可预期、易于文档化。
- 模块推导不随摘要来源变化，避免同一任务在不同提交历史下标题模块不稳定。
- 预算放宽而非取消，仍防止必读资料无限膨胀。

### 影响与风险

- 受影响：`pr` 输出（标题摘要、变更内容顺序、验证结果格式）、`start` 新增可选 `--summary`、任务元数据结构、usage/规则/入口文档、必读预算测试。
- 需回归：workflow 的 pr、start 与 check 用例，standards 的必读资料预算与文档一致性用例，initialization 的受管资源与 upgrade 用例。
- 风险：已有任务没有 summary 字段，应按优先级回退且行为可预期；文档恢复后必读资料不得超过约 7000 字符。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：31ede941952ec549c97734d3daf61aa2da196c82
- 对象摘要：c989528434de0c53c0a1fe6264143397e70b9bca962ff75c6a1cca76e5d75267
- 时间：2026-10-22T09:46:53.297Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：31ede941952ec549c97734d3daf61aa2da196c82
- 对象摘要：d9ecdbbd56dd8389accbb5644b59f671c1595273af8b78e463f2ee1f9a778f10
- 时间：2026-10-22T09:46:53.369Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 对象摘要：ec616b850f43d4e6a9d71e24462b7f92abed67b808591889ee30e96c39efe59b
- 时间：2026-10-22T11:09:21.428Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/pr.test.mjs::pr summary prefers flag then metadata then earliest conventional commit then task title
- 用例：CASE-081
- 命令：node --test --test-name-pattern="pr summary prefers flag then metadata then earliest conventional commit then task title" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:04.107Z

### run-2
- 条件：AC-2
- 测试：test/pr.test.mjs::pr change list orders commits from oldest to newest
- 用例：CASE-082
- 命令：node --test --test-name-pattern="pr change list orders commits from oldest to newest" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:04.892Z

### run-3
- 条件：AC-3
- 测试：test/pr.test.mjs::pr verification section uses plain nested records without numbered bullets
- 用例：CASE-083
- 命令：node --test --test-name-pattern="pr verification section uses plain nested records without numbered bullets" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:05.947Z

### run-4
- 条件：AC-3
- 测试：test/pr.test.mjs::pr verification section lists every recorded run in order
- 用例：CASE-077
- 命令：node --test --test-name-pattern="pr verification section lists every recorded run in order" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:07.050Z

### run-5
- 条件：AC-4
- 测试：test/rules.test.mjs::restored guidance keeps complete commands and explicit boundaries
- 用例：CASE-084
- 命令：node --test --test-name-pattern="restored guidance keeps complete commands and explicit boundaries" test/rules.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:07.278Z

### run-6
- 条件：AC-5
- 测试：test/rules.test.mjs::required reading budget allows clear guidance within 7000 characters
- 用例：CASE-049, CASE-074, CASE-085
- 命令：node --test --test-name-pattern="required reading budget allows clear guidance within 7000 characters" test/rules.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:07.485Z

### run-7
- 条件：AC-3
- 测试：test/pr.test.mjs::pr verification section uses plain nested records without numbered bullets
- 用例：CASE-083
- 命令：node --test --test-name-pattern="pr verification section uses plain nested records without numbered bullets" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：1d1bf57b2f89a2dfb30c39108428033156480858
- 代码树摘要：b48b6f6395a11fddbb7f99570ee559db786bd556f08fea6bd2e23b20f7864aa5
- 来源：executed
- 时间：2026-10-22T11:09:15.103Z

## 关闭

### close
- 状态：已关闭
- 原因：已验收，纳入 20261023-hygiene-p1p2 卫生收尾关闭
- 时间：2026-10-23T07:28:48.391Z

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
- AC-5 引用的历史用例 CASE-049 未绑定来源 AC；可在本次修改该用例时补上 criteria: ["20261022-round13#AC-5"]。
- 本次改动涉及模块 initialization：建议回归该模块 18 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 6 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 35 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 1 个测试用例（请确认对应功能已删除；详情见 Git diff）。
