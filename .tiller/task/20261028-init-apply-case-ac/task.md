# init预检与apply及用例关联specs AC

<!-- tiller-task:v1 {"version":1,"id":"20261028-init-apply-case-ac","type":"feature","size":"standard","created":"2026-10-28T14:20:23.314Z","base":"7c2816e4b164366564f2c7a98d5a0d43f3d816d7","scope":["src","test",".tiller/specs",".tiller/rules",".tiller/cases",".tiller/usage.md","resources"],"format":"structured","slug":"init-apply-case-ac","summary":"预检后可选apply；CASE挂specs AC-n；tree digest按Git归一化忽略CRLF"} -->

## 需求

### 使用场景

- 用户在空仓或待初始化工程执行 `tiller init`：若未设置平台 token 或 `origin` 不是可解析的 GitHub/GitLab 地址，应立刻得知如何补齐，而不是先得到半成品 worktree。
- 用户希望一条命令完成「初始化并落到本地默认分支」：`tiller init --apply`。
- 维护者登记 CASE：关联 AC 指向稳定 specs 文件中的路径作用域 `AC-n`（可多个），而不是任务 id，也不是固定写「无」。
- Windows 上受管文本常为工作区 CRLF、Git blob LF；`treeDigest` 读盘原文与 `treeDigestAtCommit`（`git show`）不一致，导致 verify 后仅因换行被判过期，形成假回环。

### 目标

1. `tiller init`（含 `--apply`）在一切写盘、建分支、提交之前完成环境预检；不过关则非零退出并给出可执行指引。
2. 提供显式 `--apply`：预检通过后推送、开 PR/MR、API squash 合入、close 清理，并快进 primary 默认分支工作区。
3. `case add` 将「关联 AC」写为需求 specs 中的 `AC-n`（可多个）；拒绝 `任务#AC`；新用例不再固定写「无」。
4. 验证/验收用的代码树摘要在 Windows CRLF 检出下与提交 blob 一致，不得仅因换行误报过期。
4. 历史「无」与 `task#AC` 仍可读；受管文档与测试同步；版本保持 0.5.0。

### 业务范围

- 做：
  - init 预检：平台 token（GitHub：`GITHUB_TOKEN`/`GH_TOKEN`；GitLab：`GITLAB_TOKEN`/`GL_TOKEN`）与可解析 `origin`；失败不创建 `.tiller/local/<init-id>/`、不建 `chore/tiller-init`、不提交。
  - `tiller init --apply`：在默认 init 成功开出 PR/MR 后，经平台 API squash、写入合入证明/close、对 primary 执行默认分支快进（`pull --ff-only` 或等价）；任一步失败停在该步并提示续跑命令。
  - `case add`：要求关联 specs `AC-n`（通过 CLI 参数写入，校验其存在于所挂「需求」specs 文件的验收条件中）；正文写 `- 关联 AC：AC-1, AC-2` 这类形式。
  - tree digest：工作区与 commit 两侧统一按 **Git 归一化内容**（与 blob/`git hash-object --path` 一致）计算；文本 CRLF/LF 差异不改变摘要；不改业务语义。
  - 更新 initialization/verification/workflow 相关 specs、CASE、rules、usage 与测试。
- 不做：
  - 不默认自动合入（无 `--apply` 仍只开 PR、人工合入）。
  - 不恢复 `任务#AC` 为新写入合法值。
  - 不批量改写全部历史 CASE 正文（历史可读即可）。
  - 不升版本号。
- 假设与待确认：机制已由 boon yu 确认（预检先于一切操作；开关名 `--apply`；CASE 挂 specs `AC-n`；CRLF digest 归一并入本包）。扩展后需 ChukiChen 再确认需求与设计。

### 关键行为

- 缺 token / origin 不可解析：`init`/`init --apply` 立即失败；提示设置哪个变量与检查 origin；无本次 init 目录/分支。
- 预检通过且无 `--apply`：行为与现网一致（worktree + PR，pending 等待合入）。
- `--apply` 成功：远端已合入，local close 完成，primary 工作区可见受管 `.tiller/` 等文件，`status` 显示已初始化且基线 effective merged。
- `--apply` 中途失败：不声称完成；返回已完成步骤与下一步命令（如手动 merge/close/pull）。
- `case add --criterion AC-1`（可重复）：用例「关联 AC」为 specs AC 列表；误传 `任务#AC-n` 被拒绝；不再默认写「无」。
- 工作区文本为 CRLF、索引/提交为 LF 且内容无实质差异：`verify` 记录的 tree 与随后 `check`/`accept`（含按 acceptance 提交复查）一致，不报验证过期。
- 解析仍接受历史「无」与 `task#AC`（warning 策略可保留，不阻断）。

### 异常与边界

- 无 Git HEAD：保持现有跳过/提示语义，但若选择了需要远端的路径仍应提示 token/origin 要求与当前限制。
- `--apply` 时平台合入权限不足或冲突：失败并保留 worktree/PR，不假绿 close。
- specs 文件中不存在所声明 `AC-n`：`case add` 失败。

### 验收条件

- AC-1: init在创建worktree/分支/提交前完成预检；缺token或origin不可解析则非零退出并给出设置指引，磁盘无本次init产物
- AC-2: tiller init --apply在预检通过后推送、开PR/MR、API squash合入、close清理，并对primary默认分支快进；任一步失败停在该步并提示续跑，不假成功
- AC-3: case add将关联AC写为需求specs文件中的AC-n（可多个）；拒绝任务#AC写法；新用例不再固定写无
- AC-4: 历史关联AC为无或task#AC仍可读；受管rules/usage/CASE与测试同步；版本保持0.5.0
- AC-5: 工作区受管文本为CRLF、提交为LF且无实质内容差异时，verify/check/accept的tree摘要一致，不得仅因换行误报验证过期

## 设计

### 方案

1. **预检入口**：在 `createInitBaseline` / init 主路径最前增加 `assertInitEnvironment`（或等价）：解析 platform + `platformToken` + `resolvePlatformRepository`；失败 `fail` 带 `tokenGuidance`，且确保尚未 `worktree add`。
2. **`--apply`**：cli 解析布尔旗标；init 在成功拿到 `prUrl`/`prNumber` 后调用既有 merge API（squash）→ 既有 close/init 清理路径 → primary `git fetch` + 快进默认分支到合入 tip。复用 expected-head 证明，不走松散标题匹配。
3. **CASE AC**：`case add` 恢复/调整 `--criterion` 语义为 **specs 作用域 `AC-n`**（禁止含 `#` 的任务引用）；写入前读取「需求」指向的 specs markdown，确认存在对应 `- AC-n:`；正文 `- 关联 AC：AC-1, AC-2`。解析器：新值优先认 `AC-\d+` 列表；历史「无」与 `task#AC` 仍可读。
4. **文档**：usage/rules/decisions/initialization&verification specs 与 CASE 同步；去掉「新用例固定写无」表述。
4. **tree digest 换行归一**：`treeDigest` 禁止直接 `readFile` 原文入摘要。在 Git 仓库内对每个 scope 文件用与 blob 一致的内容哈希（优先 `git hash-object --path=<rel> -- <abs>`，或等价：先按 LF 归一文本再与 `git show`/`ls-tree` blob 对齐）；`treeDigestAtCommit` 用同一规则（可直接用 `ls-tree` blob oid）。二进制按 Git 判定不改字节。覆盖所有依赖 tree 的路径：verify 记录、check 过期判断、acceptance 提交复查、preExisting 等。


### 失败处理

- 预检失败：零写盘副作用。
- apply 失败：保留已创建远端 PR/本机 worktree（若已创建），返回明确续跑（`tiller merge`/`close`/`git pull`）。
- case add 校验失败：不写用例文件。

### 取舍

- 开关用短名 `--apply`，不用 `--auto-merge`。
- CASE 挂 specs `AC-n` 而非删字段，保留可追踪的验收锚点；覆盖主路径仍以 verify 图为准，关联字段作设计期声明。
- digest 对齐 Git blob/clean，而不是改用户 `core.autocrlf` 或强制改写工作区换行；不把「假过期」推给用户手动 checkout。

### 影响与风险

- 破坏：依赖「新用例必为无」的测试与文案需改。
- 风险：`--apply` 误用跳过人工审阅——仅显式旗标启用；文档标明。

### 验证入口

- mock：缺 token 预检；case add 写 AC-n / 拒 task#AC；历史解析。
- mock/单元：同一相对路径 CRLF 工作区 vs LF blob → treeDigest 与 treeDigestAtCommit 相等；实质改字节仍不等。
- 包测/单测覆盖 apply 成功路径可用 mock 平台。
- `npm test` 全量；版本 0.5.0。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-28T14:27:58.670Z | a5f998a70b45 | 并入 CRLF/LF tree digest 归一（AC-5） |
| 设计 | ChukiChen | 2026-10-28T14:27:58.819Z | 860438196f51 | digest 对齐 Git blob/hash-object；不改用户 autocrlf |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"f9815df6897d3c43a9c45ac3768bc4032007a50df8f4750426f5833e7d5f8016","commit":"a5f998a70b45cf5bcfdc5f8b3696f00d14af2c86","by":"ChukiChen","quote":"并入 CRLF/LF tree digest 归一（AC-5）","at":"2026-10-28T14:27:58.670Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"0545b9787bef660b4c8b55d57c818cd36536ea930950ca7e5d459534e009fe9b","commit":"860438196f515fc75ab0784f9fd6200a03f65baf","by":"ChukiChen","quote":"digest 对齐 Git blob/hash-object；不改用户 autocrlf","at":"2026-10-28T14:27:58.819Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
