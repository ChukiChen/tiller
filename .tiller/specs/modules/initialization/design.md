# 工程初始化设计

## 1. 文件骨架

初始化使用固定最小清单，只创建缺失文件。清单包括 `.tiller/specs/requirements.md`、`.tiller/specs/design.md`、`.tiller/specs/decisions.md`、`.tiller/specs/modules/README.md`、`.tiller/context/project.md`、`.tiller/cases/index.md`、`.tiller/cases/modules/`、`.tiller/cases/scenarios/`、`.tiller/plans/`、入口规则、使用指引和当前平台合并请求模板。骨架内容说明职责与下一步，不预生成空阶段、项目模块或审计目录。项目需求骨架包含使用场景、目标、业务范围、关键行为、异常与边界、验收条件；项目设计骨架包含方案、失败处理、取舍、影响与风险、验证入口；模块说明列出同一组章节。`plans/README.md` 说明按需规划与依赖阻塞；合并请求模板保持固定五段。

## 2. 受管区段

`AGENTS.md`、`.gitignore`、`.tiller/index.md` 使用成对标记维护固定区段。区段外内容原样保留；标记缺失、重复或顺序异常时报告冲突。共享规则、使用指引和平台模板按文件整体管理。规范化摘要允许受控路径的 LF/CRLF 等价，但不忽略实质字节变化。

## 3. 元信息

`init [path]` 支持当前工程与独立管理工程，仓库范围必须显式且可验证。`project.json` 的 `schemaVersion` 固定为 1；`resourceVersion` 只能是受支持契约；可选 `platform` 为 github、gitlab 或 both，缺省视为 github。`--platform github|gitlab|both` 在初始化时选定平台，CLI 不提供切换命令；手动切换需同步修改 `platform` 并补齐对应模板。GitHub 写 `.github/pull_request_template.md`，GitLab 写 `.gitlab/merge_request_templates/Default.md`，both 同时写两者。可选 `verify.runner` 接受 `node-test`、`junit-maven` 和 `junit-gradle`，缺省 `node-test`；`verify.prepare` 必须是非空字符串参数数组。`repositories` 写成对象数组，每项含 `id`、`path` 和可选 `verify`（只含 `runner` 与 `prepare`，按字段覆盖根配置）。仍可读取旧的 `repositories: string[]` 加 `repositoryPaths`；对象清单不能再带这份旁路映射。新初始化和升级写回都使用对象数组，并去掉 `repositoryPaths`。`mode: workspace` 至少一条仓库，`mode: project` 必须为空。读取时拒绝未知字段或值。升级以规范化后的元信息写回，保留根级和仓库级 `verify`。`managedFiles` 必须恰好覆盖当前平台完整受管集或可补齐的兼容子集。校验在取得锁和写入前完成，失败不留下部分文件。

## 4. 升级算法

1. `upgrade --plan` 只读预览，`upgrade --apply <plan-id>` 应用；读取元信息，拒绝未知版本、未完成事务和缺失受管集合。
2. 对每个受管文件读取当前字节，校验区段和摘要。
3. 生成期望内容；若内容只有 EOL 差异则保留当前字节。
4. 未修改文件进入变更集，修改/缺失文件进入冲突集。
5. 生成绑定输入和期望结果的 `planId`。
6. 应用时取锁并重新预览；计划一致才通过事务写入。
7. 复验受管摘要与资源版本，更新 `project.json`；事务失败保留恢复依据，由 `recover` 恢复。

## 5. 兼容边界

支持当前契约 `0.5.0` 和直接兼容的 `0.4.0`。旧文件集仍须满足当前受管清单；不做旧目录迁移或历史批准继承。版本号只在正式发布时变化，本设计不把功能迭代绑定成资源升版。

## 6. 初始化集成基线

`src/init-baseline.ts` 在受管文件落盘后运行。工程根须同时是 Git 工作副本根且有 HEAD；否则不阻断现有初始化，只返回跳过提示。初始化从当时 HEAD 新建 `chore/tiller-init`，复用受管变更集写入 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees`；tracked `initBaseline` 只记录 `id`、`branch`、`commit`，本机基线快照与 init 结果保留最终 tip `head`。初始化不使用任何 Git tag、`headRef` 或 tracked `status` 字段。

由于元信息不能写入自身最终提交号，初始化在同一分支生成两个标题可区分的提交：第一个提交承载受管改动并成为 `initBaseline.commit`，第二个提交把引用该提交的元信息写入 worktree，最终提交 SHA 作为 expected head 与 open PR/MR 标识一起记入 `.tiller/local/<init-id>/baseline.json`。门禁先判断第一个提交是否为 HEAD 祖先；失败时依次校验同一 commit 的 local merged marker 与 expected head，再由 `src/platform-api.ts` 查询同分支已合入 PR/MR 并要求 `head.sha === expectedHead`。不存在 expected head 时不按初始化编号或标题回退；fresh clone 只有祖先判定或恢复本机 expected head 后才能证明，否则保持 pending。确认后只写包含 expected head 的 `.tiller/local/` merged marker，不修改 tracked `project.json`。无 token、API 失败、head 不一致或没有已合入记录均保持阻断。随后由 `src/platform-api.ts` 推送分支并创建 PR/MR：GitHub 与 GitLab 都优先 tokenized HTTPS `git push`，GitHub 仅在该推送失败时回退 Git Data API；PR/MR 与 squash 合入均走平台 REST API。失败只追加 token/API 下一步，不回滚 worktree、提交或主工作树元信息。分支/工作树创建或提交失败时清理本次 init-id、分支与 Git worktree 登记。

已有 `initBaseline` 的重复初始化只提示在原分支核对，不新建冲突分支；同日 re-init 写入新的 expected head 前清除旧 merged marker，旧 marker 的 commit/head 不能放行新 tip。`close <init-id>` 复用任务 local 的受控清理逻辑，按 id 移除 worktree 登记与整棵本机目录，并默认删除本地与远端的 `chore/tiller-init`；`--keep-branch` 保留分支，删除失败只返回 warning；合入证明失败时在清理前中止。

基线创建成功后，primary 不保留本次 init 的受管文件或元信息种子；本次写入且内容仍匹配、仍为未跟踪的受管文件被精确删除，不使用 `git clean`，用户改写或已跟踪文件保留。`doctor` 与 `close <init-id>` 复用同一祖先/merged/平台 API 合入证明。初始化骨架发现根目录缺失或存在空 `src/`/`test/` 时，在同一受管变更集追加对应 `.gitkeep`；非空目录不覆盖用户内容。

`tiller status` 与成功创建的 `tiller init` 都在结果上叠加只读的 `initBaselineStatus`：存在基线时调用 `proveInitBaselineMerged`，输出 effective `status=merged|pending` 与证明说明。`metadata.initBaseline` 只暴露 `id`、`branch`、`commit`；旧 `status`、`headRef` 及本地快照中的 expected head 不进入 tracked 元信息，也不作为 tracked 结论。无基线时不生成该字段；证明失败或未合入时 effective 为 pending，但 tracked 元信息不出现该字段，也不把结论写回 `project.json`。

## 7. 预检与显式 apply

`initialize` 在创建目标目录、取得工程锁、创建初始化 worktree 或分支、写受管文件与提交之前先确认 PATH 上可执行 `git`（`git --version`），再调用 `assertInitEnvironment`。Git 不可执行时立即以 `INIT_PREFLIGHT_GIT` 非零退出，给出安装地址与 `git --version` 自检指引，且不创建目标目录、`.tiller/local/<init-id>/`、`chore/tiller-init`、提交或 primary 受管文件；`init --apply` 复用同一路径。只有工程根同时是 Git 工作副本根且有 HEAD 时才要求远端：`resolvePlatformRepository` 解析 origin，`platformToken` 读取当前平台 token；任一失败立即返回非零，并给出 origin 修复方式与 `GITHUB_TOKEN`/`GH_TOKEN` 或 `GITLAB_TOKEN`/`GL_TOKEN` 设置指引。该路径同样不产生本次 init 产物。无 Git HEAD 的本地降级路径保持原有行为，但仍要求 Git 可执行。

CLI 的显式 `init --apply` 先执行默认 init 并取得同 expected head 绑定的 open PR/MR，再按顺序调用平台 REST API squash、写入本机合入证明、执行 init-id close，并在 primary 当前位于目标默认分支时用 tokenized `git fetch` 与 `git merge --ff-only` 快进。合入失败、证明写入失败、close 失败或快进失败都停在对应步骤，返回已完成事实、保留必要的 PR/MR 或本机状态，并提示 `tiller merge`、`tiller close` 或 `git pull --ff-only` 的续跑命令。未提供 `--apply` 时仍只开 PR/MR 并保持 pending。
