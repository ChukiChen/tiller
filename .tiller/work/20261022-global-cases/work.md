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

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
