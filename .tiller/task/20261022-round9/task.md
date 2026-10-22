# 第9轮：确认去原话化与结构化任务正文

<!-- tiller-task:v1 {"version":1,"id":"20261022-round9","type":"feature","size":"standard","created":"2026-10-22T05:22:30.723Z","base":"7e0d0c2c172ea73ca39805cc3b84da5b56bf4e02","scope":["src","test","resources","scripts","README.md","AGENTS.md",".tiller"],"preExisting":{"src/cases.ts":"9ce8eb9afba52fc756f900e1079f8a5c59fff950aed9d0f17100ae268b8b2535","src/cli.ts":"c181013ca53b25c5a71e2d3f1c49882efcf45e7e295431655bebd2911d21165a","src/flow.ts":"29b720e0850584382cb0e590b57d16656410fae6488a6a4769e61ce862b29510","src/plans.ts":"28ceb66d9b44c1c29c83f2b9a103ab7a99b2d06b3e1b8c3c1b50a332b889a01d","test/first-batch.test.mjs":"c9c9bf0c33451036398b065a518fc385ecdb067bcbc9fe0bebde0fb58184d5f8","test/flow-cli.test.mjs":"6456023cda6d2b76a210abfce44992e03b126b59ff4eb599aceb10b7362ac404","src/confirmer.ts":"6545b63817ebc7d6795989c0d4410ef33494d4330e3e6208d3635b15c9272ad8"},"format":"structured"} -->

## 需求

### 目标

把确认从聊天原话改为绑定结构化需求与设计正文，并让新任务以可执行模板记录目标、范围、AC、方案、取舍及影响。

### 范围

- 做：`src`、`test`、`resources`、`scripts`、`README.md`、`AGENTS.md`、`.tiller`
- 不做：`src`、`test`、`resources`、`scripts`、`README.md`、`AGENTS.md`、`.tiller` 以外的文件
- 涉及模块或文件：`src`、`test`、`resources`、`scripts`、`README.md`、`AGENTS.md`、`.tiller`

### 验收条件

- AC-1: confirm、accept 和 plan confirm 可省略原话，并记录确认人、时间、对象摘要和当时提交
- AC-2: start 生成结构化需求模板；需求确认校验目标、范围、AC，设计确认校验方案与影响，取舍可为空并提示
- AC-3: 需求与设计使用独立摘要，只改设计不使需求确认失效，改需求会使需求确认失效
- AC-4: 旧格式 task.md 和旧 quote 确认仍可读取、保持有效并可被后续写入保留
- AC-5: CLI 帮助、README、规则、specs、cases 与具名测试同步，版本号保持 0.5.0

## 设计

### 方案

在 task 元信息标记结构化格式，需求下使用目标、范围、验收条件三级标题；standard 任务预置方案、取舍、影响与风险。确认记录改为可选原话，新增确认人与确认部分，需求与设计继续使用独立摘要。旧记录没有格式标记时沿用旧正文与旧确认解析。

### 取舍

保留 `--quote` 作为可选附注，兼容既有调用和真实原话证据；不为旧任务自动改写正文，避免旧确认因格式迁移失效。

### 影响与风险

- 受影响：`confirm`、`accept`、`plan confirm`、task 解析与渲染、帮助和规则文档。
- 需回归：workflow 的阶段、确认失效、关闭/重开用例，以及 standards 的文档一致性与 verification 的 AC 映射。

## 确认

尚无确认。

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
