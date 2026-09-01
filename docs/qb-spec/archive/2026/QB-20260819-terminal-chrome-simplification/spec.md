---
id: QB-20260819-terminal-chrome-simplification
status: archived
archived: 2026-09-02
legacy: true
---
# 终端标题栏与滚动条精简 Task Spec

Status: Complete (2026-08-19)

## Goal

降低终端标题栏连接入口的视觉权重，提供与终端主题一致、窄而平滑显隐的滚动条，并彻底移除终端内部最大化能力。

## Scope

- 连接选择入口恢复无边框、透明背景的轻量样式。
- 下拉提示图标改为三横线菜单图标，并在按钮内垂直居中。
- 自定义 xterm 纵向滚动条宽度、轨道和滑块颜色；空闲时弱化，终端 hover、focus-within 或滚动时显示。
- 删除 Terminal Block 最大化按钮、React 状态、传递属性及专用 CSS。

## Constraints

- 保持终端名称、连接状态、菜单内容与选择行为不变。
- 滚动条动画只使用 opacity/color，不动画宽度，避免影响终端测量与重排。
- 滚动条必须保持可操作，不能通过长期 `display:none` 隐藏。
- 不改变工作区分割、拖放、终端缓冲和会话生命周期逻辑。

## Non-Goals

- 不重做整个标题栏或连接菜单面板。
- 不增加新的最大化替代功能或窗口级控制。
- 不修改 xterm scrollback 上限。

## Acceptance

1. 连接按钮无边框、无常驻底色，三横线图标居中且 hover/展开状态克制可辨。
2. xterm 滚动条更窄，滑块使用终端青绿色主题；空闲弱化，交互或滚动时平滑出现，随后平滑隐藏。
3. reduced-motion 下滚动条不产生移动动画，仍可清晰显示。
4. 终端标题栏不再存在最大化按钮，代码中不再存在终端最大化状态、属性和专用样式。
5. 连接选择、终端分割、关闭与缓冲保留回归测试继续通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1 | 选择器组件断言菜单图标结构；浏览器截图检查默认与展开状态。 |
| 2, 3 | 样式测试断言 xterm viewport 滚动条宽度、颜色、显隐 transition 与 reduced-motion；浏览器计算样式检查。 |
| 4 | WorkspaceCanvas 渲染测试断言无最大化/恢复按钮；`rg` 确认相关状态和 CSS 已删除。 |
| 5 | 聚焦 Vitest 与 `pnpm check`。 |

## Open Questions

无。

## Verification Evidence

- 选择器组件测试确认三横线菜单图标与 Escape 关闭行为。
- WorkspaceCanvas 渲染测试确认终端标题栏不存在最大化/恢复按钮。
- TerminalPanel 与样式测试确认 xterm 滚动层为 5px、主题滑块色和显隐过渡参数。
- 本地页面计算样式确认滚动层宽度与滑块均为 5px、主题色为 `rgba(67, 139, 125, 0.6)`、显隐过渡为 140ms；桌面截图确认终端内部只保留分割和关闭操作。
- `pnpm check`：14 个测试文件、35 项测试全部通过，Lint、TypeScript 和 Vite 构建通过。
- 非测试源码搜索确认最大化状态、属性、按钮和专用 CSS 均已删除；`git diff --check` 通过（仅现有 Windows 行尾提示）。

## Recommended Approach

方案 A：直接覆盖 xterm `.xterm-viewport` 的 WebKit scrollbar，并通过终端容器 hover/focus-within 与 xterm 的 `.scrolling` 状态控制滑块透明度。方案 B：在 xterm 外另造一套同步滚动条。推荐方案 A，因为它保留原生滚动、拖动和可访问行为，不引入双向同步与缓冲高度计算风险。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed；这是局部 UI 与组件状态精简。
- Directory Map: not needed；没有目录或模块职责变化。
