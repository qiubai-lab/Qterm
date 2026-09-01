---
id: QB-20260819-active-block-motion
status: archived
archived: 2026-09-02
legacy: true
---
# 激活窗口高亮与切换动效 Task Spec

Status: Complete (2026-08-19)。已交付共享激活指示框、强化窗口状态、resize 跟随和 reduced-motion 保护。

## Goal

用户能立即辨认当前激活的终端或文件窗口，并在切换时通过连续的空间运动理解焦点去了哪里。

## Scope

- 同时增强终端与文件窗口的激活边框、标题栏层次和轻微光晕。
- 在工作区上方增加共享激活指示框，从旧窗口位置平滑移动并缩放到新窗口。
- 指示框随 split resize、布局变化和工作区可见性更新。
- `prefers-reduced-motion` 下取消位移动画，保留清晰的静态激活反馈。

## Constraints

- 不阻塞点击、键盘聚焦、拖动、分割或终端输入。
- 不增加动画运行时依赖；只动画一个无交互 overlay。
- 动效快速收敛、无弹跳，避免干扰终端阅读。

## Non-Goals

- 不改变 workspace reducer、活动块选择语义或布局持久化。
- 不给终端内容、文件列表或 divider 添加位移动画。

## Acceptance

1. 激活的 Terminal/File Block 比非激活块具有更清晰的边框、标题栏和强调色。
2. 活动块变化时，共享指示框从旧矩形连续移动并调整到新矩形；动画中继续切换不会阻塞输入。
3. split resize 后指示框仍贴合活动块。
4. 指示框不接收指针事件；减少动态效果偏好下不执行空间滑动。

## Acceptance To Verification

- 1、4：样式契约测试覆盖 active、indicator、pointer-events 和 reduced-motion。
- 2、3：`WorkspaceCanvas` 组件测试覆盖活动块切换后的指示框坐标，并通过 ResizeObserver 路径保持可更新。
- 全部：聚焦 Vitest 与 `pnpm check`。

## Open Questions

无。采用无弹跳、约 300ms 的快速收敛动效。

## Recommended Approach

采用 WorkspaceCanvas 级共享 overlay，通过活动块 DOMRect 定位，并用可中断 CSS transition 重定向 transform/尺寸。相比每个 Block 独立淡入，它保留从旧位置到新位置的空间连续性；相比引入动画库，本次单一指示框不需要额外依赖。

## Next Skills

- `apple-design`（空间连续性、可中断、减少动态效果）
- `writing-qb-plans`（Standard）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed（局部交互表现）
- Directory Map: not needed（无模块或入口变化）
