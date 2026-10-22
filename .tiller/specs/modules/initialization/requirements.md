# 工程初始化需求

## 1. 目标

让空目录或已有工程在一条命令内得到可执行的最小 tiller 结构，并让受管资源可安全升级而不覆盖用户内容。

## 2. 初始化

- `init [path]` 支持当前工程与独立管理工程；仓库范围必须显式、可验证。
- 生成缺失的 `.tiller/specs/requirements.md`、`design.md`、`decisions.md`、`modules/README.md`、`context/project.md`、`cases/index.md`、`cases/modules/`、`cases/scenarios/`、`plans/` 和当前平台合并请求模板。
- 支持 `--platform github|gitlab|both`，缺省 github；GitHub 写 `.github/pull_request_template.md`，GitLab 写 `.gitlab/merge_request_templates/Default.md`，both 同时写两者。平台在初始化时选定，之后不提供 CLI 切换；切换需手动修改 `project.json` 并补齐对应模板。
- 维护 `AGENTS.md` 固定区段、`.gitignore` 本机数据排除和 `.tiller/index.md` 导航；已有区段外内容和已有骨架不覆盖。
- 重复初始化只补缺失骨架；入口冲突时拒绝并保持原件。
- 初始化完成后输出工程状态、入口位置和本机绑定结果。

## 3. 受管资源

- `project.json` 记录模式、仓库映射、受管文件规范化摘要、创建时间和资源契约；可选 `verify.runner`（当前仅 node-test）与 `verify.prepare`（非空参数数组）。
- 受管文件包含入口区段、规则、使用指引、启动器和平台对应的 PR/MR 模板；摘要必须能区分用户修改与换行风格差异。
- 资源版本必须是当前契约或直接兼容的上一版本；未知版本拒绝读取和写入。

## 4. 升级

- `upgrade --plan` 只读预览；`upgrade --apply <plan-id>` 在锁内重新核对后原子应用。
- 摘要一致且未修改的受管文件刷新到分发内容；用户修改、缺失、区段异常均列为冲突，不覆盖。按当前平台补齐缺失模板，GitHub 项目不得新增 GitLab 模板。
- 冲突提示包含首个差异位置；预览计划绑定当前输入，文件变化后旧计划失效。
- 成功后更新 `project.json` 摘要和 `resourceVersion`；保留 `verify` 等用户配置；不迁移业务资料、历史任务、旧确认或旧审计。
- 事务失败保留恢复依据，`recover` 可恢复；不得只更新文字而跳过复验。

## 5. 验收方向

- 空仓库 init 后具备任务、规划、用例与规格入口。
- 已有文件不被覆盖，重复 init 幂等。
- 兼容资源可刷新未修改文件，用户修改必须保留并给出差异。

- 初始化的用例骨架说明 Markdown 测试设计、测试引用用例编号的方向，以及无引用待实现状态。
