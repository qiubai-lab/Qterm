---
id: QB-20260818-workspace-tab-switching
status: archived
archived: 2026-09-02
legacy: true
---
# Workspace Tab 切换回归修复计划

## Status

Completed on 2026-08-18. 聚焦 App 测试与 `pnpm check` 均通过。

## Requirement

修复新建 Workspace 后无法通过顶部标签切换回原 Workspace 的回归，同时维持拖拽排序和双击重命名入口。

## Scope

仅调整 `WorkspaceShell` 的标签指针事件，并在 App 交互测试中覆盖往返切换；不改变 reducer、持久化或 runtime。

## Affected Files

- `src/workspace/WorkspaceShell.tsx`
- `src/app/App.test.tsx`
- 本 task spec 与 plan

## Design

普通点击继续由标签按钮的 `onClick` 负责。拖拽入口只记录起点，并在 `window` 上监听同一 pointerId 的 move/up/cancel；超过阈值才进入拖拽状态，结束时按落点排序并清理监听。不在 `pointerdown` 时捕获指针，避免浏览器/WebView 把 click 目标改为标签容器。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 新建后切回原 Workspace | Vitest + Testing Library 点击 Workspace 1，断言标签选中与画布可见。 |
| 可再次切回新 Workspace | 同一测试点击 Workspace 2，断言状态恢复。 |
| 改动不破坏前端 | 运行聚焦测试后运行 `pnpm check`。 |

## Test / Verification

1. 先加入往返切换测试，并确认其能暴露当前交互问题或对应缺失保护。
2. 修改拖拽监听实现，重跑 App 测试。
3. 运行 `pnpm check`，覆盖 ESLint、Vitest、TypeScript 与 Vite build。

## Documentation Updates

新增本次回归修复的 task spec 与 plan；无需更新长期项目上下文和 Directory Map。
