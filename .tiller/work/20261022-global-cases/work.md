# 恢复轻量全局用例事实库

<!-- tiller-flow:v1 {"version":1,"id":"20261022-global-cases","type":"improvement","size":"small","created":"2026-10-22T00:39:44.000Z","base":"3010361","scope":["src","test","resources","AGENTS.md","README.md",".tiller"],"preExisting":{}} -->

## 目标

在默认 `flow` 工作流旁恢复产品级回归事实：`work.md` 只记录单次任务，`.tiller/cases/*.json` 保存可长期复用的用例声明，但不恢复旧 verification 的 check/report/证据包审计体系，也不提升版本号。

## 验收条件

- AC-1: 新建 `.tiller/cases/` 事实库，至少包含默认流程的 12 条非占位用例，每条有唯一编号、标题、需求/模块引用、自动化 `test_ref` 和源码路径
- AC-2: 默认 `check` 基础校验用例 JSON、引用路径、具名测试和重复编号，并对未命中全局用例的本次验证给出提示，不新增命令
- AC-3: README、使用指引、工程索引、规则和 context 说明全局用例与单次 `work.md` 的分工，并明确不保存执行日志或证据包
- AC-4: `package.json`、CLI 与资源版本保持 0.5.0，自举 `resourceVersion` 保持 0.4.0；build、lint、typecheck、完整测试和包冒烟通过

## 设计

使用 `.tiller/cases/*.json` 作为声明式单一事实来源，根对象带 `schemaVersion: 1`，每条用例保存稳定 `id`、`title`、`requirements`、`modules`、`test_ref` 与 `source`。当前默认流程用例集中在 `flow.json`，`test_ref` 直接引用现有 `test/flow-cli.test.mjs` 用例名。

`checkFlow` 读取用例库并校验 JSON 结构、跨文件唯一编号、需求与源码路径、测试文件及具名测试是否存在；本次 `verify` 的测试引用未命中任何用例时只给提示。CLI 不增加 case/check/report 命令，也不保存执行日志、全文快照或证据包。

## 确认

尚无确认。

## 验证

### run-1
- 条件：AC-1
- 测试：test/rules.test.mjs::global cases map to existing requirements, sources and named tests
- 命令：npm run test:rules
- 结果：passed
- 退出码：0
- 提交：d59a9c2a3089c50be4d7e05096acb75d4b947953
- 代码树摘要：9566e54ad62ccc78b9a922ab5f583e267671f27dcf319a24fea95490d94d6989
- 来源：executed
- 时间：2026-10-22T00:40:11.000Z

### run-2
- 条件：AC-2
- 测试：test/flow-cli.test.mjs::global cases accept resolvable refs and report unmapped verification tests
- 命令：npm run test:e2e
- 结果：passed
- 退出码：0
- 提交：d59a9c2a3089c50be4d7e05096acb75d4b947953
- 代码树摘要：9566e54ad62ccc78b9a922ab5f583e267671f27dcf319a24fea95490d94d6989
- 来源：executed
- 时间：2026-10-22T00:40:11.000Z

### run-3
- 条件：AC-3
- 测试：test/rules.test.mjs
- 命令：npm run test:rules
- 结果：passed
- 退出码：0
- 提交：d59a9c2a3089c50be4d7e05096acb75d4b947953
- 代码树摘要：9566e54ad62ccc78b9a922ab5f583e267671f27dcf319a24fea95490d94d6989
- 来源：executed
- 时间：2026-10-22T00:40:11.000Z

### run-4
- 条件：AC-4
- 测试：test/suites.json
- 命令：npm run build && npm run lint && npm run typecheck && npm test && npm run test:package
- 结果：passed
- 退出码：0
- 提交：d59a9c2a3089c50be4d7e05096acb75d4b947953
- 代码树摘要：9566e54ad62ccc78b9a922ab5f583e267671f27dcf319a24fea95490d94d6989
- 来源：executed
- 时间：2026-10-22T00:40:11.000Z

## 自检

- [ ] 需求确认有效（本任务按用户直接实施指令执行，未另设展示后的需求确认）
- [x] 该任务无需设计确认
- [x] 验收条件均有当前通过的测试引用
- [x] 全局用例引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 缺少需求确认。技术结果和用户实施指令不替代后续交付验收。
