# 远端操作改走平台 HTTP API

<!-- tiller-task:v1 {"version":1,"id":"20261026-api-remote-ops","type":"feature","size":"standard","created":"2026-10-26T08:41:29.048Z","base":"ef1a2de38ded0b4ec827b5b76a174ee1fa3b30a9","scope":["src","test","resources",".tiller","README.md","scripts"],"format":"structured","slug":"api-remote-ops","summary":"远端 git 与 PR/MR 仅用 API","requirementFile":".tiller/local/20261026-api-remote-ops-req.md"} -->

## 需求

### 面向谁与问题

使用 tiller 做工程初始化与交付的人（含 AI 执行者）。现状：init 自动开 PR/MR 与 `tiller merge` 依赖 PATH 中的 `github`/`gh` 或 `gitlab`/`glab`；Windows 演示机常缺 CLI，仅告警、不建 PR。用户已选定：默认只用平台 HTTP API，不再依赖 CLI；并要求其它远端 git 操作同样走 API。

### 目标

tiller 对远端/平台的操作（推送 init 分支、创建 PR/MR、squash 合入）一律用 GitHub/GitLab HTTP API + 环境变量 token；本地 git 库操作仍用 `git` 二进制；无平台 CLI 也能完成 init 远端步骤与 merge；版本保持 0.5.0。

需求来源：`.tiller/local/20261026-api-remote-ops-req.md`

### 业务范围

- 做：
  1. 用 Node 调用 GitHub/GitLab REST，替代所有 `resolvePlatformCli` / 平台 CLI spawn。
  2. Init：推送 `chore/tiller-init` 并创建 PR/MR；失败保留本地，next 以 API/token 配置提示为主。
  3. `tiller merge`：API squash 合入后仍自动 close；失败不清理。
  4. 移除生产路径对 `platform-cli.ts` 的依赖；更新 usage/rules/help/README；CASE+测试；0.5.0。
  5. 在 `.tiller/specs/decisions.md` 写明 push 是纯 Git Data/Commits API，还是仅传输层的 tokenized `git push`（禁止平台 CLI）。
- 不做：不升版本；不要求安装 gh/glab；不在日志/PR/任务记录打印 token；不改变「不自动网页合入后的人工边界」以外的合入授权语义。
- 假设与待确认：Token 名 `GITHUB_TOKEN`/`GH_TOKEN`、`GITLAB_TOKEN`/`GL_TOKEN`；从 `origin` URL 解析 owner/repo（及 GitLab host/project）；推送优先纯 API，若对象上传不可行可保留无 CLI 的 tokenized `git push` 并文档化。

### 关键行为

1. 无 `github`/`gh`/`gitlab`/`glab` 时，只要有有效 token，init 可推送并创建 PR/MR，merge 可 squash 合入。
2. 缺 token 时给出清晰中文失败/警告与设置指引（可含 curl 示例），不以「请安装 GitHub CLI」为主路径。
3. worktree/commit/rev-parse/diff/本地分支/config 仍用本地 `git`。
4. 测试以可注入的 HTTP/mock 覆盖成功、失败、缺 token；旧 fake CLI PATH 用例改为 API 路径。

### 异常与边界

- 推送或创建 PR 失败：不回滚本地 init worktree/提交；返回可复制的 API/token 下一步。
- merge API 失败：不 close、不删 local。
- origin 无法解析或平台 both 无法判断：明确错误，提示改 project.json 或修正 remote。
- Token 仅从环境变量读取，永不写入受管文件或日志。

### 验收条件

- AC-1: 生产路径不再调用 github/gh/gitlab/glab；platform-cli 不再被 init/merge 使用；文档与错误不以安装平台 CLI 为主路径
- AC-2: init 在具备对应 token 时可推送 chore/tiller-init 并创建 PR/MR；失败保留本地并给出 API/token 导向的 next；缺 token 有清晰中文提示
- AC-3: tiller merge 通过 API squash 合入 GitHub PR / GitLab MR，成功后仍自动 close；失败不清理本机
- AC-4: decisions 写明 push 实现选择；README/usage/delivery/core/help 与镜像一致；版本 0.5.0；全量门禁通过

## 设计

### 方案

1. **新建 `src/platform-api.ts`，替换 `platform-cli.ts` 生产路径**
   - 从 env 读 token：GitHub `GITHUB_TOKEN` 或 `GH_TOKEN`；GitLab `GITLAB_TOKEN` 或 `GL_TOKEN`；永不日志输出 token。
   - 从 `git remote get-url origin` 解析：GitHub `owner/repo`（api.github.com 或 GHES host）；GitLab host + URL-encoded project path。
   - 可注入 `fetch`（测时 mock）；封装 `createPullRequest` / `createMergeRequest`、`mergePullRequest` / `mergeMergeRequest`（squash）、`pushBranch`。
   - 删除 init/merge 对 `resolvePlatformCli` 的调用；`platform-cli.ts` 可删除，或仅留死代码检测测试证明无引用。

2. **推送（AC-2，写入 decisions）**
   - **优先**：GitHub Git Data API（blob→tree→commit→refs）/ GitLab Commits API，把本地 init 提交对象同步到远端并更新 `refs/heads/chore/tiller-init`（要求父提交已在远端）。
   - **若父对象缺失或实现成本过高**：回退为 **tokenized `git push`**（HTTPS + token 凭据/`http.extraHeader`，**不是** gh/glab CLI），并在 `.tiller/specs/decisions.md` 明确记录「传输层用 git，平台操作用 REST」。
   - 用户可见 next：缺 token 时提示导出 `GITHUB_TOKEN`/`GITLAB_TOKEN`；可选 curl 创建 PR 示例；不以 `github pr create` 为主。

3. **创建 PR/MR（init）与 squash merge（`tiller merge`）**
   - GitHub：`POST /repos/{owner}/{repo}/pulls`；合入 `PUT .../pulls/{n}/merge` 或按 branch 先查 PR 再 merge，`merge_method=squash`。
   - GitLab：`POST /projects/:id/merge_requests`；合入 `PUT .../merge_requests/:iid/merge`（squash）。
   - `mergeFlow` 成功后仍 `closeFlow`；失败不清理。返回的 `command` 字段改为描述 API 操作（如 `github-api pulls.merge squash`），不再假装 CLI。

4. **文档与受管镜像**
   - 更新 `resources/usage.md`、`rules/core.md`、`rules/activities/delivery.md`、CLI help、必要时 README：说明 token 环境变量与 API；去掉「安装 github/gitlab CLI」主路径；resources ↔ `.tiller` 镜像一致；digest/`project.json` 按受管流程更新。
   - 版本保持 **0.5.0**。

5. **测试**
   - CASE 从 **CASE-247** 起；重写 merge/init 中依赖 fake `github`/`gh` PATH 的用例为 mock HTTP；覆盖缺 token、API 失败保留 local、成功合入+close、文档关键字、package-smoke 模块列表（`platform-api` 替换 `platform-cli`）。

### 失败处理

- 缺 token / origin 不可解析：init 警告 + next；merge 硬失败（明确错误码）。
- API 非 2xx：不泄露 Authorization；错误信息截断平台返回 body。
- 推送失败：不回滚本地 init 提交。

### 取舍

- **不用平台 CLI**：满足用户「默认只用 API」与 Windows 无 gh 场景。
- **推送优先 API、必要时 tokenized git push**：纯 ref 更新要求对象已在远端；完整 smart-HTTP 重实现成本高。选则可测的 Git Data/Commits 或文档化的 tokenized push。
- **可注入 fetch**：单测不联网。

### 影响与风险

- 影响：`src/init-baseline.ts`、`src/pr.ts`、新建 `platform-api.ts`、删除/停用 `platform-cli.ts`、`scripts/package-smoke.mjs`、相关 test、resources 与 `.tiller` 镜像、`decisions.md`。
- 风险：GHES/自建 GitLab URL 解析边界——用 remote URL host；token 权限不足时错误需可读。
- 安全：token 仅 env；不写受管文件。

### 验证入口

- 定向：`node --test test/merge.test.mjs test/init-baseline.test.mjs`（及新建 platform-api 测）。
- 全量：`npm run build && npm run lint && npm run typecheck && npm test && npm run test:package`

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-26T08:41:50.904Z | ef1a2de38ded | 做：默认只用 API，不再依赖 CLI；其他git操作也一样，都通过api调用执行 |
| 设计 | boon yu | 2026-10-26T08:42:33.430Z | ef1a2de38ded | 做：默认只用 API；其他git操作也一样都通过api调用执行 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"57599e5efe3b532e8af6101a52bc3d3fcf45e6260e5f826c2837521effc07e90","commit":"ef1a2de38ded0b4ec827b5b76a174ee1fa3b30a9","by":"boon yu","quote":"做：默认只用 API，不再依赖 CLI；其他git操作也一样，都通过api调用执行","at":"2026-10-26T08:41:50.904Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"c48dde513f2cab64d0920c535cde20b621ab7938327b3c1dc71b5f54479debfc","commit":"ef1a2de38ded0b4ec827b5b76a174ee1fa3b30a9","by":"boon yu","quote":"做：默认只用 API；其他git操作也一样都通过api调用执行","at":"2026-10-26T08:42:33.430Z"} -->

## 验证

尚无验证。

## 自检

- [x] 需求确认有效
- [ ] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [ ] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [ ] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 过程卫生：需求、设计确认提交 ef1a2de38ded 后，工作区仍有未提交业务改动：resources/rules/activities/delivery.md、resources/rules/core.md、resources/usage.md、src/cli.ts、src/init-baseline.ts、src/platform-api.ts、src/platform-cli.ts、src/pr.ts 等 14 项。请先提交或移出本任务。
- AC-1 尚无验证。
- AC-2 尚无验证。
- AC-3 尚无验证。
- AC-4 尚无验证。
- 改动超出范围：scripts/package-smoke.mjs
- 交付范围存在未提交改动：.tiller/cases/modules/initialization/behavior.md、.tiller/cases/modules/standards/interface.md、.tiller/cases/modules/workflow/behavior.md、.tiller/cases/modules/workflow/interface.md、.tiller/project.json、.tiller/rules/activities/delivery.md、.tiller/rules/core.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/initialization/design.md、.tiller/usage.md、README.md、resources/rules/activities/delivery.md、resources/rules/core.md、resources/usage.md、src/cli.ts、src/init-baseline.ts、src/platform-api.ts、src/platform-cli.ts、src/pr.ts、test/case-redesign.test.mjs、test/init-baseline.test.mjs、test/merge.test.mjs、test/platform-api-mock.mjs、test/review-release.test.mjs、test/rules.test.mjs

提示：
- 90 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 64 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 31 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 40 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 115 条用例及经过它的场景 CASE-055, CASE-001。
- 修改的测试文件移除了 13 个测试用例（请确认对应功能已删除；详情见 Git diff）。
