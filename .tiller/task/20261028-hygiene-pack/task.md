# 完整验缺陷整包收口

<!-- tiller-task:v1 {"version":1,"id":"20261028-hygiene-pack","type":"feature","size":"standard","created":"2026-10-28T02:13:08.746Z","base":"7e83614755682ebac68c76386ff69547e8c00068","scope":["src","test",".tiller/specs",".tiller/cases"],"format":"structured","summary":"init基线跨clone、abandon闭环、PR幂等与导入保真"} -->

## 需求

### 使用场景

- 协作者在 init PR 已 squash 合入且 `chore/tiller-init` 已删除后，从干净 clone 开始第一个任务。
- 任务已验收但远程 PR 被拒/长期无法合入，需要仅用 CLI 放弃并留下可共享事实。
- `tiller pr` 在平台已创建但响应丢失后重试，不得再造同树 PR。
- 从稳定 specs 用 `--requirement-file` 开任务，任务记录保留关键行为结构；全局规格 PR 标题语义正确；init/check 少噪音。

### 目标

一次方案收口完整验（2026-10-28）暴露的生命周期与交付摩擦，禁止按摩擦逐条小补。交付结果须满足下列验收条件。

### 业务范围

- 做：init 基线跨 clone 可证明且 close 不假成功；accepted 未合入 abandon 闭环；PR 创建幂等；requirement-file 结构保真；全局 specs PR 标题 scope；init 提交与 check 降噪；同步 specs/CASE/测试。
- 不做：恢复 run.cjs/runtime bind/closed/旧三棵树；削弱 tip 合入证明；本包不合入后 wipe 狗粮。
- 假设：仍为 0.5.0；平台操作用 token API；git 做 commit/push。

### 关键行为

- AC-1：fresh clone 在 init 已合入且分支已删时 doctor/start 放行；close init-id 证明失败不假成功；跟踪元信息含 init PR head
- AC-2：accepted 未合入可 CLI abandon 并自动持久化提交放弃事件后再清理；无法持久化则不清理
- AC-3：PR 创建对同一 head branch+SHA 幂等：失败重试复用已有 open PR，不产生同树重复 PR
- AC-4：requirement-file 保留嵌套关键行为结构；全局 specs PR 标题 scope 不误推模块；init 无双同名提交或第二提交可区分；check 非阻断提示去重

### 异常与边界

- 证明失败、无法持久化、平台不可达时返回稳定错误码，不静默降级、不假成功。
- tip 合入证明行为保持：历史同名已合入 PR 无 tip 匹配不得清理。

### 验收条件

- AC-1: fresh clone 在 init 已合入且分支已删时 doctor/start 放行；close init-id 证明失败不假成功；跟踪元信息含 init PR head
- AC-2: accepted 未合入可 CLI abandon 并自动持久化提交放弃事件后再清理；无法持久化则不清理
- AC-3: PR 创建对同一 head branch+SHA 幂等：失败重试复用已有 open PR，不产生同树重复 PR
- AC-4: requirement-file 保留嵌套关键行为结构；全局 specs PR 标题 scope 不误推模块；init 无双同名提交或第二提交可区分；check 非阻断提示去重

## 设计

### 方案

统一把「平台合入/创建结果」当作可重建事实，本机标记只做加速缓存：

1. **Init 基线证明（AC-1）**  
   - 在跟踪的 `project.json`（或 init 流程写入的等价字段）记录 `initBaseline.head`（squash 前 PR tip）及 branch/平台引用。  
   - `proveInitBaselineMerged`：祖先命中 → 本地 merged 标记 → **平台按 branch+head 查已合入 PR**；不得因本地 `chore/tiller-init` 已删而短路失败。  
   - `close <init-id>`：仅当 prove 成功（或显式清理模式）才返回成功；`merged:false` 必须失败并保留事实。  
   - fresh clone 无 local marker 时，仅凭 main 祖先或平台证明即可放行 doctor/start。

2. **Abandon 闭环（AC-2）**  
   - 允许 `close --abandon` 作用于 accepted（或新增等价命令），原子序列：确保 primary 可写任务记录 → 写放弃事件 → **自动 commit** → 再清理 worktree/分支。  
   - `ABANDON_NOT_PERSISTABLE` 时整单失败、零清理。不要求用户手工复制。

3. **PR 幂等（AC-3）**  
   - create 前与 create 失败（含 fetch failed）后：按 `head.ref + head.sha` 查 open PR；命中则返回已有编号/URL。  
   - 单测覆盖「平台已建、响应丢失、重试复用」。

4. **导入与呈现 / 降噪（AC-4）**  
   - requirement-file 解析保留 `###` 关键行为子树到任务记录。  
   - 全局 specs 任务标题 scope：优先 `specs`/`global`，不因正文提到模块名误推。  
   - init：基线元信息写入与骨架提交收敛，避免两个完全同名提交（第二提交须可区分或合并）。  
   - check：同类非阻断提示去重合并。

5. **CASE / invariants 先行**  
   - 先在 `.tiller/cases` 与 hygiene invariants 落上述边界，再改代码与测试；禁止只改测不改不变式。

### 失败处理

- 证明/持久化/平台查询失败：稳定错误码，不清理、不写假成功。  
- PR 查询失败但 create 已可能落库：优先查重再报错，避免双开。

### 取舍

- 选「跟踪元信息 + 平台证明」而非仅依赖 `.tiller/local/*` 缓存，因后者无法跨 clone。  
- abandon 自动 commit 任务记录，换取可共享终止事实；仍禁止在无法持久化时清理。  
- 不做大范围状态机重写；在现有 flow/init-baseline/pr 路径上收敛不变量。

### 影响与风险

- 影响：`init-baseline`、`flow` close/abandon、`pr` create、requirement 导入、check 提示、init 提交序列、specs/CASE。  
- 风险：旧仓库 project.json 缺 head 字段——证明路径需兼容「仅有旧 commit 字段时尽量用平台同分支已合入 PR / 祖先启发」，并在新 init 写入 head。

### 验证入口

- 单元/集成：fresh-clone init baseline、close init 假成功回归、abandon accepted、PR create 幂等、requirement-file `###`、标题 scope、init 提交标题。  
- 全量 `npm test` + `test:package`；本包开 PR 不合入。


### 方案

<!-- 写关键做法、接口与数据流；引用已有规格，不复制全文。 -->

### 失败处理

<!-- 写失败、回滚与恢复方式。 -->

### 取舍

<!-- 写备选方案与选择理由；没有备选时说明原因。 -->

### 影响与风险

<!-- 写受影响范围、兼容性和风险缓解。 -->

### 验证入口

<!-- 写可重跑的短测试入口；不塞长命令菜谱。 -->

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | boon yu | 2026-10-28T02:13:26.600Z | 7e8361475568 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"f764b7428f820b70677c56fe7969aa8e77e214b7fe1d750bf9dfc876fb74a25c","commit":"7e83614755682ebac68c76386ff69547e8c00068","by":"boon yu","quote":"","at":"2026-10-28T02:13:26.600Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
