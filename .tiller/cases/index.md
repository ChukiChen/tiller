# 全局用例

本目录是产品级回归事实源。`task.md` 只记录单次任务；可跨任务复用的行为、接口、性能和安全性结论在这里按模块维护，跨模块端到端路径放在场景中。这里只保存可提交的声明和测试引用，不保存执行日志、全文快照或证据包。

## 目录

```text
.tiller/cases/
  index.md
  modules/<模块>/behavior.json
  modules/<模块>/interface.json
  modules/<模块>/performance.json
  modules/<模块>/security.json
  scenarios/<场景名>.json
```

- 模块名必须与 `.tiller/specs/modules/` 的目录一致；类型只允许 `behavior`、`interface`、`performance`、`security`，按需建文件，不建空文件。
- `behavior` 写功能做什么、结果是否正确；`interface` 写 CLI 参数、输出格式、退出码、导出函数和文件格式；`performance` 写耗时或规模上限；`security` 写密钥拦截、路径越界等拒绝行为。
- 场景声明经过的 `modules` 和端到端 `test_ref`，用于串联跨模块流程。场景也使用全局稳定编号。

## 模块文件

```json
{
  "schemaVersion": 1,
  "module": "workflow",
  "kind": "behavior",
  "cases": [{
    "id": "CASE-002",
    "title": "标准任务需要设计确认",
    "requirements": [".tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认"],
    "modules": ["workflow"],
    "test_ref": "test/flow-cli.test.mjs::standard flow blocks before design confirmation and accepts design after requirements",
    "source": ["src/flow.ts"]
  }]
}
```

每个模块文件的 `module`、`kind` 必须与路径一致，每条用例的 `modules` 必须包含所属模块。`test_ref` 必须写成 `文件::测试名`；文件、具名测试和所有引用路径都必须存在。

## 场景文件

```json
{
  "schemaVersion": 1,
  "scenarios": [{
    "id": "CASE-001",
    "title": "小改动完成需求、实现、验证和验收",
    "requirements": [".tiller/specs/modules/workflow/requirements.md"],
    "modules": ["workflow", "verification", "initialization"],
    "test_ref": "test/flow-cli.test.mjs::small flow produces one task file and records verified acceptance without raw logs",
    "source": ["src/flow.ts", "src/core.ts"]
  }]
}
```

## 用例先行

需求确认后，在实现前把每条 `AC` 转为新增或修改的全局用例；再按 `test_ref` 编写测试，最后实现。`verify` 会根据测试引用自动记录用例编号，`task.md` 的每条验证至少包含：

```text
- 条件：AC-1
- 用例：CASE-002
- 测试：test/flow-cli.test.mjs::standard flow ...
- 命令、结果、退出码、提交、代码树摘要
```

`check` 会阻塞没有用例编号、引用了不存在的用例、验证测试与用例 `test_ref` 不一致，或验证已过期的验收条件。编号跨文件和场景唯一；已有 `CASE-001..015` 保持原号。`check` 还会按模块/类型汇总数量、列出场景、提示未被场景覆盖的模块，并在本次改动命中模块源码或规格时提示回归该模块用例和经过它的场景。

执行结果属于当前任务，按 `task.md` 的“命令、结果、提交、代码树摘要”记录；详细证据从 Git 取回或重跑。
