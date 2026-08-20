# 终端滚动条白线清理 Task Spec

Status: Complete (2026-08-19)

## Goal

移除终端右侧常驻白线，并降低青色滚动滑块的视觉亮度。

## Scope

- 隐藏因 3px overview ruler 配置产生、但当前没有装饰内容的画布。
- 将滑块默认色调整为品牌青色 50% 透明度，hover/active 逐级轻微增强。
- 保持 3px 宽度和现有显隐动画。

## Constraints

- 不恢复系统默认滚动条宽度。
- 不修改终端缓冲、布局或会话行为。

## Non-Goals

- 不新增 overview ruler 标记功能。

## Acceptance

1. 终端右侧不再存在常驻白线。
2. 滑块保持青色色相但默认亮度明显降低。
3. 滑块 hover、active 与显隐动画仍正常。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1 | 样式测试断言 overview ruler 不可见；桌面截图确认。 |
| 2, 3 | TerminalPanel 主题测试、浏览器计算色与完整检查。 |

## Open Questions

无。

## Verification Evidence

- 定位确认常驻白线来自 `xterm-decoration-overview-ruler` 画布，而非滚动滑块。
- 浏览器实际计算样式确认画布 opacity 为 0、pointer-events 为 none。
- 滑块计算样式为 3px、`rgba(117, 230, 207, 0.5)`。
- 聚焦测试和 `pnpm check` 通过：14 个测试文件、35 项测试全部成功，Lint、TypeScript、Vite 构建通过。
- 桌面进程在最终截图复验前已退出；浏览器实际渲染检查作为替代证据。

## Recommended Approach

推荐保留 xterm 官方 3px 尺寸配置，但将当前未使用的 overview ruler 画布设为透明，并通过带 alpha 的主题色降低滑块亮度；相比操作 xterm 私有 DOM 尺寸，这不会破坏滚动测量。

## Next Skills

- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed。
- Directory Map: not needed。
