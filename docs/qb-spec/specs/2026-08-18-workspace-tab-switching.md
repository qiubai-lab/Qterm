# Workspace Tab 切换回归修复 Task Spec

## Status

Completed on 2026-08-18. 已移除标签普通点击阶段的 pointer capture，并加入 Workspace 往返切换回归测试。

## Goal

用户新建 Workspace 后，可以通过点击任意已有 Workspace 标签切换回对应工作区。

## Scope

- 修复顶部 Workspace 标签的普通点击事件被拖拽指针捕获干扰的问题。
- 保持标签拖动排序、双击重命名和关闭行为不变。
- 增加从新建 Workspace 切换回原 Workspace、再切回新 Workspace 的前端回归测试。

## Constraints

- 不改变 Workspace reducer、持久化 schema 或 SSH session 生命周期。
- 切换 Workspace 时继续保留每个 Workspace 的已挂载画布和终端状态。
- 拖拽监听必须在组件卸载或指针结束后清理。

## Non-Goals

- 不调整 Workspace 标签的视觉样式。
- 不重构布局树、终端 runtime 或 Tauri IPC。

## Acceptance

1. 新建 Workspace 2 后，点击 Workspace 1 会令 Workspace 1 成为选中标签并显示其画布。
2. 随后点击 Workspace 2 可再次切换回来。
3. 标签拖动排序入口仍保留，普通点击不再依赖被指针捕获后的事件派发。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 可切回 Workspace 1 | App 交互测试断言选中样式和两个画布的 `aria-hidden`。 |
| 可再次切回 Workspace 2 | 同一交互测试执行往返切换并断言可见性。 |
| 拖拽与点击不冲突 | 代码检查确认拖拽监听位于 `window` 且不调用 pointer capture；运行前端完整检查。 |

## Open Questions

无阻塞问题。

## Recommended Approach

将标签拖拽的 move/up/cancel 监听绑定到 `window`，并移除在 `pointerdown` 阶段立即执行的 pointer capture。相比在 `pointerdown` 时直接 dispatch 切换，此方案保留按钮的标准 click/double-click 语义，也避免把选择逻辑耦合到拖拽入口。

## Next Skills

- `writing-qb-plans`：使用 Standard 计划组织组件与测试改动。
- `checking-architecture-boundaries`：确认修复仅位于 Shell 交互层。
- `protecting-critical-behavior`：先补可复现往返切换的回归测试。
- `verifying-before-completion`：运行聚焦测试和 `pnpm check`。
- Directory Map：不需要；本次没有目录、入口或模块职责变化。
