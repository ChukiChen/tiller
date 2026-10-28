# 交付

规则标识：ACT-DELIVERY。准备验收、合入、发布或交接时使用，并读取[验证依据](../quality/verification.md)。

交付前同时核对[代码质量](../quality/code.md)与[安全约定](../quality/documents.md#安全)条目；这些约定不替代逐条 AC 检查。

## 交付自检

1. 逐条核对验收条件，确认每项都有 verify 记录中的 AC→测试→CASE、覆盖它的当前通过测试，以及核实且未过期的验证；用例通过“需求”字段挂稳定 specs，不要求内嵌当前任务 AC。已验收任务按 acceptance 记录的提交复查当时的树与测试，未验收任务核对工作区/HEAD。
2. 查看 diff，确认没有范围外改动、未提交改动或无关删除。
3. 确认测试未被删除、跳过或弱化，失败、跳过和未执行分别报告。
4. 检查确认和验证仍指向当前内容与提交，记录不含密钥或本机绝对路径。
5. 说明未验证项、环境限制和剩余风险；技术检查通过不等于用户验收。

`verify` 必须由 tiller 实际执行声明的测试并从私有报告核实；未执行的外部报告须用 `--reported ... --reason` 记录理由，并由 `--allow-reported` 显式放行后才可通过 `check`/`accept`。PR/MR 草稿会把这些记录标为“未执行（外部报告）”。bugfix 还要保留基线失败先行和当前通过两侧证据。

默认使用 `check` 执行自检，再执行 `accept`（写入确认后自动提交本任务记录，含验收事实）。accept 必须在 pr 前完成，之后才创建真实 PR/MR；`--draft-only` 只作离线预览。`--by` 记录验收人，原话可选。合入即交付完成；技术就绪、用户验收、合入和发布分别报告，合入与发布仍需各自授权和当前提交绑定。

## 独立评审

- 验收前按目标与范围、需求与设计、AC/用例/验证、diff 与测试完整性、specs 回写、发布准备逐项评审。
- `review <task-id>` 将评审人和检查清单写入 `task.md` 的“评审”段；`--finding` 记录一般发现，`--blocking` 记录阻塞发现。
- 阻塞发现修复后由 `review --resolve REV-NNN` 标记解决。仍有未解决阻塞项时 `check` 与 `accept` 失败。

## 发布清单

`release <task-id>` 是只读发布门禁，逐项输出 pass/fail/na，任一项 fail 时非零退出。`check` 同时返回同一清单，但不把发布未就绪混入日常技术自检的阻塞项。

- 任务已通过交付验收，验收确认中的提交可读取。
- `project.json` 与受管结构有效，受管资源无待解决冲突。
- README 非空；npm 项目还需有效的包名/版本，且 README 包含当前版本。非 npm 项目跳过包项。
- 任务范围内没有未提交改动。发布前仍需单独取得授权，并绑定当前提交和目标。

已验收任务可用 `merge <id>` 调用 GitHub/GitLab REST API 以 squash 合入，成功后自动用 `close --reason` 清理本机，失败不清理；网页合入后仍需手动 `close`。Token 从 `GITHUB_TOKEN`/`GH_TOKEN` 或 `GITLAB_TOKEN`/`GL_TOKEN` 读取，永不记录或打印。`merge` 与 `close` 默认删除任务的本地与远端分支；`close <init-id>` 同样处理 `chore/tiller-init`。`--keep-branch` 可显式保留分支；分支已不存在或删除接口返回 404/422 视为已清理，无 token 或其它删除失败只记 warning，不回滚已合入结果或阻断本机收尾。在任务 worktree 根执行时，先解析主工程根并拆除该任务 worktree，再由主仓删除本地分支；重复 close 安全。收尾强拆该任务 worktree 并删除整棵 `.tiller/local/<id>/`（含日志与旁路），只识别当前任务本机布局，不触碰其他任务目录。`close` 不写共享 `task.md`，合入后不因收尾产生脏记录。初始化基线由 `start`、`doctor` 与 `close <init-id>` 先判祖先，再通过平台 API 查询同分支已合入 PR/MR；确认后写回 merged，无 token、API 失败或无记录仍返回 `INIT_BASELINE_PENDING`。确认不再推进的未验收任务用 `close --reason ... --abandon`，仍写共享放弃原因和时间；终止任务先 `reopen --reason` 才能继续，已验收任务再次交付也可 `reopen`。

## 提交、分支与 PR/MR

- 提交主题为 `类型(模块): 中文摘要`；类型限 `feat`、`fix`、`docs`、`refactor`、`test`、`chore`，模块取 specs 模块名，可省略括号部分。摘要用中文，不带任务链接。
- PR/MR 标题沿用提交格式并在末尾加 `[任务编号]`；主模块按范围声明顺序取首个，无法推导时省略括号。说明固定五段：关联任务、变更内容、验收条件、验证结果、影响与风险。
- 分支名为 `类型/任务编号`，可加 `-简短描述`；只用小写字母、数字、连字符和一个斜杠，不使用 `codex/` 前缀。
- `pr <task-id>` 先要求有效交付验收，再从 `task.md` 与 Git 生成标题、五段说明和建议分支，列出每条 AC 的全部验证；关联任务用纯文本路径。标题摘要依次取 `pr --summary`、任务元数据、任务基线后最早的规范 feat/fix 提交摘要和任务标题；变更内容按提交时间正序。分支描述取 `--slug`、任务元数据或当前分支。默认用 tokenized HTTPS git push 推送分支并经平台 API 创建真实 PR/MR；GitHub Git Data API 只在 git 推送失败时可选回退；`--json` 与非 TTY 默认输出稳定 JSON（`url`/`number`/`branch`/`title`/`draftOnly`/`platform`），TTY 保持 markdown；缺 token 中文失败，`--draft-only` 才仅输出草稿、不联网。
- `verify`/`check` 或 cases/specs 回写后，先提交验证记录，再 `accept`（`confirm`/`accept` 写入确认后自动提交本任务记录）；最后运行 `pr`。重复 `accept` 按当前工作区重新核实，改代码后先重新 verify。无有效验收默认以 `PR_NOT_ACCEPTED` 失败并提示先 `accept`；任务记录未提交以 `PR_TASK_RECORDS_DIRTY` 阻断并列出路径。只检查本任务 id 与 scope，其他任务 `.tiller/task/<other>/` 不阻断；除 `confirm`/`accept` 外 tiller 不自动 `git commit`；当前任务检出与 primary 残留分别提示，不自动删除文件。无 Git 或无法读工作树时仅跳过记录门禁并提示，验收门禁仍生效。
- 合入即交付完成；合入后 `close` 只清 local，不再 `accept`，也不改写共享 `task.md` 或另作收尾提交。未验收终止的 `abandon` 仍写共享记录。
- `init --platform github|gitlab|both` 按平台安装对应模板，默认 GitHub；受管文件只写入 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees` 的 `chore/tiller-init` 并提交，推送分支并创建同标题 PR/MR，失败保留本地与 token/API 下一步，但不自动合入；primary 不预建受管种子。缺失或为空的 `src/`/`test/` 同次在 worktree 补 `.gitkeep`。合入证明后的 merged 记在 `.tiller/local/`，不改跟踪 `project.json` 为仅工作区脏。GitHub 与 GitLab 都优先 tokenized HTTPS `git push`，GitHub 仅在该推送失败时回退 Git Data API；PR/MR 创建走 REST API，均不调用平台 CLI。人工合入后方可 `start`；未合入默认以 `INIT_BASELINE_PENDING` 阻断，例外使用 `--skip-init-gate`。也可用 `merge <init-id>` 合入初始化 PR/MR，成功后标记 merged 并清理该 local；网页合入则手动 `close <init-id>`。`specs` 只在任务 worktree 修改并随任务分支合入。平台在初始化时选定，之后不能通过 CLI 切换，需手动修改 `project.json` 并补齐模板。`upgrade` 只补齐当前平台模板，不跨平台新增。
- `specs` 变更先 `start`，在任务 worktree 修改，再随任务 PR/MR 合入；禁止在 `main`/`master` 默认分支直改或直推。默认分支上相对任务基线触及 `.tiller/specs/` 时，`check` 按过程卫生阻断；任务分支与已验收历史快照不触发。
- `check` 对任务基线后的非合并提交主题和当前分支名给出提示，不阻塞；main/master 与 detached HEAD 跳过分支检查。
- `doctor [path]` 是独立过程卫生自检：检查初始化基线状态、默认分支上的 specs 脏改/未合入改动、未挂载 worktree 的残留任务分支，以及进行中任务的 AC 覆盖缺口；init 基线复用祖先/merged/API 合入证明。前两类严重项与残留分支使命令以非零退出；warning 不阻断。
