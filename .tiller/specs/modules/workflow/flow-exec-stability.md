# 流程稳定执行

## 使用场景

维护 tiller 的人与执行 AI 按官方路径交付功能时，需要一条稳定、可拦截、可自检的主路径：创建真实 PR、合入清理幂等、过程卫生可检查，避免「草稿再手搓 API」、默认分支直改 specs、双套 AC 编号或合入后再改共享任务记录。

## 目标

1. 单一交付通道：`tiller pr` 经平台 HTTP API 推送任务分支并创建真实 PR/MR（非仅草稿）；与既有 `merge` squash、`push` API 路径统一；缺 token 时给出清晰中文提示。
2. 可执行阶段机与硬门禁：保持并强化过程卫生（specs 经任务 worktree、requirement-file 仅 specs、AC-n 由文件导入）；文档/usage/AGENTS/CLI 只描述主路径，不示范草稿手搓或默认分支直推 specs。
3. 单一数据模型：任务 AC ≡ specs 路径作用域 `AC-n`；CASE 挂需求文件、关联 AC 为「无」；覆盖只认 verify 图；新写入禁止 `LIB-` 前缀、「对照」平行列表与「验收条件（稳定）」作主标题（历史别名可解析）。
4. worktree/close 幂等：在任务 worktree 根执行 merge/close 时也能干净删除本地/远端分支；远端已删或 422 视为成功或安静 warning；重复 close 安全。
5. 验收与记录闭环：accept 必须在 pr 前；合入后不再改写共享 `.tiller/task/<id>/task.md`；PR 五段正文与 verify 摘要由 tiller 生成。
6. 自检入口：提供 `doctor`（或等价）过程卫生扫描（基线、默认分支 specs 脏改、AC 覆盖缺口提示、残留任务分支等），全流程演示可将其视为绿条。

版本保持 0.5.0。

## 业务范围

- 做：增强 `pr`/`platform-api` 交付通道；`branch-cleanup`/`close`/`merge` 幂等；`doctor` 自检；文档与受管镜像只留主路径；CASE 与测试；必要时 decisions 补记；整合既有 case-req-link / ac-criteria-link / specs-worktree-gate 正确行为，不回退。
- 不做：升版本；CloudAgent；依赖平台 CLI；改 CASE↔AC 关联模型为用例内写 AC 号；强制重写全部历史 task.md。
- 假设：token 仍为 `GITHUB_TOKEN`/`GH_TOKEN` 或 `GITLAB_TOKEN`/`GL_TOKEN`；本地 git 二进制负责 worktree/commit；网页合入后仍可手动 close。

## 关键行为

1. `tiller pr <id>` 在已验收且任务记录已提交时：生成五段说明 → 推送任务分支（若需要）→ API 创建 PR/MR → 返回 URL 与编号；可选 `--draft-only` 仅输出草稿不联网。从任务 worktree 根调用时，任务记录优先从当前相关检出读取；主仓工作树缺少 `.tiller/task/<id>/` 不构成 `TASK_NOT_FOUND`。
2. `tiller merge` / `tiller close` 在 cwd 为任务 worktree 根时：先从当前相关检出读取任务记录，再拆 worktree 并从主仓删除本地分支；远端分支已不存在不失败。主仓仍承担平台操作、worktree 与分支清理。
3. `tiller doctor [path]`（名称以实现为准）输出过程卫生结论；严重项非零退出，可供演示绿条。
4. 文档不再把「只出草稿再手搓 API」写为主路径。

## 异常与边界

- 缺 token / API 失败：pr 失败并提示配置 token；不静默降级为成功。
- 分支已推送且 PR 已存在：幂等返回已有 PR 或给出明确中文提示（实现选一种并测稳）。
- 重复 close：本机目录已不存在时成功或明确已清理。
- 任务记录在主仓与当前相关检出均不存在：交付命令仍以 `TASK_NOT_FOUND` 失败，不因检出解析改变错误码。
- 历史「验收条件（稳定）」标题仅作解析别名；新模板与示例只用「验收条件」。

## 验收条件

- AC-1: tiller pr 在具备 token 时经平台 API 推送任务分支并创建真实 PR/MR，返回 URL；缺 token 有中文提示；--draft-only（或等价）可仅生成草稿；从任务 worktree 调用且任务记录仅存在于该检出时可正常生成草稿，主仓缺目录不报 TASK_NOT_FOUND；文档主路径不再要求手搓 API
- AC-2: 过程卫生与数据模型保持并强化：specs 经任务合入门禁、requirement-file/AC-n 导入、无 LIB-/对照/「验收条件（稳定）」新主路径写法；usage/rules/AGENTS/CLI 只描述主路径
- AC-3: 在任务 worktree 根执行 merge/close 可从仅存在于该检出的任务记录读取并干净删除本地与远端任务分支；远端已删安静处理；重复 close 安全；合入后 close 不改写共享 task.md；任务在所有相关检出均不存在时仍报 TASK_NOT_FOUND
- AC-4: doctor（或等价自检）可扫描过程卫生（含基线状态、默认分支 specs 脏改、残留任务分支等可测项）并以退出码表达是否通过
- AC-5: 全量 build/lint/typecheck/test 与 package smoke 通过，版本 0.5.0
