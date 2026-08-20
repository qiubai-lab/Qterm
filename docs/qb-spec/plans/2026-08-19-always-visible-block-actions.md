# 窗口操作图标始终可见 Tiny Plan

Status: Complete (2026-08-19)。聚焦测试与完整前端质量闸口均通过。

## Goal

让终端和文件窗口共享的右上角操作区始终可见。

## Affected Files

- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Acceptance To Verification

- 默认可见：样式测试断言 `.block-actions` 包含 `opacity:1`。
- 现有交互无回归：运行聚焦样式测试和 `pnpm check`。

## Verification

先更新样式测试确认旧规则失败，再修改共享 CSS，并执行完整前端质量闸口。
