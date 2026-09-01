---
id: QB-20260823-active-block-radius-alignment
status: archived
archived: 2026-09-02
legacy: true
---
# Active Block Radius Alignment Plan

## Requirement

修复工作区内部窗口与选中高亮层圆角不一致造成的暗色缺口。

## Scope

只统一共享圆角值并补充样式契约；不改变选中逻辑、动画、布局或主题。

## Affected Files

- `src/workspace/workspace.css`
- `src/terminal/terminalChrome.css`
- `src/app/appStyles.test.ts`

## Design

由 `.workspace-canvas` 持有局部 `--workspace-block-radius: 9px`，`.terminal-block` 与 `.active-block-indicator` 均以该变量绘制外轮廓。变量限定在工作区，避免扩散为无关的全局形状 token。

## Acceptance To Verification

- 相同圆角来源：样式测试断言画布定义变量，窗口与高亮层均引用该变量。
- 几何与动画不回归：保留现有 indicator bounds 行为测试和 reduced-motion 样式断言。
- 全局完整性：运行 `pnpm check`。

## Test / Verification

1. 运行 `pnpm vitest run src/app/appStyles.test.ts src/workspace/LayoutView.test.tsx`。
2. 运行 `pnpm check`。

## Documentation Updates

本 task spec 与 plan 已记录修复边界；无需更新长期项目上下文或 Directory Map。
