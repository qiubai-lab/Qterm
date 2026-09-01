---
id: QB-20260901-git-change-preview-synchronized-diff
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 更改预览同步差异视图计划

## Implementation Tasks

- [x] 添加无自动换行、单一纵向滚动、独立水平滚动和 spacer 纹理的失败回归断言。
- [x] 调整比较扩展与滚动/占位样式。
- [x] 使用真实浏览器验证滚动所有权、对齐锚点和独立水平滚动。
- [x] 运行聚焦测试、静态检查和仓库质量检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001、AC-003 | 样式契约测试；真实浏览器滚动范围与 `scrollTop`/`scrollLeft` 指标 |
| AC-002 | 组件测试无 `.cm-lineWrapping`；真实浏览器第 90 行锚点 Y 坐标差为 0 |
| AC-004 | 样式契约测试与真实浏览器确认 `.cm-mergeSpacer` 中性斜纹 |
| AC-005 | 相关 Vitest、`pnpm check`、`git diff --check` |

