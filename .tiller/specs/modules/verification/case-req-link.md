# 用例锚定稳定需求（取消 task#AC，AC 进 specs）

## 使用场景

维护 tiller 的人与执行 AI。用例曾强制「关联 AC：`<任务>#AC-n`」，且 `--requirement-file` 常指向会被 close 删除的 `.tiller/local/…-req.md`。正确模型：稳定 AC 与需求在 `.tiller/specs/...`；任务只引用；用例挂 specs；覆盖靠 verify。

## 目标

稳定 AC 在 specs（VER-CASE-REQ-*、FLOW-SPEC-AC-*）；任务引用；requirement-file 仅 specs；多行保留；历史兼容；版本 0.5.0。

## 业务范围

- 做：requirement-file 门禁（拒绝 local）、specs 稳定条件正文、CASE-268/269 与测试、文档/decisions。
- 不做：升版本；批量改历史关联 AC。

## 关键行为

1. `--requirement-file` 非 `.tiller/specs/` 失败并提示迁入 specs。
2. 指向 specs 时保留多行且需求来源为该路径。
3. 稳定条件可在模块 requirements 与本页查阅。

## 异常与边界

历史 task#AC 可读；已验收历史不因变严失败。

## 验收条件（稳定）

- VER-CASE-REQ-1 / VER-CASE-REQ-2 / VER-CASE-REQ-3
- FLOW-SPEC-AC-1 / FLOW-SPEC-AC-2
