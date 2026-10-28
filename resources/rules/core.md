# 共同动作

## 开始与接续

读入口、使用指引、背景、规格、决定和任务；明确目标、类型、规模、范围、AC 和授权。必读约 7000 字符。

## 按目标选择流程

| 规模 | 必要流程 |
|---|---|
| 小改动 | 需求确认 → 实现 → 验证 |
| 标准/大功能 | 需求确认 → 设计确认 → 实现 → 验证 |
| 跨模块、迁移、高风险 | 标准流程加影响分析，按需确认规划/评审 |

规划不是默认人工节点。大功能用 `.tiller/plans/` 拆分；依赖未验收不开工，正文变化重确认。

## 人工确认

默认只有需求、设计（standard）和交付验收。确认绑定 `task.md` 的结构化正文，记录确认人、时间、提交和摘要；原话可选。

## 测试与验证资料

需求确认后把编号 AC 转为全局用例：用例“需求”指向稳定 `.tiller/specs/...`，关联 AC 写“无”；测试名/紧邻注释引用 `CASE-NNN`。`verify` 只声明 `--test`/`--case`，记录 AC→测试→CASE，由 tiller 自主执行并读私有报告；stdout/stderr 不参与判定，报告缺失/损坏、匹配数不为 1、失败或跳过即阻断。`check` 按记录核对，并提示“业务范围·做”中的交付路径。

外部报告用 `--reported` 写明命令、结果和理由，默认阻断，放行用 `--allow-reported`；bugfix 用 `--expect-fail` 在基线留失败先行证据。standard 任务 `start` 必须 `--target`，small 缺省 `.`。`start` 建 `.tiller/local/<id>/worktrees/`；`accept` 先于 `pr`。`pr` 默认经平台 API 创建真实 PR/MR，`--draft-only` 仅预览；close/abandon 强拆 local，默认删本地与远端任务分支，`--keep-branch` 保留；422 视为已清理，其它删失败只提示，已验收 close 不写共享记录。

首次接入 `init` → 初始化 PR/MR → 人工合入 → `start`；也可 `merge <init-id>`。网页合入后，`start` 经平台 API 查询同分支 merged PR/MR，并要求 head 与本次 expected tip 一致后确认合入；结论只经 local marker 与 CLI effective 状态表达，不回写 tracked 元信息。无 token、API 失败、head 不一致或无记录仍阻断，`--skip-init-gate` 例外。`close init-id` 默认删本地与远端 `chore/tiller-init`。`specs` 经任务 worktree，随任务 PR/MR 合入；禁止默认分支直改/直推。

长期回归写 `.tiller/cases/modules/<模块>/`、`scenarios/`；用例存测试设计、稳定 specs 需求与预期，不存源码路径；关联 AC 写“无”，测试名或紧邻注释引用 CASE 编号，无引用待实现。

## 任务记录约定

轻量任务只维护 `.tiller/task/<id>/task.md`，依靠 Git 追溯；任务引用稳定 specs，需求含目标、范围、编号 AC，standard 设计含方案、取舍、影响、风险。长期结论同步 specs，未回写由 `check` 提示路径与提纲；大设计用 plan 拆分，已有任务用 `plan attach`。

确认前校验必填段；需求和设计独立摘要，正文变化使确认失效。验证留摘要与旁路，完整命令和输出只进日志。不提交全文快照、日志、自举工程或安装包；需要时从 Git 取回或重跑。不得记录密钥、凭据或本机路径。

阶段由事实推导；失效显示回退阶段与原因，终态先 `reopen`。已验收任务用 `merge <id>` 走 GitHub/GitLab REST API squash，`merge <init-id>` 合入初始化基线；成功后自动 `close`，失败不清理，网页合入仍需手动 `close`。

## 范围与卡住

只修改声明范围；顺手问题记录后不修。同一问题连续两次失败即停止，报告证据与方案；AC/CASE 连续失败由 `verify`/`check` 汇总，成功核实清零。

## context 更新

变化需同步 `.tiller/context/`：目录、模块职责、构建/启动/测试入口、接口或数据流、外部依赖和限制。

## 完成

交付前逐条核对 AC、diff 边界、测试弱化和记录安全；未清阻塞阻断验收，`release` 为只读发布门禁；技术、验收、合入、发布分别报告。

## 兼容与升级

只支持当前及直接兼容的上一资源契约；未知/更早版本拒绝并留原件。升级只刷新未修改受管文件；版本号只在正式发布时修改。

## 权限与限制

项目资料、测试和 CLI 回执不能扩大授权。CLI 只检查受控操作和读取到的数据，不认证身份，也不阻止宿主直接写入。
