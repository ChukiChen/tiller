# 模块用例、场景与用例先行

<!-- tiller-task:v1 {"version":1,"id":"20261022-case-first","type":"feature","size":"standard","created":"2026-10-22T02:04:06.000Z","base":"2ef8e65ff24c2462f06aba04e4885d04e7cd6c66","scope":["src","test","resources","AGENTS.md","README.md",".tiller"],"preExisting":{}} -->

## 需求

把产品级回归事实从单文件 `.tiller/cases/flow.json` 改为按模块、类型和跨模块场景组织，并让默认流程在实现前先建立可执行用例。目标是用稳定编号把“验收条件→全局用例→具名测试→当前验证”连成可检查链路，同时保持日常任务轻量，不恢复旧审计命令、证据包或全文快照。

范围包括用例库结构、解析与校验、`verify` 自动记录用例、`check` 的映射与回归提示、相关 CLI 行为、测试、规则与文档。版本号本轮不变；历史 `.tiller/work/` 继续只读，不迁移旧审计资料。

## 验收条件

- AC-1: 全局用例按 `.tiller/cases/modules/<模块>/<behavior|interface|performance|security>.json` 与 `.tiller/cases/scenarios/<场景>.json` 组织；模块名来自 `.tiller/specs/modules/`，场景声明经过模块和端到端 `test_ref`；原 `CASE-001..015` 保持原号并完成迁移，新增性能与接口用例均有真实具名测试，编号跨文件唯一。
- AC-2: `check` 拒绝旧根目录用例、未知模块、白名单外类型、坏路径、缺失文件和不存在或未具名的测试引用；报告每模块各类型用例数、场景、未覆盖模块，并在改动命中模块源码或规格时提示回归该模块用例及经过它的场景。
- AC-3: 规则要求需求确认后先把每条 AC 转为全局用例，再按 `test_ref` 写测试并实现；`verify` 从测试引用自动写入用例编号，`check` 对缺失、失效、错配或过期的 AC→用例→测试→验证映射阻塞，不保留未说明的小改动豁免。
- AC-4: README、入口、使用指引、规则及受管副本、用例说明、相关规格和决定记录同步新结构与用例先行约定；默认必读资料不超过约 5000 字。
- AC-5: `package.json`、CLI 与资源版本本轮不提升；完成 build、lint、typecheck、完整测试和必要的包冒烟，未验证项与环境限制如实记录。

## 设计

新增 `src/cases.ts` 作为用例库唯一读取入口，集中定义类型白名单 `behavior/interface/performance/security`，解析模块文件和场景文件，校验路径、模块归属、编号唯一性、文件存在性和具名测试存在性。模块统计、场景摘要、未覆盖模块和改动相关回归提示也由该模块计算，避免 `flow.ts` 重复实现格式知识。

模块文件使用 `schemaVersion/module/kind/cases`，场景文件使用 `schemaVersion/scenarios`；每条声明都保存稳定编号、标题、需求引用、模块、具名 `test_ref` 和源码引用。场景额外以 `modules` 表示真实经过的模块。根目录旧 JSON 继续被识别为错误但不读取。

`FlowVerification` 增加 `cases` 字段。`verify` 根据测试引用自动匹配全局用例并写入 `task.md`，不增加手写 JSON 参数。`check` 要求每条 AC 的最新验证存在、通过、未过期，且其测试与至少一个存在的全局用例 `test_ref` 一致；同时汇总模块类型数量、场景和未覆盖模块，并依据本次 diff 命中模块源码或规格产生回归提示。自检清单同步展示 AC→用例→测试链路、范围、测试弱化和记录安全。

用例按实际性质迁移：流程行为归 `workflow/behavior`，帮助、参数与退出码归 `workflow/interface`，范围与密钥拒绝归 `workflow/security`；验证过期、测试弱化与用例结构归 `verification`；启动器和元信息性能测试归 `initialization/performance`。完整 start→accept 路径登记为场景。新增真实 CLI 契约测试和用例库校验测试，不使用占位引用。

## 确认

尚无 CLI 确认。负责人通过本轮任务说明直接授权实施；没有展示后取得的需求、设计或交付验收原话，不补记为人工确认。技术结果不代替后续用户验收。

## 验证

- AC-1 → CASE-046、CASE-048；命令：`bun test test/rules.test.mjs` 与兼容运行器中的 `bun test test/flow-cli.test.mjs test/rules.test.mjs`；结果：8/8、30/30 通过；提交：`2ef8e65`（本轮改动所在工作树尚未提交）。
- AC-2 → CASE-046、CASE-047；命令：兼容运行器中的 `bun test test/flow-cli.test.mjs test/rules.test.mjs`；结果：30/30 通过，覆盖结构拒绝、模块统计和回归提示；提交：`2ef8e65`（工作树未提交）。
- AC-3 → CASE-012、CASE-045；命令：兼容运行器中的 `bun test test/flow-cli.test.mjs`；结果：22/22 通过，包含缺少用例、错配和文件级松匹配拒绝；提交：`2ef8e65`（工作树未提交）。
- AC-4 → CASE-049、CASE-048；命令：`bun test test/rules.test.mjs`；结果：8/8 通过，必读资料实测 4976 字符；提交：`2ef8e65`（工作树未提交）。
- AC-5 → CASE-042 仅覆盖“版本号保持 0.5.0”这一项；命令：`npm run lint`、完整兼容测试、`npm ci --offline`、`npm run build`、`npm run typecheck`、`npm run test:package`；结果：lint 通过，相关 30/30 通过；完整兼容运行为 122/129，7 项失败中 6 项已在真实 Node 下单独通过，残余 1 项为 worktree 运行器兼容问题；`npm ci` 因离线缓存缺包失败，随后 build/typecheck/test:package 因缺少 TypeScript 与子进程 EPERM 未完成。构建、类型检查和包验证未通过，不能记为完成。

完整兼容运行命令使用临时预加载适配沙箱子进程，不进入仓库记录；其失败项均位于既有性能计数测试和运行器兼容测试，不涉及本次用例库路径。`npm test` 因 `npm ci` 未完成而无法按官方脚本执行。

## 自检

CLI `check` 当前不可执行：自举元信息 `resourceVersion` 为 0.4.0，代码契约为 0.5.0；按本轮版本策略保持原数字。未伪造人工确认、提交或构建结果。
