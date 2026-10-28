# 去掉 init tag 并收齐 pending/effective 契约

<!-- tiller-task:v1 {"version":1,"id":"20261028-init-anchor-pack","type":"feature","size":"standard","created":"2026-10-28T10:39:59.418Z","base":"1910192f877ffdeb3a8598b7b9b2481d135f9c49","scope":["src","test",".tiller/cases",".tiller/specs"],"format":"structured"} -->

## 需求

### 使用场景

- 同日 wipe 后再次 `tiller init`，不应因远端/本地残留 git tag 冲突而告警或弱化合入证明。
- 协作者与脚本读取 `tiller status` / `doctor` / `init` JSON，应只看到当前有效的初始化结论，不应再被 `project.json` 里的 `pending` 误导。
- 工程方明确要求：去掉 init tag 机制；跟踪元信息不再承载 pending/merged 状态字段；不考虑兼容旧 headRef/tag/双真相出口。

### 目标

在 0.5.0 一次整包收口 init 锚点与状态契约：证明只靠 tip SHA + 平台 PR/MR；当前结论只走 local marker + CLI effective。交付须满足下列验收条件。

### 业务范围

- 做：删除 init 创建/推送 `refs/tags/tiller-init/<id>` 的路径；`proveInitBaselineMerged` / start / doctor / close 不再依赖 tag 或 `headRef`；tracked `project.json` 的 `initBaseline` **不再包含 `status`（及为 tag 服务的 `headRef`）**；CLI/JSON 统一暴露 effective（如 `initBaselineStatus`）；同类「原始快照 vs 当前结论」出口一并扫改；同步 specs/CASE/测试。
- 不做：旧 tag/`headRef`/双字段兼容层；恢复 runtime bind/closed；本包不合入后的 wipe 狗粮。
- 假设：合入证明以 tip SHA + 平台已合入 PR/MR 为主；本地 `.tiller/local/init-baseline-merged.json` 仅缓存；版本仍 0.5.0。

### 关键行为

- AC-1：`init` 成功路径不创建、不推送任何 tiller-init git tag；证明与 close/start/doctor 不依赖 tag 或 headRef。
- AC-2：tracked `project.json` 的 `initBaseline` 不含 `status`；当前结论只来自 local marker + CLI effective；`status`/`doctor`/`init` 等出口无 pending 假结论。
- AC-3：同日重初始化无 tag 冲突；回归 CASE 覆盖去 tag 与 effective 契约；不做旧 headRef/旧双字段兼容。

### 异常与边界

- 证明失败、平台不可达时返回稳定错误码，不静默放行、不假成功。
- tip 合入证明（任务 close）行为保持：无 tip 匹配不得清理。
- 存量仓库若仍带旧 `status`/`headRef` 字段：解析时忽略或剥离，不作为主路径；不提供迁移兼容开关。

### 验收条件

- AC-1: init 成功路径不创建、不推送任何 tiller-init git tag；证明与 close/start/doctor 不依赖 tag 或 headRef
- AC-2: tracked project.json 的 initBaseline 不含 status；当前结论只来自 local marker + CLI effective（如 initBaselineStatus）；status/doctor/init 等出口无 pending 假结论
- AC-3: 同日重初始化无 tag 冲突；回归 CASE 覆盖去 tag 与 effective 契约；不做旧 headRef/旧双字段兼容

## 设计

### 方案

1. **去掉 init tag（AC-1 / AC-3）**
   - 删除 `initHeadRef`、`git tag -f`、`pushTag` 及依赖它们的错误码/文案。
   - `initBaseline` 跟踪字段保留证明所需的 `id` / `branch` / `commit` / tip `head`（及平台需要的引用）；**不再写入 `headRef`、`status`**。
   - `proveInitBaselineMerged`：祖先 → local merged marker → 平台按 branch + tip/head 查已合入 PR/MR；**不** `rev-parse` tag。
   - 同日重 init：因无 tag，不再出现 `matches more than one`。

2. **pending/effective 单一真相（AC-2）**
   - tracked `project.json` 禁止 `initBaseline.status`；合入态只写 `.tiller/local/` marker。
   - `status` / `doctor` / `init` 等 JSON：当前结论只出 effective（沿用或收敛 `initBaselineStatus`）；若仍附带 metadata 快照，不得把其中缺失/旧字段呈现为当前结论。
   - 扫描同类出口（CLI 打印、doctor 项、init 返回的 baseline 对象）：凡「tracked 原始字段」与「当前结论」分叉处，统一只暴露 effective，去掉误导性 pending。

3. **CASE / specs 先行**
   - 先更新 initialization/workflow CASE 与 specs（去 tag、无 status 字段、effective 契约），再改实现与测试；全量测试 + package smoke。

### 失败处理

- tag 相关失败路径删除或改为不可达；证明失败保持稳定错误码，close/start 不假成功。
- 解析到旧 `status`/`headRef`：忽略，不报兼容成功、不恢复旧行为。

### 取舍

- 选「彻底去掉 tag + tracked 不写 status」而非「保留 tag 唯一 ID」或「只改 status 展示叠合」，因用户明确不要兼容旧机制、并要求整包收齐双真相。
- local marker 仍作跨命令缓存；跨 clone 证明继续依赖 tip/平台，不依赖 tag。

### 影响与风险

- 影响：`src/init-baseline.ts`、`project-metadata`/`types`、`core` status、`doctor`/`flow`、相关 specs/CASE/测试。
- 风险：依赖旧 tag 的外部脚本会失效——按产品决定不做兼容，文档/规格写明证明字段。
- 本包开真实 PR，**不合入**。

### 验证入口

- 单测：init 不产生 tag；prove/start/doctor/close 无 tag/`headRef`；project.json 无 status；status JSON effective=merged 且无 pending 假结论；同日重 init 无 tag 冲突文案。
- 全量 `npm test` + `test:package`；verify → check → accept → pr。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-28T10:40:20.799Z | 1910192f877f | — |
| 设计 | boon yu | 2026-10-28T10:40:20.950Z | 34e4228052ca | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"7a537fa15cc2032eb6bb870561ac29c4507b7557ecc5e7819e52797109c81024","commit":"1910192f877ffdeb3a8598b7b9b2481d135f9c49","by":"boon yu","quote":"","at":"2026-10-28T10:40:20.799Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"291cb8497fe597d5a8f6008fad0aca326401022fa81669d657aab3263f0bb510","commit":"34e4228052ca7bce2cddf9786c5cdabab9077adf","by":"boon yu","quote":"","at":"2026-10-28T10:40:20.950Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-329 init uses tip SHA and platform proof without tags or headRef$' \u002d\u002dtest-reporter=./.tiller/local/verify-DpoJaE/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-DpoJaE/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"f5bc2931021a86b415c42ddcb1b66396f2f3782faeea44bd09f9da6cc3307b0f","commit":"41c3a630a9891c93d663a4550ff7327b69cd2586"} -->
- 条件：AC-1
- 测试：test/init-baseline.test.mjs::CASE-329 init uses tip SHA and platform proof without tags or headRef
- 用例：CASE-329
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-anchor-pack/logs/run-1.log
- 提交：41c3a630a989
- 时间：2026-10-28T11:02:35.851Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-330 init and status expose effective state while stripping legacy tracked fields$' \u002d\u002dtest-reporter=./.tiller/local/verify-RtNcRu/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-RtNcRu/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"f5bc2931021a86b415c42ddcb1b66396f2f3782faeea44bd09f9da6cc3307b0f","commit":"41c3a630a9891c93d663a4550ff7327b69cd2586"} -->
- 条件：AC-2
- 测试：test/init-baseline.test.mjs::CASE-330 init and status expose effective state while stripping legacy tracked fields
- 用例：CASE-330
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-anchor-pack/logs/run-2.log
- 提交：41c3a630a989
- 时间：2026-10-28T11:02:37.130Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-331 same-day reinitialization leaves an existing tiller-init tag untouched$' \u002d\u002dtest-reporter=./.tiller/local/verify-e8jPZD/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-e8jPZD/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"f5bc2931021a86b415c42ddcb1b66396f2f3782faeea44bd09f9da6cc3307b0f","commit":"41c3a630a9891c93d663a4550ff7327b69cd2586"} -->
- 条件：AC-3
- 测试：test/init-baseline.test.mjs::CASE-331 same-day reinitialization leaves an existing tiller-init tag untouched
- 用例：CASE-331
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261028-init-anchor-pack/logs/run-3.log
- 提交：41c3a630a989
- 时间：2026-10-28T11:02:38.093Z

## 自检

交付前运行 check；验收后运行 accept。
