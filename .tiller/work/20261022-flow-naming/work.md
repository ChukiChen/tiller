# 将默认工作流模块从 lite 重命名为 flow

<!-- tiller-flow:v1 {"version":1,"id":"20261022-flow-naming","type":"improvement","size":"small","created":"2026-10-22T00:28:02.435Z","base":"5bf18e7f18bc976f5ac18128c32164a960b949d2","scope":["src","test","scripts","resources","AGENTS.md","README.md",".tiller"],"preExisting":{}} -->

## 目标

默认工作流模块、类型、函数、测试与文档不再使用 lite 作为名称，同时保持行为不变；版本号不提升。

## 验收条件

- AC-1: `src/lite.ts` 重命名为 `src/flow.ts`，`Lite*`/`*Lite` 符号重命名为 `Flow*`，函数导出改为 `startFlow`/`confirmFlow` 等
- AC-2: CLI、测试、打包脚本和活动文档中的 `lite`/`lightweight-cli` 引用全部同步更新
- AC-3: `build`、`lint`、`typecheck`、完整 `npm test` 与 `test:package` 全部通过且版本号不变

## 设计

使用 `flow` 表示默认工作流：模块改为 `src/flow.ts`，类型和导出统一使用 `Flow` 后缀，测试文件改为 `test/flow-cli.test.mjs`。历史工作目录标识保持原路径，只同步其中指向当前模块和测试的叙述。

## 确认

尚无确认。

## 验证

### run-1
- 条件：AC-1
- 测试：test/flow-cli.test.mjs
- 命令：npm run test:e2e
- 结果：passed
- 退出码：0
- 提交：fb3fb1a03062b63b084021936876fb6848677efe
- 代码树摘要：d929ec6f4b1cc1cca41cd125bd1a0d620750b7301d8f1f91fcadc317336682c7
- 来源：executed
- 时间：2026-10-22T00:29:51.248Z

### run-2
- 条件：AC-2
- 测试：test/flow-cli.test.mjs
- 命令：npm run test:rules && npm run test:e2e
- 结果：passed
- 退出码：0
- 提交：fb3fb1a03062b63b084021936876fb6848677efe
- 代码树摘要：d929ec6f4b1cc1cca41cd125bd1a0d620750b7301d8f1f91fcadc317336682c7
- 来源：executed
- 时间：2026-10-22T00:29:51.248Z

### run-3
- 条件：AC-3
- 测试：test/suites.json
- 命令：npm run build && npm run lint && npm run typecheck && npm test && npm run test:package
- 结果：passed
- 退出码：0
- 提交：fb3fb1a03062b63b084021936876fb6848677efe
- 代码树摘要：d929ec6f4b1cc1cca41cd125bd1a0d620750b7301d8f1f91fcadc317336682c7
- 来源：executed
- 时间：2026-10-22T00:29:21.503Z

## 自检

交付前运行 check；验收后运行 accept。
