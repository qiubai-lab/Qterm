---
id: QB-20260819-split-terminal-bottom-spacing
status: archived
archived: 2026-09-02
legacy: true
---
# 上下分割终端底部留白修复 Task Spec

## Goal

终端在单列和上下分割布局中都保留一致的 2px 底部安全距离，最后一行与光标不贴住或越过底边。

## Scope

- 将终端底部留白从 6px 收窄为 2px。
- 将终端内边距放到 FitAddon 能识别的内部 `.xterm` 元素。
- 保持现有顶部、左右内边距、字号、行高和滚动条样式。

## Constraints

- 不修改 xterm FitAddon、ResizeObserver 或 PTY 行列同步逻辑。
- 不改变 split 比例、divider 尺寸或 Terminal Block 标题栏。

## Non-Goals

- 不调整终端字体、行高、缓冲区和 ANSI 配色。
- 不修改横向/纵向布局模型。

## Acceptance

1. `.terminal-surface` 继续填满 Terminal Block 的剩余空间，但不再持有会绕过 FitAddon 的 padding。
2. 内部 `.xterm` 填满宿主并使用 `4px 3px 2px 7px` padding，使 FitAddon 在单列和上下分割时均扣除该空间。
3. 现有终端滚动、resize 和构建检查无回归。

## Acceptance To Verification

- 1、2：更新样式契约测试，先确认旧实现失败，再验证新选择器和 2px 底部值。
- 3：运行聚焦样式测试及 `pnpm check`。

## Open Questions

无。

## Recommended Approach

把 padding 从宿主 `.terminal-surface` 移到其直接子元素 `.xterm` 并让 `.xterm` 高度为 100%。FitAddon 原生从 `.xterm` 的计算样式扣除 padding；相比在 JS 中额外修正高度，该方案没有重复尺寸公式，也能自然覆盖上下分割和拖拽 resize。

## Next Skills

- `writing-qb-plans`（Tiny）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed（局部视觉回归）
- Directory Map: not needed（无结构变化）
