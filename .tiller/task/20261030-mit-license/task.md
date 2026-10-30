# 为 tiller 增加 MIT 许可证

<!-- tiller-task:v1 {"version":1,"id":"20261030-mit-license","type":"documentation","size":"small","created":"2026-10-30T15:42:05.580Z","base":"eab0dfa10058bd13041e82d2c37d01cccf236108","scope":["LICENSE","package.json","README.md","test/rules.test.mjs",".tiller/cases/modules/workflow/behavior.md"],"format":"structured","summary":"新增标准 MIT LICENSE，并同步包元信息与 README 链接"} -->

## 需求

### 使用场景

- 仓库使用者、贡献者和 npm 包使用者需要从根目录明确获知 tiller 以 MIT 许可证授权。
- 维护者需要在包元信息、README 与许可证正文之间保持一致，避免分发时出现许可证信息缺失或冲突。
- 本次交付经维护者授权自动创建 PR 并立即 squash 合入，不需要再次确认合入。

### 目标

1. 在仓库根目录新增完整、标准的 MIT LICENSE，版权持有人为 ChukiChen，年份为 2026。
2. 在 package.json 中声明 `"license": "MIT"`。
3. 在 README 末尾以一行链接指向 LICENSE，保持快速开始简短。
4. 增加许可证发布契约回归断言，完成验证后通过 PR squash 合入。

<!-- 引用已有 specs，不复制规格全文。 -->

### 业务范围

- 做：新增 LICENSE；修改 package.json 的 license 字段；在 README 末尾增加一行许可证链接；在现有发布契约测试与 CASE-314 中补充许可证断言。
- 不做：不修改 CLI、src、resources、工作流规则、构建脚本、依赖版本、包版本、package-lock 或其他业务行为；不清理既有无关 worktree 或分支。
- 假设：用户已选择 MIT，授权使用 ChukiChen/2026，并明确授权创建 PR 后立即 squash 合入。
- 基线：`eab0dfa10058bd13041e82d2c37d01cccf236108` 为本任务起点。

### 关键行为

<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->
- AC-1：LICENSE 包含完整标准 MIT 正文，版权行为 Copyright (c) 2026 ChukiChen
- AC-2：package.json 的 license 字段为 MIT
- AC-3：README 保持简短并包含 License: MIT 链接到 LICENSE
- AC-4：改动仅限许可证文件、包元信息、README、许可证回归断言及对应用例，不修改流程代码

### 异常与边界

- LICENSE 必须是完整标准 MIT 正文，不得使用占位符、附加限制或与 package.json 冲突的许可证。
- README 只增加一行链接，不扩展快速开始或重复许可证全文。
- 不因许可证变更调整版本号、发布包内容规则或流程实现。
- 任一验收条件失败、验证无法执行或 PR 未确认合入时不得声明交付完成。

### 验收条件

- AC-1: LICENSE 包含完整标准 MIT 正文，版权行为 Copyright (c) 2026 ChukiChen
- AC-2: package.json 的 license 字段为 MIT
- AC-3: README 保持简短并包含 License: MIT 链接到 LICENSE
- AC-4: 改动仅限许可证文件、包元信息、README、许可证回归断言及对应用例，不修改流程代码

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-30T15:42:21.200Z | eab0dfa10058 | 选 MIT；改完自动合并，不必再问。 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"5a2c1b0a97740a84dbec2066bd7c660050f3241fb221858615c9f5554269386f","commit":"eab0dfa10058bd13041e82d2c37d01cccf236108","by":"ChukiChen","quote":"选 MIT；改完自动合并，不必再问。","at":"2026-10-30T15:42:21.200Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
