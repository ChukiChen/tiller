# 全局用例

本目录是产品级测试设计与回归事实源。`task.md` 只记录单次任务；可跨任务复用的行为、接口、性能和安全性设计在这里按模块维护，跨模块端到端路径放在场景中。用例写在测试之前，执行日志和证据不进入本目录。

## 目录

```text
.tiller/cases/
  index.md
  modules/<模块>/behavior.md
  modules/<模块>/interface.md
  modules/<模块>/performance.md
  modules/<模块>/security.md
  scenarios/<场景名>.md
```

- 模块名必须与 `.tiller/specs/modules/` 的目录一致；类型只允许 `behavior`、`interface`、`performance`、`security`，按需建文件，不建空文件。
- `behavior` 写功能做什么、结果是否正确；`interface` 写 CLI 参数、输出格式、退出码、导出函数和文件格式；`performance` 写耗时或规模上限；`security` 写密钥拦截、路径越界等拒绝行为。
- 场景声明经过的 `modules` 和端到端测试设计，用于串联跨模块流程。场景也使用全局稳定编号。

## 用例格式

```md
## CASE-001 失败命令返回非零

- 类型：interface
- 优先级：medium
- 模块：workflow
- 关联 AC：20261022-task#AC-1
- 需求：`.tiller/specs/modules/workflow/requirements.md`
- 源码：`src/flow.ts`

### 前置条件

- 命令可用。

### 步骤

1. 运行会失败的命令。

### 输入

- 退出码为非零的输入。

### 预期结果

命令返回非零，记录与输出一致。
```

每条用例必须有稳定编号、标题、前置条件、步骤、输入、预期结果、类型、优先级、模块、需求与源码引用，以及来源 AC `criteria`。历史空来源只提示，不伪造。

## 测试引用与用例先行

需求确认后，在实现前用 `case add` 登记用例：

```sh
tiller case add <task-id> --module workflow --kind behavior --title "流程行为" \
  --precondition "需求已确认" --step "运行流程" --input "正常输入" \
  --expected "流程完成" --criterion AC-1 --source src/flow.ts
```

`case add` 不要求测试文件，自动分配未占用的 `CASE-NNN`，返回待实现状态和骨架。随后让测试名或测试前紧邻注释引用用例编号；tiller 扫描 `test/**/*.test.*` 与 `*.spec.*` 建立 case→tests 反查。

- 一个测试可引用多个 `CASE-NNN`，一个用例也可被多个测试覆盖。
- 没有任何测试引用的用例显示「待实现」；测试引用不存在的编号会明确报错。
- `verify <task-id> --case CASE-NNN` 执行覆盖该用例的全部测试，并走 tiller 私有报告核实路径；`--test` 和 `--criterion` 继续可单独使用。
- 设计确认后，`check` 要求每条 AC 有带完整测试设计的用例；验证或验收时，要求每个用例至少有一个当前通过、已核实且未过期的引用测试。

`task.md` 的验证段按 AC 记录用例编号、测试、命令、结果、提交和日志路径。`verify` 只从私有报告核实结果；stdout/stderr 只写 `.tiller/local/logs/`。报告缺失/损坏、匹配不唯一、失败或跳过均不能通过。外部报告用 `--reported --command --result --reason`，理由必填并在默认检查中阻断，只有 `--allow-reported` 放行。

## 与规划、任务记录的分工

- `.tiller/plans/<id>.md` 保存大功能拆分、条目依赖和覆盖需求；规划确认是可选门禁。
- `.tiller/task/<id>/task.md` 保存当前任务的完整需求、设计、确认、验证与自检。
- `.tiller/cases/` 保存跨任务可回归的测试设计；它不复制任务过程，也不保存测试引用字段或执行输出。
