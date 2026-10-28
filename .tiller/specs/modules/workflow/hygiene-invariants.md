# 合入后不变式与入口收口

## 使用场景

post-#45 狗粮主路径已通，但仍有入口与卫生摩擦：`--requirement` 不扩写结构化需求导致冷启动 specs 手补；`case add` 依赖模块规格先存在时提示弱；commit 信息里 `specs` 被当成模块 id 误报。维护者要求**一轮收口**，并用测试锁住「合入后工作区不变式」，避免再零敲软摩擦。用户侧安装后 tiller 已在 PATH，日常与 dogfood/CASE **按单一 PATH CLI 测**。

## 业务范围

- 做：合入/close 后 primary 不变式（无未跟踪 tiller 任务树、无可选脏 project.json、可 ff）；`--requirement` 在开任务时生成/填充结构化需求骨架（可再编辑）；commit/check 的模块 scope 识别不再把全局 `specs`/`workflow` 等误报为缺失模块；相关 CASE/文档；测试与狗粮路径与「PATH 里那一个 tiller」一致。
- 不做：升版本；允许多行全文塞进 `--requirement` 替代 `--requirement-file`（短目标通道仍可存在，但短目标须能落地为可 confirm 骨架）；改 CASE 必须挂模块规格的产品规则（可改善提示与推荐顺序）；CloudAgent；本 PR 合入由人决定。
- 假设：用户开场描述足够时，Agent/CLI 应用骨架+描述填章节，而不是留下空模板；安装后 PATH 即可用。

## 关键行为

1. **合入后不变式**：merge/close 后 primary 不因 tiller 产生未跟踪 `.tiller/task/<id>/`；跟踪的 `project.json` 不因仅 status 字段变脏；默认分支可 `git pull --ff-only`（在无用户无关脏文件时）。
2. **短目标可落地**：`start --requirement "…"` 写入的任务需求含结构化章节骨架，并把短目标纳入目标/使用场景，达到可确认的最低完整度（或明确提示还缺哪节）；有 `--requirement-file` 时仍以文件为准。
3. **单一 tiller（PATH）**：产品与测试假设安装后 PATH 中的 tiller 即唯一入口；狗粮/CASE 用该 CLI。
4. **commit scope**：对全局/工作流类 scope（如 `specs`、`workflow`）不误报「模块不在 specs/modules」；真正缺失的模块 id 仍提示。

## 异常与边界

- 用户同时给了 `--requirement-file`：以文件为准，不覆盖为短目标骨架。
- 描述过短无法填满章节：生成骨架并列出待补节，不假装已可验收。
- 历史任务记录不受影响。

## 验收条件

- AC-1: merge/close 后的自动化测试断言 primary 无因 tiller materialize/种子产生的未跟踪任务树，且在干净工作区可快进；相关不变式有 CASE
- AC-2: 仅 `--requirement` 启动的任务，其 task.md 需求含结构化章节且短目标已写入，无需空白模板手搓才能进入 confirm 路径（或失败时明确缺节）
- AC-3: 主路径文档与 dogfood/CASE 按 PATH 单一 tiller 使用；若测试涉及 CLI，通过 PATH/`npx`/打包入口调用
- AC-4: check 对 `feat(specs):` / 工作流类 commit 不再误报模块缺失；真实缺失模块仍提示
- AC-5: 0.5.0；全量测试与 package smoke 通过

## 2026-10-28 整包收口不变式

### 初始化证明可重建

- 跟踪的 init 基线必须保留可解析到 squash 前 PR head 的引用；fresh clone 即使没有本机 merged 标记、init 分支已删除，也能用该 head 与平台已合入 PR/MR 证明基线。
- `close <init-id>` 在证明失败时必须返回稳定错误并保留 init worktree、本机目录和分支；不得先清理再报告成功。
- init 的第二个提交必须可区分或与基线收敛为单个提交；init PR/MR 标题包含 init id，避免重复初始化与历史同名记录混淆。

### 放弃事件先持久化

- `close --abandon` 接受已验收但未合入的任务；sequence 固定为：把放弃事件写入 primary 可读取任务记录 → 提交该记录 → 拆除 worktree、本机目录与分支。
- 持久化或提交失败返回 `ABANDON_NOT_PERSISTABLE`，全部任务事实保持；成功后 primary 最新提交包含放弃状态，reopen 可继续读取。

### PR 创建幂等

- `pr` 创建前后都以 head branch 与 head SHA 查询开放 PR/MR；命中即复用编号、URL 与 base，不再次创建。
- 创建请求已可能落库但响应丢失时，重试必须先查重，再决定返回已有记录或稳定失败。

### 导入与提示保真

- `--requirement-file` 保留 `## 关键行为` 下的嵌套标题与正文，任务记录层级不丢失。
- 全局 specs 任务的 PR 标题优先使用 `specs` scope，不因正文路径引用误推模块。
- check 对同一模块的覆盖缺失与回归建议合并去重，非阻断提示不重复刷屏。
