# 工程初始化设计

## 1. 文件骨架

初始化使用固定最小清单，只创建缺失文件。清单包括 `.tiller/specs/requirements.md`、`.tiller/specs/design.md`、`.tiller/specs/decisions.md`、`.tiller/specs/modules/README.md`、`.tiller/context/project.md`、`.tiller/cases/index.md`、`.tiller/cases/modules/`、`.tiller/cases/scenarios/`、`.tiller/plans/`、入口规则、使用指引和当前平台合并请求模板。骨架内容说明职责与下一步，不预生成空阶段、项目模块或审计目录。`modules/README.md` 说明模块必须同时有规格目录和同名 cases 目录；`plans/README.md` 说明按需规划与依赖阻塞；合并请求模板保持固定五段。

## 2. 受管区段

`AGENTS.md`、`.gitignore`、`.tiller/index.md` 使用成对标记维护固定区段。区段外内容原样保留；标记缺失、重复或顺序异常时报告冲突。共享规则、使用指引、`run.cjs` 和平台模板按文件整体管理。规范化摘要允许受控路径的 LF/CRLF 等价，但不忽略实质字节变化。

## 3. 元信息

`init [path]` 支持当前工程与独立管理工程，仓库范围必须显式且可验证。`project.json` 的 `schemaVersion` 固定为 1；`resourceVersion` 只能是受支持契约；可选 `platform` 为 github、gitlab 或 both，缺省视为 github。`--platform github|gitlab|both` 在初始化时选定平台，CLI 不提供切换命令；手动切换需同步修改 `platform` 并补齐对应模板。GitHub 写 `.github/pull_request_template.md`，GitLab 写 `.gitlab/merge_request_templates/Default.md`，both 同时写两者。可选 `verify.runner` 当前只接受 node-test，`verify.prepare` 必须是非空字符串参数数组；读取时拒绝未知字段或值。升级以 `{ ...metadata, resourceVersion, managedFiles }` 写回，保留用户 `verify` 配置。`managedFiles` 必须恰好覆盖当前平台完整受管集或可补齐的兼容子集。校验在取得锁和写入前完成，失败不留下部分文件。

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
