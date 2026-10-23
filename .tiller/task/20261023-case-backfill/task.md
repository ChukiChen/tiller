# 历史测试回填 CASE 关联

<!-- tiller-task:v1 {"version":1,"id":"20261023-case-backfill","type":"validation","size":"standard","created":"2026-10-23T04:46:41.105Z","base":"a3f604280fa3466675764ae10b84bf4da9204b3c","scope":["test",".tiller/cases",".tiller/task"],"preExisting":{},"format":"structured","slug":"case-backfill","summary":"历史测试名回填 CASE"} -->

## 需求

### 目标

将历史测试中尚未在测试名引用 CASE-xxx 的顶层用例回填关联：优先映射到语义匹配的既有 CASE；无法匹配时先 case add 新用例再改测试名。关联方向为测试→用例（测试名含 CASE-NNN），不在用例 MD 写入 test_ref。不处理 check 中「用例未绑 AC」的历史告警（除非为新用例所必需）。版本保持 0.5.0。不动 src，除非扫描器缺陷迫使极小修复。

### 范围

- 做：`test`、`.tiller/cases`、`.tiller/task`
- 不做：`test`、`.tiller/cases`、`.tiller/task` 以外的文件
- 涉及模块或文件：`test`、`.tiller/cases`、`.tiller/task`

### 验收条件

- AC-1: 清单所列文件中此前未标注的顶层 test(...) 测试名均含 CASE-NNN（优先复用语义匹配的既有用例；否则先 case add 再命名）；嵌套/模板字面量测试名同样要求
- AC-2: 无测试引用不存在的 CASE id（CASE-900/901/999 夹具除外并保持不动）；一条测试可覆盖多个 CASE；无覆盖测试的旧用例可保持待实现，不删除
- AC-3: 全量 build/lint/typecheck/test/test:package 通过；package.json 版本仍为 0.5.0
- AC-4: task.md 含映射表：test 文件::旧测试名 → CASE-xxx（新建或复用）及简要理由

## 设计

### 方案

- 清单（权威起点，约 58 条顶层未标注）：`test/core.test.mjs`（20）、`test/runtime.test.mjs`（11）、`test/usage-resources.test.mjs`（8）、`test/upgrade.test.mjs`（7）、`test/rules.test.mjs`（6，部分已有）、`test/repository-paths.test.mjs`（3）、`test/flow-cli.test.mjs`（2：`file-level verification…`、`default workflow source uses flow naming…`）、`test/verification-integrity.test.mjs`（1：`a failed private report cannot pass…`）。`verification-integrity` 内嵌套夹具名（real behavior / ghost 等）若非顶层产品断言可不强行编号，但该文件清单中的那 1 条必须回填。
- 对每条未标注测试：先在 `.tiller/cases/` 检索语义匹配的既有 CASE（标题/意图/模块）；匹配则把 `CASE-NNN`（可多个）前缀进测试名，保留英文叙述。不匹配则 `tiller case add 20261023-case-backfill ...` 登记新用例（编号从当前最高+1，现为 114 起），再改测试名。关联仅测试→用例；用例 MD 不写 `test_ref`。
- 嵌套或模板字面量（如 runtime/upgrade 中 `` `... ${x} ...` ``）也须在最终展示的测试名字符串中含 `CASE-NNN`。
- 夹具 id `CASE-900`/`CASE-901`/`CASE-999` 保持不动。不伪造历史任务的确认/验证/验收。不处理「用例未绑 AC」的历史 check 告警，除非新建用例需要挂到本任务 AC。
- 实现过程中维护映射表写入本 `task.md`（实现附注或设计后追加「映射」小节均可，以 AC-4 可核对为准）：`文件::旧名 → CASE-xxx（reuse|new）`。
- 中途只跑相关测试；结束跑全量 `npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`（包冒烟若需独立缓存，用环境变量指向临时目录，勿把绝对路径写入本记录）。版本保持 0.5.0。

### 取舍

- 优先复用既有 CASE，避免为同一行为复制用例；仅在无合理匹配时新建。
- 测试名内嵌 CASE，不用紧邻注释（除非扫描器明确只认注释且改名会破坏过多断言——默认改名）。
- 不扩大到 src/文档大改；不删除「待实现」旧用例；不把 AC 未绑告警纳入本轮。

### 影响与风险

- 受影响：上述 test 文件、`.tiller/cases/` 可能新增 CASE、本任务 `task.md` 映射表。
- 风险：误匹配导致测试名挂错 CASE——用映射表与用例标题交叉复核；模板测试名遗漏——对 inventory 文件再扫一轮无 CASE 的顶层 `test(`。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：boon yu
- 提交：a3f604280fa3466675764ae10b84bf4da9204b3c
- 对象摘要：4aadbcfcf29a512b66162d6c96e851d615366a3268e144e048975a8a271c951d
- 时间：2026-10-23T04:46:52.947Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：boon yu
- 提交：a3f604280fa3466675764ae10b84bf4da9204b3c
- 对象摘要：b815ad89321463d7fa74a7ca5f7d060ec29066294735cb117687f3b4e5c8446d
- 时间：2026-10-23T04:47:02.852Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/flow-cli.test.mjs::CASE-154 file-level verification references do not bind every test in the file
- 用例：CASE-154
- 命令：node '--test-name-pattern=^CASE-154 file-level verification references do not bind every test in the file$' --test-reporter=./.tiller/local/verify-vEgl1y/reporter.mjs --test-reporter-destination=.tiller/local/verify-vEgl1y/report.jsonl test/flow-cli.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-case-backfill/run-1.log
- 提交：a3f604280fa3466675764ae10b84bf4da9204b3c
- 代码树摘要：803a912233a74abb19e1f2b14543658eb3bd4a409ed5c907b2a399e4c2077cfa
- 时间：2026-10-23T06:41:44.586Z

### run-2
- 条件：AC-2
- 测试：test/case-redesign.test.mjs::CASE-103 CASE-156 repository history and docs use the new case model
- 用例：CASE-156
- 命令：node '--test-name-pattern=^CASE-103 CASE-156 repository history and docs use the new case model$' --test-reporter=./.tiller/local/verify-2PKjUD/reporter.mjs --test-reporter-destination=.tiller/local/verify-2PKjUD/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-case-backfill/run-2.log
- 提交：a3f604280fa3466675764ae10b84bf4da9204b3c
- 代码树摘要：803a912233a74abb19e1f2b14543658eb3bd4a409ed5c907b2a399e4c2077cfa
- 时间：2026-10-23T06:41:53.322Z

### run-3
- 条件：AC-3
- 测试：test/work-migration.test.mjs::CASE-113 CASE-157 migration preserves the 0.5.0 release contract and full verification entry
- 用例：CASE-157
- 命令：node '--test-name-pattern=^CASE-113 CASE-157 migration preserves the 0\.5\.0 release contract and full verification entry$' --test-reporter=./.tiller/local/verify-1SB5r1/reporter.mjs --test-reporter-destination=.tiller/local/verify-1SB5r1/report.jsonl test/work-migration.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-case-backfill/run-3.log
- 提交：a3f604280fa3466675764ae10b84bf4da9204b3c
- 代码树摘要：803a912233a74abb19e1f2b14543658eb3bd4a409ed5c907b2a399e4c2077cfa
- 时间：2026-10-23T06:41:53.802Z

### run-4
- 条件：AC-4
- 测试：test/case-redesign.test.mjs::CASE-158 case-backfill task.md retains mapping table for historical test names
- 用例：CASE-158
- 命令：node '--test-name-pattern=^CASE-158 case-backfill task\.md retains mapping table for historical test names$' --test-reporter=./.tiller/local/verify-xZrNnt/reporter.mjs --test-reporter-destination=.tiller/local/verify-xZrNnt/report.jsonl test/case-redesign.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261023-case-backfill/run-4.log
- 提交：a3f604280fa3466675764ae10b84bf4da9204b3c
- 代码树摘要：803a912233a74abb19e1f2b14543658eb3bd4a409ed5c907b2a399e4c2077cfa
- 时间：2026-10-23T06:41:54.242Z

## 自检

- [x] 需求确认有效
- [x] 该任务无需设计确认
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- AC-1 尚无验证。
- AC-2 未绑定全局用例；先用 case add 把验收条件转为用例，并在测试名中引用用例编号。
- AC-2 尚无验证。
- AC-3 未绑定全局用例；先用 case add 把验收条件转为用例，并在测试名中引用用例编号。
- AC-3 尚无验证。
- AC-4 未绑定全局用例；先用 case add 把验收条件转为用例，并在测试名中引用用例编号。
- AC-4 尚无验证。
- 交付范围存在未提交改动：.tiller/cases/modules/initialization/behavior.md、.tiller/cases/modules/initialization/interface.md、.tiller/cases/modules/initialization/security.md、.tiller/cases/modules/standards/behavior.md、.tiller/cases/modules/verification/interface.md、.tiller/cases/modules/verification/security.md、.tiller/cases/modules/workflow/interface.md、test/case-redesign.test.mjs、test/core.test.mjs、test/flow-cli.test.mjs、test/repository-paths.test.mjs、test/review-release.test.mjs、test/rules.test.mjs、test/runtime.test.mjs、test/upgrade.test.mjs、test/usage-resources.test.mjs、test/verification-integrity.test.mjs

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 56 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 12 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 31 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 54 条用例及经过它的场景 CASE-055, CASE-001。
- 未检测到任务基线后的 `.tiller/specs/` 或 `.tiller/context/` 回写；如本次形成长期有效结论，请同步；纯过程性变更可忽略。
- 修改的测试文件移除了 65 个测试用例（请确认对应功能已删除；详情见 Git diff）。

## 映射

| 文件::旧测试名 | CASE | 方式 | 理由 |
|---|---|---|---|
| `test/core.test.mjs::initialization preserves content and repeated initialization is a no-op` | CASE-050 | reuse | 既有用例覆盖空工程初始化且不覆盖已有内容。 |
| `test/core.test.mjs::initialization digests tolerate managed line-ending conversion but reject content changes` | CASE-114 | new | 需要单独记录初始化摘要的换行容忍与实质变化拒绝。 |
| `test/core.test.mjs::workspace limits repository scope and never changes repository content` | CASE-115 | new | 覆盖工作区仅管理声明仓库且不改业务内容。 |
| `test/core.test.mjs::workspace groups repositories while keeping stable ids, navigation and ignore rules` | CASE-116 | new | 覆盖分组仓库的稳定编号、导航与忽略规则。 |
| `test/core.test.mjs::workspace refuses ambiguous shorthand and never silently remaps initialized ids` | CASE-117 | new | 覆盖歧义简写拒绝和编号不静默重映射。 |
| `test/core.test.mjs::grouped repository parent symlinks and fabricated metadata mappings are rejected` | CASE-118 | new | 覆盖分组父链接与伪造仓库映射的拒绝。 |
| `test/core.test.mjs::workspace cannot register a management worktree as an independent business repository` | CASE-119 | new | 覆盖管理仓库工作树的 Git 身份冲突拒绝。 |
| `test/core.test.mjs::resource edits and unknown versions are preserved and block writes` | CASE-051（reuse）、CASE-028（reuse） | reuse | 既有用例分别覆盖用户资源修改保护和未知元信息版本拒绝。 |
| `test/core.test.mjs::recover validates every before/after before restoring and refuses later edits` | CASE-120 | new | 覆盖恢复前全量校验和后续编辑冲突。 |
| `test/core.test.mjs::file transactions reject mismatched baselines and serialize writers` | CASE-121 | new | 覆盖事务基线错配和写锁串行化。 |
| `test/core.test.mjs::paths reject traversal and symbolic-link escapes` | CASE-122 | new | 覆盖路径越界和符号链接逃逸。 |
| `test/core.test.mjs::git ignore conflicts are detected before shared files are written` | CASE-036 | reuse | 既有用例覆盖写入前拒绝 Git 忽略路径。 |
| `test/core.test.mjs::schema validation refuses missing resource baselines and malicious recovery targets` | CASE-028 | reuse | 既有用例覆盖缺失元信息和未知版本在写入前拒绝。 |
| `test/core.test.mjs::transactions reject local path casing aliases and noncanonical roots before writes` | CASE-123 | new | 覆盖事务路径大小写别名和非规范根。 |
| `test/core.test.mjs::workspace verifies actual Git repositories and accepts valid gitdir files` | CASE-124 | new | 覆盖真实 Git 仓库验证与 gitdir 间接布局。 |
| `test/core.test.mjs::local ignore negations cannot expose transaction originals before root ignore is installed` | CASE-036 | reuse | 既有用例覆盖事务边界在写入前处理忽略路径。 |
| `test/core.test.mjs::shared path checks reject ignored evidence while allowing non-Git projects` | CASE-031 | reuse | 既有用例覆盖共享写入资格与新增忽略规则。 |
| `test/core.test.mjs::only current resource metadata is readable and historical bytes remain untouched` | CASE-028 | reuse | 既有用例覆盖未知或缺失元信息在创建锁前拒绝。 |
| `test/core.test.mjs::shared path checks honor ancestor ignores and reject bare repositories` | CASE-125 | new | 覆盖祖先忽略规则和裸仓库拒绝。 |
| `test/core.test.mjs::shared path checks preserve fatal configuration and missing Git fallback failures` | CASE-126 | new | 覆盖 Git 致命配置与缺失可执行文件的失败语义。 |
| `test/runtime.test.mjs::registered CLI survives cold launch and preserves argv, stdin, cwd and exit status` | CASE-127 | new | 覆盖冷启动参数、输入、目录和退出码透传。 |
| `test/runtime.test.mjs::runtime binding checks current launcher bytes even after a successful status query` | CASE-128 | new | 覆盖状态查询后重新核对当前启动器字节。 |
| `test/runtime.test.mjs::local installations are found without binding; stale and missing installations offer recovery` | CASE-129 | new | 覆盖本地 CLI 发现以及过期、缺失安装恢复。 |
| `test/runtime.test.mjs::current resources skip ${oldVersion} local installation and use the exact current bound CLI` | CASE-130 | new | 覆盖过期本地安装被跳过并绑定精确当前 CLI。 |
| `test/runtime.test.mjs::current resources reject ${oldVersion} CLI without changing installation or metadata` | CASE-131 | new | 覆盖过期本地 CLI 被拒绝且安装和元信息不变。 |
| `test/runtime.test.mjs::unsupported resources ${resourceVersion} preserve ${existing ? 'existing' : 'absent'} runtime binding` | CASE-132 | new | 覆盖不受支持资源版本下绑定状态保留。 |
| `test/runtime.test.mjs::malformed or foreign binding and link paths are preserved and rejected` | CASE-133 | new | 覆盖损坏、他项目绑定和链接路径拒绝。 |
| `test/runtime.test.mjs::real Git worktree resolves the registered main checkout without copied local data` | CASE-134 | new | 覆盖工作树解析主检出和复制本地数据隔离。 |
| `test/runtime.test.mjs::old resource directories cannot claim shared entry ready` | CASE-135 | new | 覆盖缺失共享启动器时不能就绪或绑定。 |
| `test/runtime.test.mjs::damaged CLI is not reported ready and rebinding restores stale installation` | CASE-136 | new | 覆盖损坏 CLI 不就绪及重新绑定恢复。 |
| `test/runtime.test.mjs::available project CLI does not require Git for direct use` | CASE-137 | new | 覆盖工程内 CLI 直接使用不依赖 Git。 |
| `test/runtime.test.mjs::runtime status rejects modified shared launcher using managed metadata` | CASE-138 | new | 覆盖受管摘要检测被修改启动器。 |
| `test/runtime.test.mjs::binding rejects a changed launcher before replacing an existing local binding` | CASE-139 | new | 覆盖重新绑定前拒绝已变化启动器。 |
| `test/usage-resources.test.mjs::initialization supplies current usage and launcher with discoverable links and no machine paths` | CASE-050 | reuse | 既有用例覆盖初始化生成受管骨架且保留已有内容。 |
| `test/usage-resources.test.mjs::current entry and rules retain default-flow stage, scope, context and compatibility navigation` | CASE-084 | reuse | 既有用例覆盖入口 usage 与规则文案完整性。 |
| `test/usage-resources.test.mjs::current noop preserves index surroundings and explicit mappings (${workspace})` | CASE-140 | new | 覆盖无变更升级保留索引周边和显式仓库映射。 |
| `test/usage-resources.test.mjs::existing customized ${name} is protected on init and current noop` | CASE-141 | new | 覆盖现有自定义 usage 和启动器在初始化、无变更操作中的保护。 |
| `test/usage-resources.test.mjs::current noop binds raw shared-resource bytes even across permitted EOL conversion` | CASE-142 | new | 覆盖原始资源字节绑定和允许的换行转换。 |
| `test/usage-resources.test.mjs::current metadata requires the complete managed set and rejects historical versions` | CASE-028 | reuse | 既有用例覆盖未知或缺失元信息的拒绝。 |
| `test/usage-resources.test.mjs::ignored current entry paths block inspection and noop without changing originals` | CASE-036 | reuse | 既有用例覆盖事务边界拒绝忽略路径且不写原文件。 |
| `test/usage-resources.test.mjs::managed resource EOL equivalence is bidirectional and restricted to the distributed allowlist` | CASE-143 | new | 覆盖分发白名单内换行等价的双向边界。 |
| `test/usage-resources.test.mjs::resource checkout EOL conversion keeps inspection ready and preserves bytes on repeated init` | CASE-144 | new | 覆盖检出换行转换后重复初始化保持字节。 |
| `test/usage-resources.test.mjs::initialization and upgrade accept existing distributed resources with alternate EOL without rewriting them` | CASE-145 | new | 覆盖初始化和升级接受替代换行且不重写。 |
| `test/upgrade.test.mjs::current noop preserves every original byte (${workspace})` | CASE-146 | new | 覆盖当前版本无变更升级保留每个原始字节。 |
| `test/upgrade.test.mjs::old and unknown versions refuse without migration (${workspace})` | CASE-113（reuse）、CASE-028（reuse） | reuse | 既有用例分别覆盖 0.5.0 发布契约和未知元信息版本拒绝。 |
| `test/upgrade.test.mjs::modified current managed content is preserved: ${relative}` | CASE-051 | reuse | 既有用例覆盖受管资源刷新时保留用户修改。 |
| `test/upgrade.test.mjs::compatible previous resources refresh unmodified managed files and metadata atomically` | CASE-051 | reuse | 既有用例直接覆盖兼容资源刷新与用户修改保护。 |
| `test/upgrade.test.mjs::stale plan binds section-external bytes and permissive clauses remain conflicts` | CASE-147 | new | 覆盖过期计划和宽松审批冲突识别。 |
| `test/upgrade.test.mjs::current transaction with mixed before/after files blocks noop and recovers originals` | CASE-036 | reuse | 既有用例覆盖事务边界在写入前拒绝。 |
| `test/upgrade.test.mjs::verification failure retains recovery data and later user edits are never overwritten` | CASE-148 | new | 覆盖复验失败保留恢复数据及后续编辑阻止覆盖。 |
| `test/upgrade.test.mjs::current managed sections preserve both EOL directions and all outside bytes` | CASE-149 | new | 覆盖受管分段双向换行和节外字节保持。 |
| `test/upgrade.test.mjs::EOL equivalence accepts distributed checkout conversion but rejects substantive edits` | CASE-150 | new | 覆盖检出换行等价与实质修改拒绝。 |
| `test/upgrade.test.mjs::upgrade checks the current contract without a version migration story` | CASE-113 | reuse | 既有用例覆盖 0.5.0 发布契约不变。 |
| `test/rules.test.mjs::entry keeps the small and standard flows explicit and bounded` | CASE-084 | reuse | 既有用例覆盖入口文案边界。 |
| `test/rules.test.mjs::core and usage describe the only supported default-flow record path` | CASE-103 | reuse | 既有用例覆盖历史用例与文档测试设计语义。 |
| `test/rules.test.mjs::initialization preserves the guidance reading chain and valid links` | CASE-050 | reuse | 既有用例覆盖初始化生成受管骨架。 |
| `test/rules.test.mjs::task records use Git and one task.md rather than snapshots or evidence packages` | CASE-111 | reuse | 既有用例覆盖现行文档只使用 task 目录。 |
| `test/rules.test.mjs::activity rules keep requirements, design, implementation and delivery bounded` | CASE-151 | new | 覆盖活动规则对需求、设计、实现、交付的边界约束。 |
| `test/rules.test.mjs::README describes only the default flow and release-time versioning` | CASE-109 | reuse | 既有用例覆盖评审发布与文档同步。 |
| `test/repository-paths.test.mjs::repository paths preserve explicitly registered direct and grouped layouts` | CASE-152 | new | 覆盖显式直接、分组和根仓库路径解析。 |
| `test/repository-paths.test.mjs::repository mapping validation rejects ambiguous, escaping, incomplete and reserved mappings` | CASE-030 | reuse | 既有用例覆盖显式元信息输入校验。 |
| `test/repository-paths.test.mjs::historical versions cannot supply or infer repository mappings` | CASE-153 | new | 覆盖历史版本不得提供或推断仓库映射。 |
| `test/flow-cli.test.mjs::file-level verification references do not bind every test in the file` | CASE-154 | new | 覆盖文件级验证引用不建立全文件用例绑定。 |
| `test/flow-cli.test.mjs::default workflow source uses flow naming instead of lite` | CASE-155 | new | 覆盖默认工作流源码 flow 命名和旧 lite 模块移除。 |
| `test/verification-integrity.test.mjs::a failed private report cannot pass when the test process exits zero` | CASE-093 | reuse | 既有用例直接覆盖私有报告防止伪造通过。 |
| `test/case-redesign.test.mjs::repository history and docs use the new case model` | CASE-103（reuse）、CASE-156（new） | reuse+new | 用例库完整扫描覆盖无悬空引用（AC-2）；计数更新至 158。 |
| `test/work-migration.test.mjs::migration preserves the 0.5.0 release contract and full verification entry` | CASE-113（reuse）、CASE-157（new） | reuse+new | 回填后版本与全量验证入口仍为 0.5.0（AC-3）。 |
| `test/case-redesign.test.mjs::case-backfill task.md retains mapping table for historical test names` | CASE-158 | new | 核对 task.md「映射」节保留回填对照表（AC-4）。 |
