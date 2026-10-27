# 合入后不变式与入口收口

## 使用场景

post-#45 狗粮主路径已通，但仍有入口与卫生摩擦：`--requirement` 不扩写结构化需求导致冷启动 specs 手补；`case add` 依赖模块规格先存在时提示弱；commit 信息里 `specs` 被当成模块 id 误报。维护者要求**一轮收口**，并用测试锁住「合入后工作区不变式」，避免再零敲软摩擦。用户侧安装后 tiller 已在 PATH，日常与 dogfood/CASE **按单一 PATH CLI 测**，不依赖也不验收 `runtime bind`。

## 业务范围

- 做：合入/close 后 primary 不变式（无未跟踪 tiller 任务树、无可选脏 project.json、可 ff）；`--requirement` 在开任务时生成/填充结构化需求骨架（可再编辑）；commit/check 的模块 scope 识别不再把全局 `specs`/`workflow` 等误报为缺失模块；相关 CASE/文档；测试与狗粮路径与「PATH 里那一个 tiller」一致。
- 不做：升版本；自动/手动 runtime bind 作为主路径或验收项；允许多行全文塞进 `--requirement` 替代 `--requirement-file`（短目标通道仍可存在，但短目标须能落地为可 confirm 骨架）；改 CASE 必须挂模块规格的产品规则（可改善提示与推荐顺序）；CloudAgent；本 PR 合入由人决定。
- 假设：用户开场描述足够时，Agent/CLI 应用骨架+描述填章节，而不是留下空模板；安装后 PATH 即可用，不存在用户侧 bind。

## 关键行为

1. **合入后不变式**：merge/close 后 primary 不因 tiller 产生未跟踪 `.tiller/task/<id>/`；跟踪的 `project.json` 不因仅 status 字段变脏；默认分支可 `git pull --ff-only`（在无用户无关脏文件时）。
2. **短目标可落地**：`start --requirement "…"` 写入的任务需求含结构化章节骨架，并把短目标纳入目标/使用场景，达到可确认的最低完整度（或明确提示还缺哪节）；有 `--requirement-file` 时仍以文件为准。
3. **单一 tiller（PATH）**：产品与测试假设安装后 PATH 中的 tiller 即唯一入口；不要求、不引导、不验收 init 后 `runtime bind`；狗粮/CASE 用该 CLI，不测 bind 钩子。
4. **commit scope**：对全局/工作流类 scope（如 `specs`、`workflow`）不误报「模块不在 specs/modules」；真正缺失的模块 id 仍提示。

## 异常与边界

- 用户同时给了 `--requirement-file`：以文件为准，不覆盖为短目标骨架。
- 描述过短无法填满章节：生成骨架并列出待补节，不假装已可验收。
- 开发者可选的 `runtime bind` 若仍存在于代码，不得成为文档主路径或 soft45 类「手补一步」。
- 历史任务记录不受影响。

## 验收条件

- AC-1: merge/close 后的自动化测试断言 primary 无因 tiller materialize/种子产生的未跟踪任务树，且在干净工作区可快进；相关不变式有 CASE
- AC-2: 仅 `--requirement` 启动的任务，其 task.md 需求含结构化章节且短目标已写入，无需空白模板手搓才能进入 confirm 路径（或失败时明确缺节）
- AC-3: 主路径文档与 dogfood/CASE 按 PATH 单一 tiller 使用；不把 runtime bind（自动或手动）列为 init/合入后必做或验收；若测试涉及 CLI，通过 PATH/`npx`/打包入口调用，不依赖 bind 状态
- AC-4: check 对 `feat(specs):` / 工作流类 commit 不再误报模块缺失；真实缺失模块仍提示
- AC-5: 0.5.0；全量测试与 package smoke 通过
