# 去掉旧 launcher 与 runtime bind 兼容

<!-- tiller-task:v1 {"version":1,"id":"20261027-drop-compat","type":"feature","size":"standard","created":"2026-10-27T15:54:33.337Z","base":"92c93b93e9def866bf3d2598934a898ba4ca9f01","scope":["resources","src/runtime.ts","src/cli.ts","src/project-metadata.ts","src/flow.ts","src/core.ts","scripts/package-smoke.mjs","test","AGENTS.md"],"format":"structured"} -->

## 需求

### 使用场景

- 新工程 `tiller init` 后，用户与 AI 只使用 PATH 中的全局/本地 `tiller` CLI。
- 维护者决定不再保留旧 launcher、runtime bind、旧三棵树/closed 标记等跨版本兼容路径。

### 目标

不考虑兼容：删除 `run.cjs` / 旧 launcher、`tiller runtime status|bind` 与 `runtime.json`；收掉 close 对旧三棵树与 `.tiller/local/closed/` 的兼容清理枝，以及不再需要的 legacy 确认/证据解析；受管清单、package-smoke、文档同步；版本保持 0.5.0。

### 业务范围

- 做：从受管资源与包中移除 `run.cjs`；移除或拒绝用户主路径上的 runtime bind/status；清理 flow/close 旧布局兼容代码与相关测试/文档；upgrade/init 不再登记或写出 launcher。
- 不做：改变 worktree 任务真相、tokenized-git、合入证明 tip 绑定、doctor 语义；不顺带修 abandon / doctor ready 软摩擦；不做跨版本迁移工具。
- 假设：已安装工程若仍留有旧 `.tiller/run.cjs` / `runtime.json`，可忽略或由用户手工删除；新产品路径不再依赖它们。

### 关键行为

- AC-1：新 init 不再安装 `.tiller/run.cjs`；包与受管清单不含 `run.cjs`；不存在可用的 runtime bind/status 用户主路径。
- AC-2：close/merge 收尾不再依赖旧三棵树或 `.tiller/local/closed/` 兼容路径；相关文档与测试更新；全量测+package smoke 通过；0.5.0。

### 异常与边界

- 若 CLI 仍收到 `runtime` 子命令：明确报错提示改用 PATH `tiller`，不要静默写 bind。
- 删除受管文件后，upgrade/doctor 不得因缺少旧 launcher 失败。

### 验收条件

- AC-1: 新 init 不再安装 .tiller/run.cjs；包与受管清单不含 run.cjs；不存在可用的 runtime bind/status 用户主路径。
- AC-2: close/merge 收尾不再依赖旧三棵树或 .tiller/local/closed/ 兼容路径；相关文档与测试更新；全量测+package smoke 通过；0.5.0。

## 设计

### 方案

1. 从 `SHARED_RESOURCES` / managedFiles / package 资源中移除 `run.cjs`；删除或停用 `resources/run.cjs`。
2. CLI：`runtime status|bind` 改为拒绝（明确错误）或整命令移除；删掉 `bindRuntime` 主路径与对 launcher digest 的强制校验。
3. flow/close：去掉旧三棵树布局与 `.tiller/local/closed/` 兼容清理；保留当前 worktree-first close。
4. 可选收紧：不再写入/解析无用的 `style: legacy` / `legacyEvidence`（若测试与旧 fixture 依赖则先删测试再删解析）。
5. 更新 usage、AGENTS、package-smoke、CASE/测试；版本保持 0.5.0。

### 失败处理

- 缺旧 launcher 不再视为工程损坏。
- runtime 子命令调用返回明确错误码/文案。

### 取舍

- 一次砍兼容入口，不做双轨迁移期；与「PATH 单一 tiller」产品决策一致。
- 不在本任务改 abandon / ready 语义，避免混包。

### 影响与风险

- 影响：`resources/`、`src/runtime.ts`、`src/cli.ts`、`src/project-metadata.ts`、`src/flow.ts`、`src/core.ts`、smoke/测试/文档。
- 风险：旧 CASE 覆盖 launcher/bind 需改写或删除；已初始化仓库残留 `run.cjs` 无害但不被管理。

### 验证入口

- init 后断言无 `.tiller/run.cjs`、无 runtime.json；`tiller runtime …` 失败。
- `npm test` + `npm run test:package`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T15:54:44.443Z | 92c93b93e9de | — |
| 设计 | boon yu | 2026-10-27T15:54:44.579Z | f408a7caae0a | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"7f2a753978a65fec32a7d4977da4952be74e45148f61cdaafc95e1366234c4fe","commit":"92c93b93e9def866bf3d2598934a898ba4ca9f01","by":"boon yu","quote":"","at":"2026-10-27T15:54:44.443Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"24108382fb5c9b404219258474d62785ab0681415e1777e41736e890349b8add","commit":"f408a7caae0a3811fad7b09c602956ed7bbbc365","by":"boon yu","quote":"","at":"2026-10-27T15:54:44.579Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
