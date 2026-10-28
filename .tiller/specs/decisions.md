# 长期决定

只记录仍约束当前实现的取舍；被替代内容以 Git 历史为准，不在工作树保留副本。

## 2026-10-22 默认轻量工作流

- 默认路径为 `start`、`resume`、`confirm`、`verify`、`check`、`accept`。
- 小改动走需求确认、实现、验证；standard 代码任务增加设计确认。默认人工节点只有需求、设计和交付验收。
- 规划、合入、发布按需操作；不恢复阶段引擎和审计命令。

## 2026-10-22 任务记录

- 单次任务只维护 `.tiller/task/<id>/task.md`；本仓库历史记录已迁入 task，外部旧仓 `.tiller/work/` 仅作只读遗留兼容。
- 需求和设计正文必须先写清；新任务使用结构化需求与设计模板，旧正文保持可读。
- 确认记录确认部分、确认人、时间、对象摘要和提交；原话不再必填，只作可选附注。
- 需求与设计分别摘要；只改设计不会使需求确认失效。任务完成后长期结论同步到 specs，超大设计先用 plan 拆分。
- 验证正文保存人读摘要，完整命令、结果、提交与代码树摘要保存在单行机器旁路；完整输出只写 `.tiller/local/<id>/logs/`，不提交原始日志、全文快照、安装包或证据包。
- 同一问题连续两次修复失败后停止自动尝试并报告可选方案。
- 验证停止按同一 `AC-N` 或同一 `CASE-NNN` 独立计数，成功核实清零；不同键的失败不相互叠加。`verify` 和 `check` 都提示停止自动重试并保留证据，规格/背景回写建议仍不单独阻断验收。

## 2026-10-22 全局用例

- 产品级回归事实放 `.tiller/cases/`，模块名与 specs 一致，类型只允许 behavior/interface/performance/security，跨模块路径放 scenarios。
- 需求确认后先改全局用例，再写测试和实现。
- 新用例的关联 AC 写“无”，以“需求”字段挂稳定 `.tiller/specs/...`；历史空 `criteria` 或 `task#AC` 只作可迁移 warning，不批量伪造。
- `check` 以 `verify` 的 AC→测试→CASE→当前验证记录核对覆盖；编号全局唯一且稳定。

## 2026-10-22 规划

- 大功能可用 `.tiller/plans/<id>.md` 拆分；单次小改动不强制规划。条目可用 `plan=` 指向子规划，但不做层级调度引擎。
- 条目依赖未验收时阻塞开工；不采用只警告后继续。
- 规划正文变化使确认失效；规划不是第四个人工门禁。

## 2026-10-22 初始化与升级

- 空工程 init 生成最小骨架，已有文件不覆盖。
- 升级刷新未修改的受管文件；用户修改只报冲突并保留。预览不写文件。
- 只支持当前和直接兼容的上一资源契约；未知/更早版本拒绝，不做历史迁移。
- 版本号只在正式发布正式包时修改；功能开发不 bump 包或资源版本。

## 2026-10-22 旧审计清理

- 不保留 reviews JSON、全文确认快照、原始证据包、旧 verification CLI、advanced 可选路径。
- 需要历史证据时从 Git 取回或重跑测试；不以审计目录替代事实源。
- 被推翻内容不保留工作树副本，也不在活动文档中引导读取。

## 2026-10-22 任务阶段与关闭

- 阶段从 task.md 的确认、验证、验收与关闭事实推导，不另存状态字段；失效时显示回退阶段和原因。
- 已验收即交付完成；合入后 `close` 只清理 `.tiller/local/<id>/` 与任务 worktree，不改写共享 `task.md`。未验收终止用 `close --abandon`，仍把放弃原因和时间写入共享记录并阻塞后续确认、验证与验收。
- `reopen` 追加恢复事实；已验收任务再次交付可从已验收重开；规划不把放弃任务算作进行中或已验收。

## 2026-10-22 确认去原话化

- `confirm`、`accept` 和 `plan confirm` 的 `--quote` 改为可选；`--by` 指定确认人，缺省取 Git `user.name`，再退回系统用户。
- 确认前校验结构化必填段；确认记录自动保存确认部分、确认人、时间、提交和摘要。
- 历史 task.md 正文仍可读；确认只认当前紧凑表与机器旁路。不为兼容恢复全文快照或证据包。

## 2026-10-22 提交、分支与 PR/MR

- 提交主题使用 `类型(模块): 中文摘要`，类型限 feat/fix/docs/refactor/test/chore；PR/MR 标题末尾加 `[任务编号]`，主模块按范围声明顺序取首个，说明固定五段。
- 分支使用 `类型/任务编号[-简短描述]`，不再使用 `codex/` 前缀；main/master 与 detached HEAD 跳过检查。
- `pr <task-id>` 默认从本地 `task.md` 和 Git 生成五段说明，再用 tokenized HTTPS git push 推送任务分支，并经平台 API 创建真实 PR/MR；`--draft-only` 才只生成离线草稿。标题摘要依次取 `pr --summary`、任务元数据、最早规范 feat/fix 提交摘要和任务标题；分支描述依次取 `--slug`、任务元数据、当前分支；变更内容按提交时间正序，验证按 AC 用普通嵌套列表保留全部记录。
- 关联任务输出纯文本路径，避免相对链接在 PR/MR 页面被错误解析；不引入仓库网页地址配置。
- `platform` 取 github、gitlab 或 both，缺省 github；init 按平台生成同内容模板，upgrade 只补齐当前平台，GitHub 项目不得新增 GitLab 模板。
- 提交与分支格式检查只提示，不阻塞交付。
- 必读资料以清晰完整为先，预算由约 5000 字符放宽到约 7000 字符；平台在初始化时选定，不提供 CLI 切换。

## 2026-10-22 自主验证与防伪

- `verify` 只声明 `--test "<文件::测试名>"`，由 tiller 通过适配器构造并执行精确匹配的 node:test 命令。
- 结果只从私有临时报告读取，stdout/stderr 不参与判定。报告缺失/损坏、匹配 0 个或多个、失败或跳过均不能核实为通过。适配器接口与注册在 `src/test-output.ts`。
- `project.json` 可选 `verify.runner`（缺省 node-test）和 `verify.prepare`（参数数组）；准备失败即验证失败，升级保留该用户配置。
- 无法本机执行时允许 `--reported --command --result --reason`，理由必填；`check`/`accept` 默认阻断，只有 `--allow-reported` 放行，`pr` 标明未执行。
- bugfix 任务必须用 `--expect-fail --test` 在任务基线临时工作树复用同一适配器和私有报告路径留下失败证据，并保留当前同一测试的已核实通过证据。
- standard 任务 `start` 必须声明 `--target`；small 继续缺省 `.`。已验收历史任务仍按原 acceptance 提交复查；缺少当前核实旁路的记录按未核实处理。

## 2026-10-23 评审、发布与验收提交

- 独立评审用 `review <task-id>` 写入 `task.md` 的评审段；`--blocking` 发现未用 `--resolve` 清除时，`check`/`accept` 阻塞。评审是验收前的按需检查，不增加第四个默认人工节点。
- 发布用只读 `release <task-id>` 检查验收提交、项目元数据、受管资源、README/包版本和任务范围清洁度；`check` 汇总同一清单，但发布仍是独立可选门禁。发布真实执行、合入和授权不由 CLI 代办。
- `start` 增加 `--requirement-file`，只接受工程内相对路径和非空普通文件；任务正文仍保存可执行需求，文件路径作为来源记录。
- 已验收任务按 acceptance 确认中的提交复查代码树、测试文件、范围 diff 和测试弱化；未验收任务继续按工作区/HEAD。验收时的核实状态、外部报告理由和测试引用仍按原记录检查，不因“已验收”自动放行。
- 任务基线后没有 `.tiller/specs/` 或 `.tiller/context/` 回写时，`check` 只告警；是否形成长期结论由人判断。

## 2026-10-23 历史空 AC 长期提示

- 历史用例为空关联 AC 或仍写 `task#AC` 时，`check` 长期只提示，不阻断日常自检；该状态作为已知历史债务接受。
- 不批量回填，也不以占位、推测或当前任务 AC 冒充历史来源。只有能确认原始依据时才补充。
- 新用例关联 AC 固定为“无”，需求字段指向稳定 specs；AC 覆盖由任务 verify 记录承担。

## 2026-10-23 多仓库验证与 Java 运行器

- `project.json` 的 `repositories` 改为对象数组，每项包含 `id`、`path` 和可选 `verify`。`verify.runner` 与 `verify.prepare` 按字段覆盖根级默认，不另建旁路映射。
- 仍读取旧的 `repositories: string[]` 加 `repositoryPaths`。新初始化和升级写回对象数组，并删除 `repositoryPaths`。`mode: workspace` 至少一条仓库，`mode: project` 仍必须为空。资源版本保持 0.5.0。
- 验证先用测试文件路径找到唯一所属仓库，再用该仓库的运行器；准备命令和测试进程的工作目录是该业务仓库根。工作区不能唯一匹配时失败关闭，不回退到根配置。当前工程没有仓库时使用根配置。不根据扩展名猜测语言，不内嵌 JVM。
- 运行器增加 `junit-maven` 和 `junit-gradle`，分别构造 Maven `-Dtest` 与 Gradle `--tests`，并从 `.tiller/local/` 下的 JUnit XML 核实。缺失、多匹配、跳过和额外失败都不能通过。尚未适配的框架继续使用 `--reported`。
- 增加 `pytest` 运行器：识别 pytest 配置或常见 Python 测试布局，构造 `--junitxml` 私有报告，模块/类/方法从测试引用与 XML 精确匹配。只调用本机 pytest，不内嵌解释器、不自动安装依赖；缺失时验证失败而不是跳过。
- 受管文件漂移可用 `upgrade --adopt` 采纳当前内容摘要而不重写文件；已有任务可用 `plan attach` 补挂已确认规划条目。两者都不伪造确认或验收。

## 2026-10-23 过薄文档与验证日志

- standard 任务设计字段、长期决定和本任务涉及模块设计的明显空壳只给出路径提示，默认不单独阻断验收；不以字数作为门禁。
- 验证日志记录显示命令、起止时间和退出码，原始输出仍只留本机；代码树变化时，`check` 与 `resume` 都明确说明验证已过期。
- 分支名未包含当前任务编号时只提示，不阻塞技术自检。

## 2026-10-24 文档模板与任务标记

- 新任务的开工前改动摘要写 `.tiller/local/<id>/pre-existing.json`；只从该任务本机旁路读取。
- 新任务需求的固定章节为使用场景、目标、业务范围、关键行为、异常与边界、验收条件；业务路径只进任务范围。standard 设计使用方案、失败处理、取舍、影响与风险、验证入口。
- 确认拒绝空白或占位关键章节，取舍缺失保留提示；旧任务的“范围”章节继续兼容。初始化和规则只提供简短章节提示，不提供长示例。

## 2026-10-24 任务 worktree 生命周期

- `start` 只对已提交的 Git 工程建任务 worktree。project 为 `.tiller/local/<id>/worktrees/`；workspace 为同目录的 `management` 加各登记 `repository.path`，各仓同名任务分支。task.md 不迁入 worktree。
- 建树先校验全部仓库与目标路径，失败回滚；已验收 close 与 abandon 都强拆清单或约定布局中的目录，并删除整棵 `.tiller/local/<id>/`，其他任务目录不动。
- 本机清单放在 `.tiller/local/<id>/worktrees.json`，缺失时按 project/workspace 约定布局兜底；共享记录不保存本机绝对路径。
- 本轮不改造 bugfix 临时基线 worktree，不在 reopen 时重建，也不自动提交、合入或连接远端。

## 2026-10-26 任务本机目录聚合

- `.tiller/local/<id>/` 聚合 `worktrees/`、`logs/`、`pre-existing.json` 和 `worktrees.json`。
- close 与 abandon 拆除 worktree 后只删除整棵任务本机目录；缺失幂等，也不触碰其他任务目录。已验收 close 只做本机清理，abandon 仍写共享放弃记录。
- sidecar 和开工前摘要只读取当前任务本机目录；不在 reopen 时重建 worktree。

## 2026-10-26 PR 前同步任务记录

- 标准交付链为 `verify` → `check` → `accept` → 提交任务记录（其中含 acceptance）→ `pr` → 人工合入 → `close`（清理 local 与分支）。accept 必须在 pr 前完成并进入任务分支。
- `pr` 无有效交付验收时以 `PR_NOT_ACCEPTED` 硬阻断，提示先 `accept`、提交任务记录再生成草稿；记录未提交仍以 `PR_TASK_RECORDS_DIRTY` 阻断并列出本任务 id 与 scope 覆盖的路径。
- 门禁只检查本任务 id 与 scope；其他任务 `.tiller/task/<other>/` 不阻断，也不提供 `--allow-dirty-records`。`confirm`/`accept` 写入确认后自动提交本任务记录；其它路径仍不自动 `git commit`。无 Git 或无法读工作树时仅跳过记录门禁并提示，验收门禁仍生效。

## 2026-10-26 合入后冻结共享任务记录

- 合入即交付完成；合入后 `close` 清理任务 worktree、`.tiller/local/<id>/`，并默认删除本地与远端任务分支，不调用共享 `task.md` 写入，不要求补 `accept` 或另作收尾提交。
- 旧只认共享“已关闭”段的任务可由已验收或 local 已清理推导完成；`abandon` 发生在合入前，继续写共享放弃事实。重开是显式写操作，不进入合入后主路径。

## 2026-10-26 远端操作走 Git 传输与平台 HTTP API

- GitHub 与 GitLab 的分支传输优先使用 tokenized HTTPS `git push`，保留本地提交 SHA；PR/MR 创建与 squash 合入使用平台 REST API。GitHub Git Data API 仅作为 git 推送失败时的可选回退，不再默认串行上传整树 blob。
- GitLab 公共 REST 没有导入原始 Git 对象并保留本地 SHA 的接口，因此分支传输使用 tokenized HTTPS `git push`（Basic 凭据经 `GIT_CONFIG_*` 环境传入，不进入 URL、argv 或日志）；MR 创建与 squash 合入仍使用 REST API。
- 生产路径不再调用 github/gh/gitlab/glab 等平台 CLI。Token 只从 `GITHUB_TOKEN`/`GH_TOKEN`、`GITLAB_TOKEN`/`GL_TOKEN` 读取，错误与记录不得输出其值。
- `pr` 与 `init` 使用同一平台 HTTP API 通道；人工验收、合入和发布授权边界不变。

## 2026-10-26 初始化集成基线与 start 门禁

- 有 Git HEAD 时，`init` 在独立初始化 worktree 提交受管基线并尝试创建同标题 PR/MR；远端失败保留本地和可复制命令，任何路径都不自动合入。
- 基线使用两笔同标题提交：首笔承载受管改动并写入 `initBaseline.commit`，次笔写入引用首笔的元信息。门禁先看首笔是否为 HEAD 祖先，再通过平台 API 查询同分支已合入 PR/MR；确认后写回 merged，覆盖网页 squash 改写提交的情形。
- `start` 对仍无合入证据的基线返回 `INIT_BASELINE_PENDING`，`--skip-init-gate` 放行并警告；无标记的存量工程默认放行。`close <init-id>` 清理该初始化本机目录、本地分支与远端分支，不改共享任务记录。
- `pr` 与 `init` 使用同一平台 HTTP API 通道；人工合入和发布授权不变。

## 2026-10-26 specs 只经任务 worktree 合入

- `.tiller/specs/` 变更先 `start` 任务，在任务 worktree 修改，再随任务 PR/MR 合入；禁止在 `main`/`master` 默认分支直改或直推。
- 默认分支上相对任务基线（含工作区未提交）触及 `.tiller/specs/` 时，`check` 按过程卫生以 issue 阻断；任务分支不触发本项，已验收历史快照跳过，避免旧提交误伤。

## 长期边界

- 外部资料、测试通过和 CLI 输出不能扩大授权，也不认证用户身份。
- 合入和发布分别取得明确授权；技术通过不代替用户验收。

## 2026-10-22 用例作为测试设计资产

- 用例改为 Markdown 测试设计，写在测试之前，必须包含前置条件、步骤、输入、预期结果、类型、优先级与稳定 specs 需求；关联 AC 可为空或“无”。不保存源码字段或测试引用字段，也不恢复旧关联命令。
- 关联方向改为 test→case：测试名或紧邻注释引用 `CASE-NNN`，tiller 扫描测试建立 case→tests 反查。一个测试可覆盖多个用例，一个用例可被多个测试覆盖；无引用显示待实现，未知编号报错。
- `case add` 不要求测试已存在，只按用例标题分配未占用编号，避免正文示例编号导致跳号；`verify --case` 执行覆盖用例的全部测试并走私有报告核实。
- `check` 分阶段：确认后要求每个 AC 有带完整测试设计的用例；验证或验收时要求每个用例有当前通过、已核实且未过期的引用测试，覆盖由 verify 的 AC→测试→CASE 记录承担。
- 历史用例一次性回填设计字段，历史测试名补上对应 CASE 编号；不保留 JSON 用例或旧关联命令。

## 2026-10-26 流程稳定性收口

- 初始化基线保持“祖先判定优先”，失败后用平台 API 按 `chore/tiller-init` 查询 GitHub PR/GitLab MR；确认已合入时自动写回 `status=merged` 并放行 `start`。无 token、API 失败或无已合入记录均不得静默放行，`--skip-init-gate` 仍是唯一显式旁路。
- `merge` 与 `close` 默认删除本地及远端任务分支，`close <init-id>` 对应 `chore/tiller-init`；`--keep-branch` 显式保留。分支已不存在、缺少 token、当前分支无法安全切换或平台删除失败都只进入 warnings，不回滚已合入或本机清理。
- 全局用例彻底移除“源码”字段与旧 `--source` 参数，模板、解析器、文档和存量用例同步迁移；关联只由测试名或紧邻注释引用 `CASE-NNN`。遗留“源码”行读取时忽略，新写入不再生成。
- `check` 扫描需求“业务范围·做”中的交付文件路径并给出可定位 warning，默认不阻断；交付路径仍只应写入任务范围。

## 2026-10-26 用例锚定稳定需求

- 任务是短暂交付物：`task.md` 通过正文或“需求来源”引用稳定 `.tiller/specs/...`；全局用例的“需求”字段挂 specs，不再用 `taskId#AC` 作为主要链接。
- specs 的验收条件使用普通 `AC-1`/`AC-2`…，由文件路径区分模块；禁止给 AC 编号加模块前缀或另造其它编号。`VER-CASE-REQ-*`、`FLOW-SPEC-AC-*` 等可保留为叙述性能力小节标题，但不作为验收条件编号。
- 任务通过“需求来源”挂 specs，验收条件复用该文件的同一套 `AC-n` 正文；不写模块前缀或“对照”平行列表，也不把 `taskId#AC` 当用例锚。
- 新用例的“关联 AC”固定写“无”；`case add` 不要求 `--criterion`，继续要求存在的稳定 specs 需求路径。误传 `--criterion` 明确拒绝，不写入 `task#AC`。
- AC 覆盖只认 `verify` 记录的 AC→测试→CASE 与测试扫描；历史 `task#AC` 和空关联 AC 保持可读，只给可迁移 warning，不阻断已验收历史。
- `start --requirement-file` 与任务“需求来源”只允许 `.tiller/specs/` 下相对路径；`.tiller/local/` 等临时或其它路径明确失败，并提示先写入或拷贝进 specs。
- `start --requirement-file` 保留多行/结构化需求并始终写“需求来源”路径；文件“验收条件”（历史“验收条件（稳定）”仅作读取别名）中的 `- AC-n: ...` 导入任务并以文件为准，可省略 `--criterion`；文件无 AC 时仍要求命令行条件。新渲染只写“验收条件”。
- 资源契约保持 0.5.0；CLI、usage、rules、初始化模板和 decisions 同步“task→需求、用例→需求、无来源 AC 回指”。

## 2026-10-27 单一交付通道与过程卫生

- `tiller pr` 默认经既有 `pushBranch` + `createPullRequest`/`createMergeRequest` 推送并创建真实 PR/MR，JSON 返回 URL/编号；`--draft-only` 只作离线预览。主路径统一为 `accept → pr → merge`，不再把草稿后手搓 API 作为第二通道。
- `merge`/`close` 从任务 worktree 根解析主工程根，先拆 worktree 再在主仓和各业务仓删除本地任务分支；远端 404/422 视为已清理，重复 close 幂等，已验收 close 不改共享 `task.md`。
- 交付命令从任务 worktree 调用时，任务记录优先从含 `.tiller/task/<id>/task.md` 的当前相关检出读取；主仓只承担推送、平台 API、worktree 与分支清理。任务在所有相关检出均不存在时保持 `TASK_NOT_FOUND`。
- `doctor [path]` 独立检查初始化基线、默认分支 specs 脏改、残留任务分支与进行中 AC 缺口；严重项非零退出，warning 不阻断。`check` 的任务级门禁与单一 AC/CASE 数据模型保持不变。

## 2026-10-27 狗粮路径卫生

- start 在任务 worktree 建立后只向该 worktree 写入 `.tiller/task/<id>/`（多仓再同步兄弟 worktree），失败回滚且清理 primary 残留；后续任务记录只传播到原本已有该记录的检出，不写回 primary。
- doctor 与 close init-id 复用 start 的祖先/status/API 合入证明，squash 不要求 SHA 祖先；证据不足仍保持 pending，不伪造 merged。
- init 以初始化 worktree 提交为事实源，成功后精确删除主树本次写入且仍未跟踪的受管文件，仅保留 `.tiller/project.json`；不使用 `git clean`。缺失或空的 `src/`/`test/` 在同一初始化变更中补 `.gitkeep`，不覆盖非空目录中的用户文件。
- `pr` 的 TTY 默认保持 Markdown，显式 `--json` 或非 TTY 默认稳定 JSON；draft-only 仍不联网。远端分支 404/422/不存在语义统一计入已清理且不进 warnings。

## 2026-10-27 worktree 为任务真相

- `resolveTaskCheckout` 先识别 cwd 或显式路径所在的本任务 worktree，再考虑 primary 副本；双份 `task.md` 并存时以当前任务检出为任务根。
- `case add`、`confirm`、`verify`、`check`、`accept`、`review`、`release`、`reopen`、`resume <id>`、`attach` 与 `pr` 统一经该入口，任务 worktree 缺记录时清晰失败而不静默读取 primary。
- 从任务 worktree 写任务记录不镜像 primary；primary 只承担 push、平台 PR/MR API、拆树和删除本地/远端分支。显式 `--path primary` 保留读取主仓副本的能力。

## 2026-10-27 start/confirm/requirement 软摩擦根因

- `start` 只把 `.tiller/task/<id>/` 写入任务 worktree，不再在 primary 留存活种子；close 会清理 primary 残留目录。
- `confirm`/`accept` 在绑定确认对象并写入 `task.md` 后自动提交本任务记录（`chore: …确认`）；验收仍绑定写入前 HEAD。
- `--requirement` 仅短目标单行；完整需求与 AC-n 只走 `--requirement-file`（`.tiller/specs/`），不放开多行完整需求。

## 2026-10-27 GitHub 推送优先 tokenized git

- 产品边界是 Git 做 commit、push 与删分支，平台 API 只做开 PR/MR、merge 和读远端状态。GitHub `pushBranch` 因此先走 tokenized HTTPS `git push`；Git Data API 不再是默认主路径，只在 git 推送失败时作为可选回退，避免整树 blob 串行上传拖慢 `tiller pr`。

## init 只写 worktree 与基线 merged 本地标记（2026-10-27）

- 决定：`tiller init` 在可创建初始化基线时，受管文档只提交到 init worktree；primary 不预建未跟踪 `.tiller/` 种子。合入证明后的 `merged` 写入 `.tiller/local/init-baseline-merged.json`，不把跟踪的 `project.json` 改成仅工作区脏。
- 代价：合入前 primary 可能尚无完整骨架，须先合入 init PR；测试夹具用 settle 物化文件。
- standard 过早 `verify` 以 `VERIFY_BEFORE_DESIGN` 拒绝；历史错序段用 `verify --clear-premature` 清除。

## 2026-10-27 close 保持共享任务记录

- 决定：`close`/`merge` 自动 close 与 abandon 只清理任务 worktree、任务本机目录与分支；合入后的任务记录靠默认分支快进/pull 读取。
- 代价：从未合入就 close 的任务不会在 primary 留下未跟踪副本；reopen/plan 仅在记录仍可解析（通常已跟踪）时可用。
- abandon 若 primary 已有该任务文件则刷新已有副本，仍不新建未跟踪种子。

## 2026-10-27 合入后不变式、短目标骨架与 PATH 单一入口

- merge/close 后 primary 不保留 tiller 生成的未跟踪任务树；合入记录只通过默认分支快进/pull 成为跟踪文件。自动化测试以 `git status` 与 `git merge --ff-only` 锁住该不变式，避免收尾副作用再次出现。
- `--requirement` 保持单行短目标通道，但 start 会把短目标展开为可确认的结构化需求骨架，并逐条写入 AC；`--requirement-file` 仍以文件为准。代价是骨架中的业务范围与异常边界采用保守默认值，确认人仍需按实际目标复核。
- 主路径、狗粮和 package smoke 统一调用 PATH、`npx` 或打包入口的 tiller。
- commit scope 的 `specs`、`workflow`、`standards`、`initialization`、`verification` 视为约定名称，不再按模块目录误报；未知模块仍提示。

## 2026-10-27 任务生命周期以 worktree 事实为准

- `doctor` 从 active 任务 worktree 读取任务记录检查 AC 覆盖与数据模型；primary 没有 `.tiller/task/` 不再表示没有进行中任务，active 任务分支缺记录直接失败。
- 已验收 `close` 先验证主检出跟踪记录、默认历史或平台 API 的合入证明，证明不足时保留 worktree、本机目录和分支。清理后没有可读取记录时，结果不提示 `reopen`。
- `abandon` 先确认 primary 已有清理后仍可读取的任务记录，再写放弃事件并清理；无法持久化时拒绝破坏性清理，不创建未跟踪 primary 种子。

## 2026-10-28 单一入口与当前任务目录

- 主路径只使用 PATH、`npx` 或安装包中的 `tiller`；受管清单只包含入口、规则、使用指引和平台模板。
- `close`/`abandon` 只处理当前任务的 worktree、`.tiller/local/<id>/` 与分支。
- 历史 task 正文继续可读；已退役的确认和验证旁路不参与解析或校验。

## 2026-10-28 平台结果可重建与 init head 锚点

- init 的跟踪元信息用稳定 tag ref 记录 squash 前 PR head。提交不可能包含自身 SHA，因此不在同一提交内伪造 head；tag ref 可在分支删除后解析到准确 head，并随远端保留。
- init 第二个提交标题与基线提交不同，init PR 标题包含 init id；fresh clone 先解析跟踪 head ref，再以平台同分支、同 head 的已合入 PR/MR 证明基线。
- `close <init-id>` 只有证明成功才清理；证明失败保留全部 init 事实。

## 2026-10-28 accepted abandon 自动提交

- 已验收但未合入的任务允许 `close --abandon`。放弃事件写入 primary 任务记录后，使用只包含该任务路径的提交持久化，再清理 worktree、本机目录与分支。
- primary 无 Git 写入能力或当前分支就是将被删除的任务分支时返回 `ABANDON_NOT_PERSISTABLE`，不清理；不再要求用户手工复制和提交任务记录。

## 2026-10-28 PR 创建幂等与导入呈现

- `pr` 在创建前和创建失败后都按 head branch + head SHA 查询开放 PR/MR；命中即复用，查重失败时不盲目创建。
- requirement-file 的顶层 `##` 是任务需求章节，深层标题随所属正文保留并降级到任务记录层级；全局 specs 任务标题使用 `specs` scope。
- check 将同一模块的覆盖缺失与回归建议合并为一条非阻断提示，并统一去重。

