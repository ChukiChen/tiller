# 任务规格溢出门禁

## 使用场景

任务引用 `.tiller/specs/` 中的稳定需求时，需求或设计可能写出 specs 尚未覆盖的新行为、约束或验收点。若只留在 `task.md`，后续 check、accept 和合入后的共享记录会看到一套无法追溯的“私货”验收标准。

## 目标

以任务引用的 specs 路径和其中的普通 `AC-n` 为唯一真相源；新增或变更的行为先回写全局 specs（必要时同步 cases/rules），经确认人重新确认后再继续实现与验收。

## 业务范围

- 做：在需求确认、设计确认、check 和 accept 检测任务验收点是否可挂载到引用 specs；给出可执行回写路径与重新确认指引。
- 做：覆盖缺失 specs、不存在的 AC、无法挂载的任务 AC 与正文差异。
- 不做：自动改写全局 specs，或根据语义猜测任务是否“等价覆盖”。
- 不做：追溯改写历史已验收记录。

## 关键行为

1. 任务通过 `--requirement-file` 或正文“需求来源”标注引用 specs 时，收集引用文件并解析其中的 `AC-n`。
2. 每个任务验收条件必须按同一 `AC-n` 挂载到至少一个引用 specs，且规范化正文一致。
3. 设计或正文显式引用的 `AC-n` 也必须存在。
4. 失败信息列出缺失路径或未挂载的 AC，并提示先回写 specs、必要时同步 cases/rules，再由确认人确认 requirements/design。
5. 回写后重新 confirm；check 与 accept 复用同一判定。

## 异常与边界

- 引用 specs 不存在：阻断并给出路径。
- 任务 AC 不存在于引用 specs，或正文与 specs 不一致：阻断，不静默通过。
- 校验只机械核对路径与 AC-n 正文；需要语义判断的新增约束仍由确认人复核。
- 已验收任务按 acceptance 证据复核，不因后续 specs 变化追溯失败；重新验收仍按当前树重查。

## 验收条件

- AC-1: 任务需求或设计相对引用 specs 出现未覆盖新增行为或约束时，确认 requirements/design、check 与 accept 阻断，并提示回写全局 specs（必要时同步 cases/rules）后经确认人再继续
- AC-2: 真相源为任务引用的 specs 路径与其中的 AC-n；引用文件缺失、AC 不存在、任务验收点无法挂载或正文不一致时失败并给出可执行指引
- AC-3: 门禁覆盖 confirm、check、accept 并由 CASE 与测试锁定；已验收历史按 acceptance 证据复核，不追溯改写旧确认
- AC-4: 受管 specs、rules、usage、CASE 与测试同步；版本保持 0.5.0，不改变 PATH 单 tiller、合入证明和禁止新写 task#AC 的既有约束
