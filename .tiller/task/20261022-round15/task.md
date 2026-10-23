# 由 tiller 自主运行测试并核实结果

<!-- tiller-task:v1 {"version":1,"id":"20261022-round15","type":"feature","size":"standard","created":"2026-10-22T13:05:56.770Z","base":"59dd22c63af7c41729ef7453cbe9b5ac4e831083","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".gitlab",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{},"format":"structured","slug":"tiller-run-tests","summary":"由 tiller 自主运行测试并核实结果"} -->

## 需求

### 目标

第14轮的测试核实依赖解析用户自行提供的 --run 命令的标准输出，仍可通过 echo 等方式伪造已核实的通过结果，且使用上存在测试名重复输入、需手写 --test-name-pattern、输出嘈杂等问题。本轮改为由 tiller 根据声明的测试自主构造并执行测试命令，从私有报告读取结果，使验证结果无法通过输出伪造，同时简化验证操作。

### 范围

- 做：`verify` 改为只声明测试并由 tiller 自主执行 node:test、私有报告读取与核实、失败先行复用同一路径、测试运行适配器接口与项目配置、外部报告方式保留、简洁输出与日志；`check`、`accept`、`pr` 的相应调整；相关规则、usage、README、规格、用例与测试。
- 不做：实现 node:test 以外测试框架的适配器、防御被测代码有意篡改测试运行器的攻击、调用外部 CI、改写已有任务记录或提交历史、版本号变更。
- 涉及模块：workflow（verify、check、accept、pr）、initialization（project.json 验证配置）、standards（规则、usage 与必读预算）。

### 验收条件

- AC-1: verify 只声明测试（如 --test test/a.test.mjs::名称），由 tiller 构造并执行精确匹配该测试名的 node:test 命令，用户不再提供可执行命令；验证记录保存 tiller 实际执行的命令
- AC-2: 测试结果从 tiller 生成的私有报告读取，不信任标准输出；被测代码打印伪造的通过行、测试名不存在、匹配到 0 个测试、测试失败但退出码为 0 等情形均不能被核实为通过，并有测试证明
- AC-3: 缺陷修复任务的失败先行验证（--expect-fail）使用同一自主执行路径
- AC-4: 非 node:test 项目有明确出路：保留需填写理由且 check 默认阻断的外部报告方式，并提供可配置的测试运行适配器扩展接口及文档；旧的 --run 自由命令不再能产生已核实的验证结果
- AC-5: verify 默认只输出简洁摘要，详细输出写入日志文件或通过 --verbose 显示
- AC-6: 规则、usage、规格与用例同步更新，必读资料不超过约 7000 字符，版本保持 0.5.0；历史任务不因本轮新规则产生新的 check 阻断（后续代码变化导致的验证过期属于现有行为）

## 设计

### 方案

- 自主执行：`verify <id> --criterion AC-n --test <文件::测试名>` 不再接受可执行命令。tiller 通过测试运行适配器构造命令：默认 node:test 适配器执行 `node --test --test-name-pattern=<转义并锚定的精确测试名> --test-reporter=<tiller 自带报告器> --test-reporter-destination=<私有临时文件> <文件>`；仅引用文件时运行该文件全部测试。记录中保存 tiller 实际执行的命令。
- 测试前准备：project.json 可选 `verify.prepare`（参数数组，如 `["npm","run","build"]`）在执行测试前运行；准备步骤失败则验证失败，其输出不参与结果判定。
- 私有报告：报告写入 tiller 新建的私有临时目录中的文件，执行后读取并删除。核实规则：报告中存在文件与名称完全匹配的测试事件且结果为通过，匹配数恰为 1（嵌套子测试按完整名称路径匹配），且无失败事件；否则记为未核实或失败。标准输出与标准错误仅作日志，不参与判定；退出码为 0 但报告显示失败、或报告缺失、无法解析、匹配 0 个或多个时均不能核实为通过。
- 失败先行：`--expect-fail` 在任务基线的临时工作树中走同一适配器与私有报告路径（含 `verify.prepare`），要求报告中该测试结果为失败。
- 适配器扩展：`verify.runner` 缺省为 `node-test`；适配器接口包含“构造命令与报告路径”和“解析报告为测试结果”两部分，文档说明如何新增；未知适配器报错。非 node:test 项目使用 `verify --reported --command "<外部命令>" --result ... --reason "<理由>"`，`check`/`accept` 默认阻断，`--allow-reported` 放行。旧的 `--run` 参数删除，使用时报错并提示新用法。
- 输出：verify 默认只打印结论摘要（测试、结果、核实状态、日志路径）；完整输出写入 `.tiller/local/logs/<任务编号>/run-<序号>.log`（已被 .gitignore 忽略），`--verbose` 时同时实时显示。
- 历史兼容：沿用第14轮规则，已验收任务不施加新检查；历史记录中的命令与核实字段照常读取。

### 取舍

- 由 tiller 构造命令而非校验用户命令：彻底移除通过命令拼接伪造输出的入口，也省去重复输入测试名；代价是只能直接支持已有适配器的测试框架，其余走外部报告或扩展适配器。
- 私有报告文件而非解析标准输出：被测代码打印的内容无法进入判定。威胁模型是防止通过输出伪造结果，不防御有意篡改测试运行器或报告文件的测试代码，此类代码在评审中处理。
- 准备步骤作为配置而非每次参数：保持 verify 只声明测试，且准备步骤不影响结果判定。

### 影响与风险

- 受影响：`verify` 参数（删除 `--run`，新增 `--verbose`）、验证记录中的命令来源、project.json 新增 `verify` 配置、`--expect-fail` 执行路径、使用旧 `--run` 的测试、脚本与文档。
- 需回归：workflow 的 verify、check、accept、pr 用例，initialization 的 project.json 与 upgrade 用例，standards 的必读预算与文档一致性用例，历史任务的 `check`。
- 风险：node:test 名称匹配在嵌套子测试和特殊字符下的转义误差；不同 Node 版本报告器事件差异；临时目录与工作树在异常退出时需清理；本仓库测试依赖 dist，需要配置 `verify.prepare` 才能在基线工作树中运行。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：59dd22c63af7c41729ef7453cbe9b5ac4e831083
- 对象摘要：2e12219dbf56534754b9e31c57df090cee649819d4b614e0487d38a61d1b69a9
- 时间：2026-10-22T13:06:20.499Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：59dd22c63af7c41729ef7453cbe9b5ac4e831083
- 对象摘要：9837a172c2900ed19392c841fbb586c64044615485ac9707f68235a828bc068f
- 时间：2026-10-22T13:06:20.570Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 对象摘要：11836fb63a68566036c270638ce40fab848c843cb47714b96be2fe6fb4ecaef5
- 时间：2026-10-22T13:45:18.976Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/verification-integrity.test.mjs::verify constructs and executes node:test without a user command
- 用例：CASE-092
- 命令：node '--test-name-pattern=^verify constructs and executes node:test without a user command$' --test-reporter=./.tiller/local/verify-GkAGU5/reporter.mjs --test-reporter-destination=.tiller/local/verify-GkAGU5/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round15/run-7.log
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 代码树摘要：861d36b4b4477e9bbe2946b7b59dcdd198692836b610a5a778305847676c289f
- 时间：2026-10-22T13:45:06.785Z

### run-2
- 条件：AC-2
- 测试：test/verification-integrity.test.mjs::verify ignores forged stdout and rejects missing, duplicate, failed and corrupt private reports
- 用例：CASE-093
- 命令：node '--test-name-pattern=^verify ignores forged stdout and rejects missing, duplicate, failed and corrupt private reports$' --test-reporter=./.tiller/local/verify-fNAKIN/reporter.mjs --test-reporter-destination=.tiller/local/verify-fNAKIN/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round15/run-8.log
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 代码树摘要：861d36b4b4477e9bbe2946b7b59dcdd198692836b610a5a778305847676c289f
- 时间：2026-10-22T13:45:08.832Z

### run-3
- 条件：AC-3
- 测试：test/verification-integrity.test.mjs::bugfix verification requires baseline failure and current passing evidence
- 用例：CASE-094, CASE-089
- 命令：node '--test-name-pattern=^bugfix verification requires baseline failure and current passing evidence$' --test-reporter=./.tiller/local/verify-mf5qNf/reporter.mjs --test-reporter-destination=.tiller/local/verify-mf5qNf/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round15/run-9.log
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 代码树摘要：861d36b4b4477e9bbe2946b7b59dcdd198692836b610a5a778305847676c289f
- 时间：2026-10-22T13:45:11.261Z

### run-4
- 条件：AC-4
- 测试：test/verification-integrity.test.mjs::verify runner configuration and prepare are enforced
- 用例：CASE-095
- 命令：node '--test-name-pattern=^verify runner configuration and prepare are enforced$' --test-reporter=./.tiller/local/verify-OnlSlJ/reporter.mjs --test-reporter-destination=.tiller/local/verify-OnlSlJ/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round15/run-10.log
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 代码树摘要：861d36b4b4477e9bbe2946b7b59dcdd198692836b610a5a778305847676c289f
- 时间：2026-10-22T13:45:12.353Z

### run-5
- 条件：AC-5
- 测试：test/verification-integrity.test.mjs::verify writes a concise summary and verbose log
- 用例：CASE-096
- 命令：node '--test-name-pattern=^verify writes a concise summary and verbose log$' --test-reporter=./.tiller/local/verify-5JjG3H/reporter.mjs --test-reporter-destination=.tiller/local/verify-5JjG3H/report.jsonl test/verification-integrity.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round15/run-11.log
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 代码树摘要：861d36b4b4477e9bbe2946b7b59dcdd198692836b610a5a778305847676c289f
- 时间：2026-10-22T13:45:13.436Z

### run-6
- 条件：AC-6
- 测试：test/rules.test.mjs::verification guidance requires self-run tests and private reports
- 用例：CASE-097
- 命令：node '--test-name-pattern=^verification guidance requires self-run tests and private reports$' --test-reporter=./.tiller/local/verify-YLblv7/reporter.mjs --test-reporter-destination=.tiller/local/verify-YLblv7/report.jsonl test/rules.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round15/run-12.log
- 提交：22d1ff98f84a976cb2ef234a3017cb58074936b4
- 代码树摘要：861d36b4b4477e9bbe2946b7b59dcdd198692836b610a5a778305847676c289f
- 时间：2026-10-22T13:45:13.914Z

## 关闭

### close
- 状态：已关闭
- 原因：已验收，纳入 20261023-hygiene-p1p2 卫生收尾关闭
- 时间：2026-10-23T07:28:49.063Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。
- 本次改动涉及模块 initialization：建议回归该模块 19 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 8 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 44 条用例及经过它的场景 CASE-055, CASE-001。
