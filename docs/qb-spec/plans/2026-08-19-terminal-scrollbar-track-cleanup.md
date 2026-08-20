# 终端滚动条白线清理计划

Status: Complete (2026-08-19)

## Goal

Plan Level: Tiny。隐藏空 overview ruler 并降低滑块亮度。

## Affected Files

- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 无常驻白线 | CSS 回归断言与桌面截图。 |
| 亮度降低 | xterm theme 参数断言和计算样式。 |
| 无回归 | 聚焦测试、`pnpm check`、`git diff --check`。 |

## Verification

先更新参数测试确认旧实现失败，再修改主题和画布可见性并进行视觉复验。
