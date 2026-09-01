---
id: QB-20260819-split-terminal-bottom-spacing
status: archived
archived: 2026-09-02
legacy: true
---
# 上下分割终端底部留白修复计划

Status: Complete (2026-08-19)。已将留白移至 FitAddon 可识别的 `.xterm` 层，并统一为 2px。

## Goal

Plan Level: Tiny。让 FitAddon 正确计入终端内边距，并把底部留白统一为 2px。

## Affected Files

- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| FitAddon 可识别留白 | 样式测试断言 padding 位于 `.terminal-surface>.xterm`，并且 `.xterm` 使用 `height:100%`。 |
| 底部留白为 2px | 样式测试断言 `padding:4px 3px 2px 7px`。 |
| 无前端回归 | 聚焦 Vitest、`pnpm check`、`git diff --check`。 |

## Verification

先更新现有样式测试并确认旧实现失败，再修改 CSS，运行聚焦测试和完整前端质量闸口。
