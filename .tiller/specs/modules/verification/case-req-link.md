# 用例锚定稳定需求（取消 task#AC，AC 进 specs）

## 使用场景

维护 tiller 的人与执行 AI。用例曾强制「关联 AC：`<任务>#AC-n`」，且 `--requirement-file` 常指向会被 close 删除的 `.tiller/local/…-req.md`。正确模型：稳定 AC 与需求在 `.tiller/specs/...`；任务只引用；用例挂 specs；覆盖靠 verify。

## 目标

验收条件以普通 `AC-n` 写在 specs，由文件路径区分；任务复用同一套正文；用例挂 specs 且关联 AC 为“无”；requirement-file 仅 specs；多行保留；历史兼容；版本 0.5.0。

## 业务范围

- 做：requirement-file 门禁（拒绝 local）、specs 稳定条件正文、CASE-268/269 与测试、文档/decisions。
- 不做：升版本；批量改历史关联 AC。

## 关键行为

1. `--requirement-file` 非 `.tiller/specs/` 失败并提示迁入 specs。
2. 指向 specs 时保留多行且需求来源为该路径。
3. 验收条件以本页和模块 requirements 的 `AC-n` 正文为准。

## 异常与边界

历史 task#AC 可读；已验收历史不因变严失败。

## 验收条件

- AC-1: `--requirement-file` 只接受 `.tiller/specs/` 下相对路径，非 specs、越界、空文件和符号链接明确失败
- AC-2: 从 specs 接入时保留多行/结构化正文，并写“需求来源”路径
- AC-3: 新用例的“需求”挂 specs，“关联 AC”固定写“无”，不写 `taskId#AC`
- AC-4: AC 覆盖由任务引用 specs 的 `AC-n` 与 `verify` 的 AC→测试→CASE 记录承担，不要求用例回指任务
- AC-5: 历史 `task#AC` 仅保持可读并提示迁移，已验收历史不因新规则变严而失败
