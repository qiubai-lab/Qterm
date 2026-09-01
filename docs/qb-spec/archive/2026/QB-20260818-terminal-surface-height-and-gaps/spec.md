---
id: QB-20260818-terminal-surface-height-and-gaps
status: archived
archived: 2026-09-02
legacy: true
---
# 终端高度分层与窗口间距 Task Spec

Status: Completed on 2026-08-18. CSS regression tests, `pnpm check`, and local browser geometry/visual verification passed.

## Goal

终端内容区在任意 Block 高度下保持单一连续背景，并缩小 Terminal Block 之间及画布边缘的空隙。

## Scope

- 修复终端容器类名与 CSS 选择器不一致的问题。
- 让终端 surface 作为 flex 子项填满标题栏以下的全部 Block 高度。
- 画布外边距由 4px 缩小到 2px。
- 横向和纵向分割条由 5px 缩小到 3px。
- 最大化 Block 的 inset 同步为 2px。

## Constraints

- xterm 背景必须与 Terminal Block 背景一致，剩余不足一行的像素不能形成色带。
- 分割条仍需可拖动，hover 提示仍需可见。
- 不改变 split ratio、持久化模型或终端行列计算流程。

## Non-Goals

- 不重新设计终端标题栏、边框或配色。
- 不改变 SSH、PTY 或 xterm 缓冲行为。

## Acceptance

1. 高 Block 中 `.terminal-surface` 填满标题栏以下的全部可用高度。
2. xterm 区域与容器背景连续，不再出现默认高度下方的明显分层。
3. 画布边缘为 2px，横纵窗口间分割条为 3px。
4. 分割条拖动与终端 fit/resize 行为保持有效。
5. 聚焦回归测试、完整前端检查和本地视觉检查通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1–3 | CSS 回归测试与浏览器几何/背景色测量。 |
| 4 | 现有 layout 测试、完整测试集及浏览器 resize 后几何检查。 |
| 5 | 聚焦 Vitest、`pnpm check`、截图和 `git diff --check`。 |

## Open Questions

无。

## Recommended Approach

方案 A 是修正真实 `.terminal-surface` 选择器并保持现有 ResizeObserver/FitAddon 流程；方案 B 是在 JS 中为 xterm 写入显式像素高度。推荐方案 A，因为问题来自 CSS 契约漂移，flex 容器本来就能持续适配任意 Block 高度，避免重复维护 JS 尺寸状态。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed；这是局部布局 bug 修复。
- Directory Map: not needed；没有结构变化。
