---
id: QB-20260819-connection-tabs-motion-and-scroll
status: archived
archived: 2026-09-02
legacy: true
---
# 连接配置 Tab 动效与滚动边界 Standard Plan

Status: Complete (2026-08-19)。聚焦测试、完整前端质量闸口、本地视觉检查与差异检查均通过。

## Requirement

提升连接配置 Tab 的视觉层次与切换反馈，并修复私钥扫描结果造成的编辑区外层滚动。

## Scope

仅调整 `ConnectionDialog` 的 Tab 标记、局部切换状态和相关 CSS；保持现有配置、认证和私钥业务行为不变。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Design

- 在 Tab 容器中使用一个持久的绝对定位承载面，通过 `data-active` 切换水平位置。
- 点击时立即更新内容，同时记录前进/后退方向；新面板只动画 `transform` 和 `opacity`。
- 编辑滚动容器改为不可滚动的纵向 Flex 容器；面板获得剩余高度。
- 私钥认证面板在存在扫描结果时使用显式 Grid 行分配，表格框架占据 `minmax(0,1fr)` 并自行滚动。
- 减少动态效果时关闭滑块位移过渡与内容横移。

## Acceptance To Verification

- Tab 视觉和动效：样式测试断言持久滑块、方向动画和标签 transition。
- 快速切换：组件测试连续点击后断言最终 Tab 和 panel。
- 单一滚动区：样式测试断言外层 `overflow:hidden`、结果面板剩余高度布局和表格 `overflow:auto`。
- 基础完整性：运行 `pnpm check` 与 `git diff --check`。

## Test / Verification

先修改相关回归断言并确认旧实现失败，再实现样式和组件状态。完成后依次运行聚焦 Vitest、`pnpm check`、`git diff --check`。

## Documentation Updates

完成后将本 spec 与 plan 状态更新为 Complete；无需更新长期项目上下文或 Directory Map。
