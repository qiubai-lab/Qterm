---
id: QB-20260823-theme-surface-completion
status: archived
archived: 2026-09-02
legacy: true
reconstructed_from: plan.md
---

# Theme Surface Completion

## Goal

完成 Light 主题在 Network 设置、终端锁定、跳板机选择和文件预览等遗留深色界面上的适配，同时保持 Dark 主题的既有视觉不变。

## Scope

- 将网络模式卡片、规则流预览和暴露提示迁移到语义主题角色。
- 将终端锁定选择卡、解锁身份区域和跳板机选择列表迁移到语义主题角色。
- 将文件预览工具栏、操作、标签和 Markdown 内容迁移到语义主题角色。
- 覆盖相关 hover、focus、selected、disabled、warning、danger 和 scrollbar 状态。
- 增加主题回归断言，防止这些界面重新依赖固定暗色值。

## Acceptance

- Light 主题下不再出现上述遗留深色孤岛。
- 主次文字和交互状态在 Light 下可辨识，Dark 继续使用既有语义 token 家族。
- feature 样式消费语义变量，不通过 Light-only 覆盖建立新的长期边界。
- 聚焦主题测试和完整前端质量门通过。

## Archive Note

原 legacy 文档集中只保留了实施计划，没有独立 spec 或最终验证摘要。本 spec 依据原 `plan.md` 的 Goal、Scope 与 Acceptance 重建，仅用于统一归档；不补写或声称不存在的验证证据。该证据缺口随用户于 2026-09-02 明确要求归档旧版 qb-spec 文档一并接受。

