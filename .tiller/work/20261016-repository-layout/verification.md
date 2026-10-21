# 仓库分组布局验证

> 历史工作资料：已按用户要求直接精简且不备份，仅保留核心文档。原机器记录、审批快照、逐轮测试输出和过程文件已删除；以下结果保留当时范围，不作为当前候选的验证结论或可恢复的受控工作，也不是后续执行队列。

日期：2026-10-16。对象：tiller 0.3.1，`codex/repository-layout` 隔离目录中的本次实现。实测环境为 Windows、PowerShell、Node.js 22.23.2 与 Git 2.55.0.windows.4；未在 macOS、Linux 实测。

## 对应行为

| 要求 | 实际产物与验证 |
|---|---|
| 业务仓库集中在 repositories/ | 初始化接受 `repositories/<id>`，索引与忽略项使用登记路径，安装后的 CLI 已验证 |
| 仓库标识保持稳定 | `repositories` 保存标识，`repositoryPaths` 保存路径；工作、确认和交付引用继续使用标识 |
| 旧布局兼容 | 旧工程按原直接目录解析，升级补映射但不搬迁；0.3.0 升级回归核对原目录和历史记录 |
| 引用与隔离一致 | 工作导航、确认取证、准备环境及接续按映射解析；未参与隔离的仓库仍定位主登记目录 |
| 错误路径不写入 | 歧义、越界、链接、重复 Git 身份、非法元信息和活动绑定篡改有拒绝回归 |
| 新测试工程目录调整 | 两个业务仓库已移至 `tiller-test-multi/repositories/`，HEAD、origin 与干净状态保持，管理根忽略 `/repositories/` |

## 已执行检查

- 元信息、初始化、升级专项：40/40 通过，包含旧布局、中文空格、工程内绝对路径、歧义和身份检查。
- 引用专项：新增 6/6，以及原确认、产物、历史接入 33/33 通过。
- 安装包验证：15 项通过，版本 0.3.1，包含分组初始化、重复接入、规则安装、升级和确认边界。
- 本次修改的主要文档：136 个本地文件链接有效；此检查不验证所有 Markdown 锚点。
- 工程状态 ready，本次需求与设计确认有效；确认内容与实际用户来源已复核。
- lint、typecheck、build 通过；测试夹具修正后重新运行 lint 通过。
- 完整 `npm run check`：154 项，152 通过、2 失败，耗时584.5秒；失败均为新分组用例将 `code.txt` 用作文档产物，触发只允许 Markdown 的已有规则。
- 修正测试资料为 `reference.md` 后，分组 Git/无 Git 管理场景 2/2 通过，耗时94.3秒。产品源码未改变。共用夹具的旧直接布局场景也重新验证2/2通过，耗时54.8秒；最终154项均有通过证据，没有未解决测试失败。

完整日志为本机 `.tiller/local/repository-layout-check.log`，分组补测为 `.tiller/local/repository-delivery-grouped.log`，旧布局补测为 `.tiller/local/repository-delivery-direct-final.log`，包安装为 `.tiller/local/repository-layout-package.log`。保留首次失败结果，不将首次全量命令描述为退出成功。

首次专项发现两处新增测试夹具不完整，修正快照解包与活动工程登记后重跑通过。0.3.0 基线初稿误包含由升级逻辑重建的 `.gitignore`，移除该项后 40 项专项通过。测试目录移动预检查首次因 PowerShell 隐藏 `.git` 查询缺少 `-Force` 退出，未发生移动；补充读取选项后完成路径检查和移动。

## 本地测试工程

`D:/dev_projects_ai/tiller-test-multi/repositories/service-a`：HEAD `595d0b4c38e6b08403c59b3124320eb828d869a9`，origin 为 `https://github.com/ChukiChen/tiller-test-multi-service-a.git`。

`D:/dev_projects_ai/tiller-test-multi/repositories/service-b`：HEAD `4ae090ebebb92f9e46e38533034adb948de172ce`，origin 为 `https://github.com/ChukiChen/tiller-test-multi-service-b.git`。

管理根 HEAD `74399a749fa4a67db718cc1493f3526ee811b12d` 保持不变，只有此前未提交的 `.gitignore` 更新了路径。单仓库测试项目保持原样；新测试工程均未初始化 tiller，留给用户从接入开始验证。未修改旧 Java demo。

## 交接与限制

通过宿主隔离 worktree 和摘要清单交接本次源码，没有伪造 tiller prepare、提交或 MR 回执。回传主目录前逐一核对原文件摘要，未发现并发冲突，36个新增或修改文件已同步到 `D:/dev_projects_ai/tiller`，并复核复制摘要。主目录重新构建通过，CLI版本0.3.1、工程状态ready、本次设计确认有效；后续工作记录以主目录为准。

本机证据日志及安装包已按摘要复制回主目录；安装包为 `.tiller/local/package-validation/tiller-0.3.1.tgz`。这只是本地构建，未向 npm 发布。原隔离副本保留，不作为后续进度的第二维护来源。

尚未获得交付验收，不将本次工作标为已验收。既有 0.3.0 验收材料保留历史，不以旧版本证据证明 0.3.1；本次未提交、推送、合入或发布。自动化测试使用临时仓库，不能替代用户在新测试项目中验证宿主实际遵守工作流程。
