---
id: QB-20260819-terminal-bottom-spacing-and-scrollbar
status: archived
archived: 2026-09-02
legacy: true
---
# 终端底部留白与滚动条细化计划

Status: Complete (2026-08-19)

## Goal

Plan Level: Tiny。增加底部安全距离并把滚动条收窄为品牌青色细条。

## Affected Files

- `src/app/app.css`
- `src/app/appStyles.test.ts`
- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- 本 task spec 与 plan

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 光标完整可见 | CSS 断言 `padding-bottom:6px`，桌面截图检查。 |
| 3px 青色滚动条 | xterm options 测试、DOM 宽度和滑块计算色检查。 |
| 无回归 | 聚焦 Vitest、`pnpm check`、`git diff --check`。 |

## Verification

先更新现有参数化测试确认旧值失败，再修改实现并完成自动化和桌面视觉检查。
