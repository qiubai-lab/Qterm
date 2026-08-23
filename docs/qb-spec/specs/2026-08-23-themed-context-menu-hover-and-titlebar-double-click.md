## Goal

让所有右键菜单的悬停反馈随当前主题变化，并让 head bar 空白区域的双击稳定切换窗口最大化与还原。

## Scope

- 统一连接、文件、网络和终端右键菜单的普通菜单项 hover / keyboard focus 色彩。
- 赛博主题使用亮黄色菜单项背景与可读的深色文字。
- head bar 非交互区域使用手势阈值区分点击与拖动：静止单击不进入原生拖动，两次相邻点击切换窗口最大化/还原；移动超过阈值才启动原生拖动。

## Constraints

- 复用现有主题变量体系，不引入新 UI 依赖。
- 保留危险菜单项的红色语义，以及按钮、输入框、工作区标签等交互区域的既有双击行为。
- 不修改原生窗口 API 或后端边界。

## Non-Goals

- 不调整普通列表、工具栏按钮或目标选择器的 hover。
- 不实现操作系统级独占全屏；本次行为是最大化/还原切换。

## Acceptance

- 四类右键菜单的普通可用项使用共享主题 hover 色，赛博主题为亮黄色。
- 危险项和禁用项不被普通 hover 色覆盖。
- 双击 head bar 非交互区域只触发一次最大化/还原，且不依赖 WebView 是否继续派发 `dblclick` 或正确维护 `detail`。
- 在 head bar 非交互区域按下并移动超过阈值仍可拖动窗口，阈值内移动不误触拖动。
- 双击窗口按钮或工作区标签不触发 head bar 最大化/还原。

## Acceptance To Verification

- CSS 样式断言验证共享语义变量、四类菜单选择器和危险项排除。
- WorkspaceShell 行为测试使用 `detail: 0` 的两组 pointer down/up 验证最大化与还原，并验证移动阈值、拖拽启动和交互目标排除。
- 运行相关 Vitest，最后运行 `pnpm check`。

## Open Questions

无。

## Recommended Approach

推荐在基础主题中定义共享菜单 hover 语义变量，并在最后覆盖层统一四类右键菜单。窗口行为采用前端手势阈值：按下后先监听移动/释放，移动超过 5px 才调用原生拖动；350ms、5px 范围内的第二次静止按下直接切换最大化。相比 `onDoubleClick` 或读取 `event.detail`，该方案不依赖原生拖动接管后的 WebView 事件连续性；相比延时启动拖动，移动一旦越过阈值便立即响应，不引入固定等待。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（无目录或职责边界变化）
