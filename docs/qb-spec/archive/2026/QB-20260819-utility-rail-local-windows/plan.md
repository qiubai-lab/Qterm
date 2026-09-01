---
id: QB-20260819-utility-rail-local-windows
status: archived
archived: 2026-09-02
legacy: true
---
# Utility Rail Local Windows Standard Plan

Status: completed on 2026-08-19. 已交付本地文件/终端快捷入口、五项文字标签与对应自动化保护。

## Requirement

将右侧工具栏改为带弱化文字标签的五入口工具栏，且文件和终端入口只创建本地窗口。

## Scope

包含工具栏行为、标签与样式及对应回归测试；不包含文件浏览、终端会话、连接弹窗和持久化结构调整。

## Affected Files

- `src/workspace/WorkspaceShell.tsx`
- `src/workspace/fileWindow.ts`
- `src/workspace/fileWindow.test.ts`
- `src/workspace/WorkspaceShell.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- `src/app/App.test.tsx`

## Design

- `openFileWindowAction` 只依赖 workspace，固定以活动块为锚点创建本地 `files` leaf。
- 新终端按钮 dispatch 既有 `splitBlock` action；默认 `createTerminalNode()` 保证本地 profile。
- 统一 RailButton 呈现图标与 `rail-button-label`，保留原 aria 状态。
- 工具栏适度加宽，采用小字号、弱颜色和紧凑纵向间距。

## Acceptance To Verification

- 本地文件固定参数：更新 `fileWindow.test.ts`，覆盖活动 SSH 终端与活动文件块。
- 本地终端和五个入口：更新 `WorkspaceShell.test.tsx`，断言按钮及 dispatch。
- 紧凑弱化标签：更新 `appStyles.test.ts`，断言 rail 宽度、布局和标签字号/颜色。

## Test / Verification

1. 先运行相关 Vitest 文件确认测试保护。
2. 实现后重跑相关测试。
3. 运行 `pnpm check` 完成 lint、全部 Vitest、类型检查和生产构建。

## Documentation Updates

- 新增本 task spec 与 Standard plan。
- 无长期 context 或 Directory Map 更新需要。
