# 狗粮卫生六项

## 使用场景

合入流程稳定执行后，在 tiller-test-single 上 wipe+全流程狗粮时仍有六处软摩擦：start 后 worktree 缺 task.md、init squash 后 doctor 红到下一次 start、init 在 main 留未跟踪受管文件、pr 成功默认打 markdown 不便脚本、tiller 仓 close 对已删远端仍刷 422 警告、脚手架漏 gitkeep 多一次 main 提交。维护者与执行 AI 需要这些路径在无人工补丁时也能干净走通。

## 目标

一次性收齐六项卫生，使 post-#39 狗粮路径无需手工拷贝、hard reset、二次 main 提交或忍受误导警告；版本保持 0.5.0。

## 业务范围

- 做：start 后任务记录对 worktree 可用；doctor/close/init 对已合入基线与已删远端安静正确；init 不在默认分支 cwd 留脏的未跟踪受管残留（或安全自动清理）；pr 对人友好且对机器可解析；init/骨架为需保留的空目录带上必要 gitkeep；CASE+测试+文档一句；decisions 按需补记。
- 不做：升版本；CloudAgent；改 CASE↔AC 关联模型；合入本 PR（由人审阅）；扩大到与六项无关的重构。
- 假设：token 仍为 GITHUB_TOKEN/GH_TOKEN 或 GITLAB_TOKEN/GL_TOKEN；网页 squash 后分支常已被平台删除。

## 关键行为

1. start：创建任务 worktree 后，任务记录（至少 `.tiller/task/<id>/task.md` 及开工所需旁路）在 worktree 内立即可用，无需从 primary 手工拷贝。
2. doctor：初始化基线在平台已 squash/合入后应判定通过（祖先、status=merged、或与 start 同等的 API 合入证明）；不必等到下一次 start 才变绿。close init-id 在能证明已合入时应写回 merged（若尚未写）。
3. init：受管文件写入与提交以初始化 worktree/基线分支为准；默认分支 cwd 不留下需 hard reset 才能 pull 的未跟踪受管残留（保留 project.json 基线元信息所需的最小例外须文档化且可测）。
4. pr：成功创建真实 PR/MR 后，在保持人类可读的同时提供机器友好输出（`--json` 稳定字段必含 url/number/branch/title 等；非 TTY 默认可走 JSON 或等价稳定结构）；`--draft-only` 行为保持不联网。
5. close/merge 删远端：分支已不存在或平台返回 404/422/“does not exist” 等视为已清理，不进 warnings；与文档「安静处理」一致。
6. init/骨架：SHARED_RESOURCES 与初始化提交所含空目录保留所需 `.gitkeep`；对狗粮常见的空 `src/`、`test/`（若工程已存在这些空目录或骨架会创建它们），在同一次初始化变更中带上 `.gitkeep`，避免 wipe+fullflow 再追加一次仅含 gitkeep 的 main 提交。

## 验收条件

- AC-1: start 完成后任务 worktree 内存在可读的 `.tiller/task/<id>/task.md`（及开工旁路若有），无需从 primary 手工拷贝即可在 worktree 继续 case/confirm
- AC-2: 初始化基线经 squash/合入后，doctor 的 init-baseline 检查通过（不依赖下一次 start）；能证明合入时 close init-id 写回 status=merged
- AC-3: 首次 init 成功后，默认分支工作区对受管文件无未跟踪残留（或仅有文档化的最小例外），无需 hard reset 即可与远端同步
- AC-4: tiller pr 成功时机器可解析稳定字段（`--json` 与/或非 TTY 默认）；人类 TTY 仍可读；`--draft-only` 不联网且输出可用
- AC-5: 删除已不存在的远端任务分支（404/422/不存在语义）时 close/merge 不产生 warnings，并视为已清理
- AC-6: init/骨架在同一变更集中包含必要 `.gitkeep`（含 cases 空目录与存在的空 src/test），狗粮无需额外仅 gitkeep 的 main 提交
