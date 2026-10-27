# 一轮收口合入后不变式与入口摩擦

<!-- tiller-task:v1 {"version":1,"id":"20261027-hygiene-invariants","type":"feature","size":"standard","created":"2026-10-27T11:46:47.742Z","base":"b963f40c861ecaa73f49e4220d787dbedb3e424c","scope":["src","test",".tiller","resources","scripts"],"format":"structured","slug":"hygiene-invariants"} -->

## 需求

### 使用场景

一轮狗粮后主路径通，但仍因入口与合入后副作用反复出软摩擦。维护者要求一次性收口：锁合入后不变式，并补齐短目标落地、commit scope 误报。安装后 tiller 在 PATH，用户与测试都按**一个 tiller**用，不依赖 runtime bind。

### 目标

需求来源：`.tiller/specs/modules/workflow/hygiene-invariants.md`

一轮实现合入后工作区不变式与入口摩擦修复；版本 0.5.0。

### 业务范围

- 做：不变式测试；`--requirement` 生成可 confirm 的结构化骨架；commit/check 模块 scope 误报修复；CASE/文档；测试与狗粮按 PATH 单一 CLI。
- 不做：升版本；自动/手动 runtime bind 主路径或验收；把 `--requirement` 改成多行全文通道；取消 case 挂模块规格；合入本 PR。
- 假设：用户描述足够时可填章节；过短则骨架+待补清单；PATH 即可用。

### 关键行为

1. merge/close 后 primary 无 tiller 未跟踪任务树，干净时可 ff。
2. `start --requirement` 得到结构化需求骨架（短目标写入），可走 confirm。
3. 产品与 CASE/狗粮按 PATH 单一 tiller；不验收、不引导 runtime bind。
4. `feat(specs):` 等不再误报模块缺失。

### 异常与边界

见 specs；`--requirement-file` 优先；可选 bind 不得进主路径文档。

### 验收条件

- AC-1: merge/close 后的自动化测试断言 primary 无因 tiller materialize/种子产生的未跟踪任务树，且在干净工作区可快进；相关不变式有 CASE
- AC-2: 仅 `--requirement` 启动的任务，其 task.md 需求含结构化章节且短目标已写入，无需空白模板手搓才能进入 confirm 路径（或失败时明确缺节）
- AC-3: 主路径文档与 dogfood/CASE 按 PATH 单一 tiller 使用；不把 runtime bind（自动或手动）列为 init/合入后必做或验收；若测试涉及 CLI，通过 PATH/`npx`/打包入口调用，不依赖 bind 状态
- AC-4: check 对 `feat(specs):` / 工作流类 commit 不再误报模块缺失；真实缺失模块仍提示
- AC-5: 0.5.0；全量测试与 package smoke 通过

## 设计

### 方案

- 不变式：在 close/merge 测试与/或 doctor 增加「primary 无未跟踪 task 树」断言；复用 #45 行为并文档化。
- 短目标落地：`startFlow` 在无 requirement-file 时用模板写入结构化需求，把 `--requirement` 填入目标/使用场景首段。
- 单一 tiller：文档与 soft/dogfood 去掉「init 后 runtime bind」步骤；测试用 PATH/打包入口，不断言 bind。
- commit scope：check 解析模块名时，对非 `specs/modules` 下的约定 scope（specs/workflow/standards 等）跳过缺失模块告警或映射到合法模块。

### 影响面

`src/flow.ts`、`src` check/commit 提示、`test/*`、usage/decisions、cases；**不**为 AC 去接 `markInitBaselineMerged`→bind。

### 影响与风险

- 影响：改 `start` 骨架、check 的 commit scope 识别、合入后不变式测试与主路径文档；不引入 runtime bind 钩子。
- 风险：骨架过短被当成可确认——须列出待补节；scope 白名单过宽可能漏报真缺模块——只豁免约定全局/工作流名。
- 回退：骨架不覆盖 `--requirement-file`；去掉 bind 主路径不改变 PATH 安装行为。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T11:57:46.593Z | b963f40c861e | — |
| 设计 | boon yu | 2026-10-27T11:57:51.992Z | e9b7c568316b | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"d066360c18b0c252472bbe6e7c47004dbad445fc1d621a26e095cae9fd0d67b3","commit":"b963f40c861ecaa73f49e4220d787dbedb3e424c","by":"boon yu","quote":"","at":"2026-10-27T11:57:46.593Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"0ab84f469fe48421d8c93713cdcc4a5338a68dbf9d64c6c30cfec2a5702f1400","commit":"e9b7c568316b7f341d7bb6d1f1aa9ee7085d9b3d","by":"boon yu","quote":"","at":"2026-10-27T11:57:51.992Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
