# 流程稳定性：基线自愈、合入删分支、用例去源码

<!-- tiller-task:v1 {"version":1,"id":"20261026-flow-stability","type":"feature","size":"standard","created":"2026-10-26T10:55:41.061Z","base":"adae0747a0eebdaa63fcfb5b59880ff642df1c4d","scope":["src","test","resources",".tiller","README.md","AGENTS.md","scripts"],"format":"structured","slug":"flow-stability","summary":"基线API放行与合入清分支用例去源码","requirementFile":".tiller/local/20261026-flow-stability-req.md"} -->

## 需求

### 面向谁与问题

维护 tiller 的人与执行 AI。网页/squash 合入初始化后，`start` 仍常因 `initBaseline.commit` 不是当前 HEAD 祖先而阻断；`merge`/`close` 后 feat 与 init 分支残留；用例强制「源码」/`--source` 与 cases-first（实现前登记）冲突；需求「业务范围·做」常被写成交付文件路径却无提示。需要在 tiller 流程与机制内收口。

### 目标

本波落地四项机制（确认原话软约束不做）：
1. init 基线：网页/squash 合入后，通过平台 API 探测 init PR/MR 已合入则自动放行 `start`（并更新 merged），不只靠 close/merge 标记或祖先判定。
2. 合入/close 后默认删除本地与远端 feat（及 init）分支；`--keep-branch` 可保留。
3. 用例彻底去除「源码」字段与 CLI `--source`（不是改成可选）；由测试关联 CASE；迁移模板与既有用例。
4. `check` 对「业务范围·做」中的交付路径给出 warning。

版本保持 0.5.0。

需求来源：`.tiller/local/20261026-flow-stability-req.md`

### 业务范围

- 做：
  - start/init 基线：pending 且祖先失败时 API 查 init 分支 PR/MR；已合入则 mark merged 并放行；缺 token/API 失败保持中文错误与 `--skip-init-gate`
  - merge/close（含 init-id）默认删本地+远端任务/init 分支；`--keep-branch` 保留；删失败只 warning
  - 从 cases 模型/CLI/模板/文档/既有用例中移除「源码」与 `--source`；关联仅测试↔CASE
  - check 对「做」中交付路径启发式 warning（不阻断）
  - 用例+测试+文档/decisions；全量门禁
- 不做：确认软约束；升版本；token 加密存储；CloudAgent；将「做」路径检查升级为硬失败
- 假设与待确认：平台 github/gitlab；既有 token 环境变量；删远端优先 platform-api

### 关键行为

1. 网页 squash 合入 init 后，即使旧 baseline commit 非祖先，有 token 且 API 确认 PR/MR merged 时 `start` 放行。
2. `tiller merge` / `tiller close` 成功路径默认删本地+远端对应分支；`--keep-branch` 保留。
3. `tiller case add` 无 `--source`；新用例无「源码」行；旧用例不要求源码字段。
4. `check` 对「做」中的交付路径给出可定位 warning。

### 异常与边界

- API 不可达/无 token：不静默放行；可 `--skip-init-gate`
- 分支已不存在：成功或 warning，不失败整次 merge/close
- 当前检出为待删分支：先切安全分支或跳过本地并 warning
- 历史「源码」行：迁移删除；解析不得再要求源码必填

### 验收条件

- AC-1: 网页/squash合入后API探测init PR/MR已合入则自动放行start并更新merged
- AC-2: merge/close默认删本地与远端feat/init分支，支持--keep-branch
- AC-3: 用例与CLI完全去除源码与--source，模板与既有cases迁移，测试用CASE关联
- AC-4: check对业务范围做中的交付路径warning；文档一致；0.5.0；全量门禁通过

## 设计

### 方案

1. **Init 基线 API 自愈放行（AC-1）**
   - 扩展 `assertInitBaselineReady`：在 `status!==merged` 且 `merge-base --is-ancestor` 失败时，不立刻失败；调用 platform-api 解析 remote + token，按基线 `branch`（`chore/tiller-init`）查询对应 GitHub PR / GitLab MR。
   - 若平台状态为已合入（GitHub `merged==true` / state=closed+merged_at；GitLab `state==merged`），则调用既有 `markInitBaselineMerged` 写回 `project.json`，然后放行 `start`。
   - 祖先判定成功时保持兼容（无需联网）。
   - 无 token、远程解析失败、API 错误或未找到已合入 PR/MR：维持 `INIT_BASELINE_PENDING`（或更具体错误码）与中文 next；`--skip-init-gate` 不变。
   - 新增可测的 `findMergedInitIntegration`（或等价）纯函数/注入 fetch，供单测 mock。

2. **合入/close 默认删分支（AC-2）**
   - `merge` 与 `close`（含 init-id）成功清理路径默认删除：本地分支 + 远端同名分支（任务 `feat/...`，init `chore/tiller-init`）。
   - CLI：`merge`/`close` 增加 `--keep-branch`；为 true 时跳过删除。
   - 删除实现：本地 `git branch -D`（若当前不在该分支；若在则先切 default/main/master 或跳过并 warning）；远端优先 platform-api 删 ref（GitHub DELETE `/git/refs/heads/...`，GitLab 等价），否则 tokenized `git push origin --delete`。
   - 分支已不存在 / 权限不足：记 `warnings`，不让整次 merge/close 失败，不回滚已合入或已清 local。

3. **用例去除源码字段（AC-3）——整段删除，不是可选**
   - 从 `CaseEvidence`/`case add` 输入、MD 模板渲染、parser、校验、CLI help/`--source` 选项、resources/usage、rules/verification、cases/index 文案中 **彻底移除**「源码」与 `--source`。
   - 迁移全部 `.tiller/cases/**`：删除 `- 源码：...` 行；解析遇到遗留「源码」行应忽略且不报必填错误（过渡），新写入不再生成该行。
   - `case add` 不再接受 `--source`（传入应报未知选项或明确拒绝）；关联只靠测试名/紧邻注释中的 `CASE-NNN`。
   - 更新所有依赖 `source:` 的测试夹具。

4. **业务范围「做」路径 warning（AC-4 便宜项）**
   - 在 `check` 读取任务需求「业务范围」中「做」列表；条目匹配交付路径启发式（如 `src/`、`test/`、`resources/`、`.tiller/` 前缀，或扩展名 `.ts/.mjs/.js/.md` 且含 `/`）时追加 warning，默认不阻断。

5. **文档与门禁**
   - usage、delivery/core、decisions、必要时 workflow/verification specs；同步受管镜像与 digest。
   - 版本保持 0.5.0；全量 `build/lint/typecheck/test/test:package`。

### 失败处理

- Init API 探测失败：不静默放行；可 `--skip-init-gate`。
- 删分支失败：warnings only。
- 用例迁移遗漏「源码」行：解析忽略；`case add` 不再写出。
- check 路径启发式误报：仅 warning，可后续收紧。

### 取舍

- **API 探测优先于仅 close 标记**：覆盖网页 squash（commit 重写导致祖先失败）。
- **删分支默认开、`--keep-branch` 退出**：减少残留；需保留时显式声明。
- **源码字段删除而非可选**：与 cases-first 一致，避免实现前登记仍填路径。
- **「做」路径仅 warning**：本波不硬失败，降低误伤。

### 影响与风险

- 影响：`src/init-baseline.ts`、`src/platform-api.ts`、`src/pr.ts`、`src/flow.ts`、`src/cases.ts`、`src/cli.ts`、相关 test、resources、`.tiller/cases` 全量迁移。
- 风险：存量用例迁移面大——用脚本/批量删行并跑库解析；删分支误删需限制为任务/init 已知分支名。
- 安全：不日志输出 token；删远端需已有 token 权限。

### 验证入口

- 定向：`node --test test/init-baseline.test.mjs test/merge.test.mjs test/cases*.mjs test/flow*.mjs`（按实际文件名）
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-26T10:56:33.664Z | adae0747a0ee | 按选项确认：API探测合入后放行；默认删分支与keep-branch；彻底去掉用例源码字段；check对做路径warning |
| 设计 | ChukiChen | 2026-10-26T10:56:33.762Z | adae0747a0ee | 同意设计：API自愈、默认删分支、去除源码字段、做路径仅warning |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"28e4c4c3f6227552d800e6cabb8ee19dda876932b1967533b5139b67049fced7","commit":"adae0747a0eebdaa63fcfb5b59880ff642df1c4d","by":"ChukiChen","quote":"按选项确认：API探测合入后放行；默认删分支与keep-branch；彻底去掉用例源码字段；check对做路径warning","at":"2026-10-26T10:56:33.664Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"6cb7cf48b6e0cb2263029a9af54e8e528fea6885ffef38595dfab6bad48fc6bd","commit":"adae0747a0eebdaa63fcfb5b59880ff642df1c4d","by":"ChukiChen","quote":"同意设计：API自愈、默认删分支、去除源码字段、做路径仅warning","at":"2026-10-26T10:56:33.762Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
