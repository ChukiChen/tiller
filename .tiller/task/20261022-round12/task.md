# tiller pr 草稿完善与 GitLab MR 支持

<!-- tiller-task:v1 {"version":1,"id":"20261022-round12","type":"feature","size":"standard","created":"2026-10-22T08:27:33.178Z","base":"bc2212dcaeb572d1166e66ccc46d8445f5bf7cf5","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".gitlab",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{},"format":"structured"} -->

## 需求

### 目标

完善 tiller pr 生成的标题、建议分支名、验证结果和关联任务，并支持 GitLab 合并请求模板，使 PR/MR 草稿在 GitHub 与 GitLab 上均可直接使用。

### 范围

- 做：`tiller pr` 标题模块推导、建议分支描述、验证结果完整列出；GitLab MR 模板、平台配置与 init/upgrade 受管资源；关联任务改为纯文本；相关规则、usage、README、specs、用例与测试。
- 不做：调用 GitHub/GitLab 接口或联网创建 PR/MR、阻塞式提交钩子、改写已有提交历史、版本号变更。
- 涉及模块：workflow（pr）、initialization（init、upgrade、受管资源、project.json）、standards（规则与文档）。

### 验收条件

- AC-1: tiller pr 生成的标题包含模块，格式为 类型(模块): 中文摘要 [任务编号]，模块从任务范围或涉及模块推导，无法推导时省略括号
- AC-2: 建议分支名为 类型/任务编号-简短英文描述，描述从任务英文标识推导，无法推导时退回 类型/任务编号，且仅含小写字母、数字、连字符和一个斜杠
- AC-3: 验证结果段列出每条验收条件的全部验证记录，而不只是最后一条
- AC-4: 支持 GitLab：project.json 可配置平台 github、gitlab 或 both，默认保持 GitHub 现有行为；init 按平台生成 .gitlab/merge_request_templates/Default.md 五段模板，upgrade 能补齐缺失模板
- AC-5: 关联任务段输出纯文本而非 Markdown 链接，格式为 任务 <任务编号>，记录见 `.tiller/task/<任务编号>/task.md`（路径为代码样式）；输出文案对 PR 与 MR 中性

## 设计

### 方案

- 标题：模块按任务范围中的 `.tiller/specs/modules/<模块>`、`.tiller/cases/modules/<模块>` 及范围“涉及模块”行推导；唯一模块时写入括号，多个模块取首个主模块（按范围声明顺序），无法推导时省略括号。
- 分支：描述来源依次为 `pr --slug <描述>`、`start --slug` 写入任务元数据的英文标识、当前分支 `类型/任务编号-描述` 中与本任务编号匹配的描述；规范化为小写字母、数字和连字符，均无时退回 `类型/任务编号`。
- 验证结果：按验收条件分组，列出 task.md 中该条件的全部验证记录（命令、结果、提交），保持记录原有顺序。
- 平台：`project.json` 新增可选 `platform`（github | gitlab | both，缺省视为 github）；init 增加 `--platform` 选项写入配置，按平台生成 `.github/pull_request_template.md` 和/或 `.gitlab/merge_request_templates/Default.md`（同一五段内容，已有文件不覆盖），均纳入受管资源；upgrade 按当前平台补齐缺失模板。
- 关联任务：输出纯文本“任务 <id>，记录见 `.tiller/task/<id>/task.md`”，不生成 Markdown 链接（相对链接在 PR/MR 页面会按页面地址解析成错误路径，如 GitHub 的 /pull/.tiller/...），也不引入仓库网页地址配置。命令输出和文档中的“PR”统一为 PR/MR 中性表述，五段标题不变。

### 取舍

- 平台配置采用 project.json 单字段的最小方案，不做平台自动探测（远端地址探测可能误判自建实例），缺省行为与现有 GitHub 项目完全一致。
- 关联任务不生成可点击链接：相对链接在 PR/MR 页面解析错误，完整链接需额外配置仓库网页地址和分支，收益不抵复杂度；纯文本路径足以定位任务记录。
- 分支描述不强制提供，无法推导时退回无描述格式，仍符合分支规范。

### 影响与风险

- 受影响：`pr` 输出（标题、分支、验证结果、关联任务）、init 选项与受管资源清单、upgrade 补齐逻辑、project.json 结构。
- 需回归：workflow 的 pr 与 check 用例、initialization 的 init/upgrade 用例、standards 的必读资料预算与文档一致性。
- 风险：已有 GitHub 项目 upgrade 后不应新增 GitLab 模板；用户已有同名模板时作为冲突保留不覆盖。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：bc2212dcaeb572d1166e66ccc46d8445f5bf7cf5
- 对象摘要：6cffe4565bf11adb7b0bd54e903a345d03f2a750a87174f3cae702212c628cea
- 时间：2026-10-22T08:28:44.667Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：bc2212dcaeb572d1166e66ccc46d8445f5bf7cf5
- 对象摘要：88405305b147fa6d68488e5e20ba2c0dd01b7d174f6fc0763912dbb8b1f5b580
- 时间：2026-10-22T08:28:44.741Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 对象摘要：dcda81ed0fa23beee5719fe7547d1b6f1d74a0e8c982ee3011a4e23ee0b774e8
- 时间：2026-10-22T09:43:44.520Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/pr.test.mjs::pr title selects first declared module and omits unknown modules
- 用例：CASE-075
- 命令：node --test --test-name-pattern="pr title selects first declared module and omits unknown modules" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:31.073Z

### run-2
- 条件：AC-2
- 测试：test/pr.test.mjs::branch slug precedence uses flag then task metadata then current branch
- 用例：CASE-076
- 命令：node --test --test-name-pattern="branch slug precedence uses flag then task metadata then current branch" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:32.031Z

### run-3
- 条件：AC-3
- 测试：test/pr.test.mjs::pr verification section lists every recorded run in order
- 用例：CASE-077
- 命令：node --test --test-name-pattern="pr verification section lists every recorded run in order" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:33.137Z

### run-4
- 条件：AC-4
- 测试：test/pr.test.mjs::init platform selects github gitlab or both managed templates
- 用例：CASE-078
- 命令：node --test --test-name-pattern="init platform selects github gitlab or both managed templates" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:34.303Z

### run-5
- 条件：AC-4
- 测试：test/pr.test.mjs::upgrade adds only templates for the configured platform
- 用例：CASE-079
- 命令：node --test --test-name-pattern="upgrade adds only templates for the configured platform" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:34.721Z

### run-6
- 条件：AC-5
- 测试：test/pr.test.mjs::pr task section is plain text and PR MR neutral
- 用例：CASE-080
- 命令：node --test --test-name-pattern="pr task section is plain text and PR MR neutral" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:35.165Z

### run-7
- 条件：AC-5
- 测试：test/pr.test.mjs::pr draft derives title, five sections and current AC state
- 用例：CASE-068
- 命令：node --test --test-name-pattern="pr draft derives title, five sections and current AC state" test/pr.test.mjs
- 结果：passed
- 退出码：0
- 提交：382bec85adc09db3325952a6e3bab03acddd1f46
- 代码树摘要：dcf7cfa4fcf0644e12f1aecc2997c9ad366d8a6884b83616fc2dcdee085be36d
- 来源：executed
- 时间：2026-10-22T09:43:40.225Z

## 关闭

### close
- 状态：已关闭
- 原因：已验收，纳入 20261023-hygiene-p1p2 卫生收尾关闭
- 时间：2026-10-23T07:28:48.067Z

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
- 本次改动涉及模块 initialization：建议回归该模块 18 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 4 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 32 条用例及经过它的场景 CASE-055, CASE-001。
