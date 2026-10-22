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
    "id": "CASE-052",
    "title": "规划依赖未验收时阻塞开工",
    "requirements": [".tiller/specs/modules/workflow/requirements.md#3-规划拆分"],
    "modules": ["workflow"],
    "test_ref": "test/first-batch.test.mjs::planning blocks unfinished dependencies, reports uncovered requirements and invalidates body edits",
    "source": ["src/plans.ts", "src/flow.ts"],
    "criteria": ["20261022-first-batch#AC-2"]
  }]
}
```

每个模块文件的 `module`、`kind` 必须与路径一致，每条用例的 `modules` 必须包含所属模块。`test_ref` 必须写成 `文件::测试名`；文件、具名测试和所有引用路径都必须存在。新用例用 `case add` 写入 `criteria: ["<任务>#AC-N"]`；历史 `CASE-001..049` 可以暂时为空，但 `check` 会提示。

## 场景文件

```json
{
  "schemaVersion": 1,
  "scenarios": [{
    "id": "CASE-055",
    "title": "空项目接入并完成默认流程",
    "requirements": [".tiller/specs/requirements.md#3-默认工作流"],
    "modules": ["initialization", "workflow", "verification", "standards"],
    "test_ref": "test/first-batch.test.mjs::new project runs init, plan, start, confirm, case add, verify, check and accept end to end",
    "source": ["src/core.ts", "src/flow.ts", "src/plans.ts", "src/cases.ts"],
    "criteria": ["20261022-first-batch#AC-1"]
  }]
}
```

## 用例先行

需求确认后，在实现前把每条 `AC` 转为新增或修改的全局用例，再按 `test_ref` 编写测试，最后实现。可用 `case add` 自动分配下一个编号；模块不存在时先建 `.tiller/specs/modules/<模块>/`，测试尚未存在时会返回骨架提示。

`task.md` 的每条验证至少包含：

```text
- 条件：AC-1
- 用例：CASE-052
- 测试：test/first-batch.test.mjs::planning ...
- 命令、结果、退出码、提交、代码树摘要
```

`verify` 会根据测试引用自动记录用例编号。`check` 会阻塞没有用例编号、引用了不存在的用例、验证测试与用例 `test_ref` 不一致、验证过期，或用例 `criteria` 未回指当前 AC 且该用例不是本任务新增/修改的情况。编号跨文件和场景唯一。

`verify` 只接受 `--run`，记录即执行；node:test TAP/spec 输出必须核实具名测试通过。外部报告用 `--reported --command --result --reason`，理由必填并在默认检查中阻断，只有 `--allow-reported` 放行；PR/MR 草稿标明未执行。bugfix 的 `--expect-fail` 在任务基线临时工作树证明失败，并要求当前同一测试已核实通过。standard 任务必须声明 `--target`，small 缺省 `.`。历史无核实字段的记录保持原有兼容路径。

提交主题、分支名和 PR/MR 模板同样以真实具名测试登记为接口/行为用例。`pr <task-id>` 只生成本地草稿，标题摘要按显式、任务元数据、最早规范提交和任务标题回退，模块取范围首个，变更按时间正序，关联任务用纯文本，验证按 AC 用普通嵌套列表列出全部记录；平台模板由 init/upgrade 维护，结果和远端操作仍由人确认。

确认方面，`task.md` 使用结构化需求：目标、范围、编号 AC；standard 设计包含方案、取舍、影响与风险。`confirm`、`accept`、`plan confirm` 的原话可选，工具记录确认部分、确认人、时间、提交和摘要；需求与设计独立失效。旧格式任务和旧确认继续有效。

`check` 按模块/类型汇总数量、列出场景、提示未被场景覆盖的模块，并在本次改动命中模块源码、规格或用例时提示回归该模块用例和经过它的场景。

任务阶段由 `task.md` 的确认、验证、验收和关闭事实推导。`resume` 与 `plan status` 显示阶段；已验收任务 `close` 后为已关闭，未验收终止 `close --abandon` 后为已放弃，终态需 `reopen` 才能继续。

执行结果属于当前任务，按 `task.md` 的命令、结果、提交和代码树摘要记录；详细证据从 Git 取回或重跑。

## 与规划、任务记录的分工

- `.tiller/plans/<id>.md` 保存大功能拆分、条目依赖和覆盖需求；规划确认是可选门禁。
- `.tiller/task/<id>/task.md` 保存当前任务的完整需求、设计、确认、验证与自检。
- `.tiller/cases/` 保存跨任务可回归的产品事实；它不复制任务过程，也不保存执行输出。
