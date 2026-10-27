# 合入证明绑定 PR head.sha

<!-- tiller-task:v1 {"version":1,"id":"20261027-merge-proof-sha","type":"feature","size":"standard","created":"2026-10-27T15:20:31.820Z","base":"80f42f948821f2a6a58caf7befe6431398c5a5cc","scope":["src/platform-api.ts","src/flow.ts","src/init-baseline.ts","test"],"format":"structured"} -->

## 需求

### 使用场景

- 仓库 wipe/重建后仍复用历史任务编号与分支名（如 `feat/20261027-library-specs`）时，用户对「已验收但尚未为本 tip 创建/合入 PR」的任务执行 `close`。
- `close` / init-baseline 闸门需要平台合入证明；平台上同 head 分支可能已有多次历史 merged PR。

### 目标

合入证明必须把「当前任务分支 tip」与「平台已合入 PR/MR 的 head tip」绑在一起；禁止仅凭历史同名 head 分支判定已合入，避免误清未合入任务。

### 业务范围

- 做：收紧 `findMergedIntegration`（及 close / init-baseline 调用方）的合入证明匹配规则；补 CASE/测试覆盖分支名复用场景；版本保持 0.5.0。
- 不做：改写 tokenized-git / PR 创建路径；不引入 `.tiller/local/closed/` 或 materialize；不扩大 doctor 语义；不顺带清软摩擦清单其余项。
- 假设：GitHub pull 的 `head.sha`（或等价 tip）与本地/任务分支 tip 可比对；GitLab MR 用等价 source tip / merge 回执字段。

### 关键行为

- AC-1：仅当 merged PR/MR 的 head tip 与当前任务分支 tip 匹配时，才视为合入证明；历史同名分支的旧 merged PR 不得放行。
- AC-2：无匹配 tip 时 `close` 返回 `CLOSE_MERGE_PROOF_MISSING` 且不破坏性清理；CASE+测试锁住；0.5.0。

### 异常与边界

- API 无 tip / tip 不可比时视为证明不足，不得放行清理。
- squash merge 后若平台仍暴露合入前 head tip，优先用该 tip 与任务 tip 比对；不得退回「任意同分支 merged」。
- 输入无效、token/API 不可用时返回明确错误，不静默把历史同名 PR 当证明。

### 验收条件

- AC-1: findMergedIntegration（及 close/init-baseline 调用方）仅当 merged PR/MR 的 head.sha（或等价 tip）与当前任务分支 tip 匹配时才视为合入证明；历史同名分支的旧 merged PR 不得放行。
- AC-2: 无匹配 tip 时 close 返回 CLOSE_MERGE_PROOF_MISSING 且不破坏性清理；CASE+测试锁住复用分支名场景；版本保持 0.5.0。

## 设计

### 方案

1. 扩展 `findMergedIntegration`：在按 head/source branch 列出候选 merged PR/MR 后，读取每条的 `head.sha`（GitHub）或等价 tip（GitLab），与调用方传入的**当前任务分支 tip** 比对；只返回 tip 匹配的那一条。
2. close / init-baseline 传入当前 tip（任务 worktree 或分支 tip），不得只传分支名。
3. 无匹配 → 证明不足；close 保持 `CLOSE_MERGE_PROOF_MISSING`，不删 worktree/分支/任务事实。
4. 测试：模拟「同分支多名历史 merged PR + 当前 tip 未出现在任一 head.sha」→ 证明不足；「当前 tip 命中最新 merged head.sha」→ 证明成立。

### 失败处理

- tip 缺失或 API 字段不全：按证明不足处理。
- 不回退到「同分支任一 merged 即通过」。

### 取舍

- 选 tip 绑定而非仅 merge commit 祖先检查：直接对应报告根因，改动面小，覆盖 wipe 后复用分支名。
- 不在本任务做完整跨平面状态机；只修合入证明匹配。

### 影响与风险

- 影响：`src/platform-api.ts`、`src/flow.ts`、`src/init-baseline.ts`、相关测试。
- 风险：旧测试若依赖「同分支任意 merged」需同步改写；真实 tip 与 API head.sha 不一致时会更严（符合预期）。

### 验证入口

- 单测覆盖 tip 匹配 / 历史同名误判拒绝。
- `npm test` + `npm run test:package`；版本 0.5.0。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-27T15:20:44.991Z | 80f42f948821 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"17542a84ad47e114bb1e9cd1cddff377b80dcd0b2c8aa2b24cd87a6718165a50","commit":"80f42f948821f2a6a58caf7befe6431398c5a5cc","by":"boon yu","quote":"","at":"2026-10-27T15:20:44.991Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
