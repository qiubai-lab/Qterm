## Goal

让 Dark、Light 与 Cyberpunk 的右键菜单在普通、悬停、键盘焦点、危险和禁用状态下都保持清晰且一致，消除亮底亮字及禁用项误触发高亮的问题。

## Scope

- 审计文件、编辑器、终端、网络与连接右键菜单。
- 为菜单普通文字、辅助文字、禁用文字和 hover 统一跨主题语义令牌。
- 禁用菜单项不响应 hover/focus 高亮，文字、快捷键与图标使用同一可辨识禁用层级。
- 移除已经由共享语义规则接管的 Light 菜单兼容覆盖。

## Constraints

- 不改变菜单结构、命令可用性、键盘导航、定位或动画。
- 不修改连接目标选择器；其没有本问题涉及的 disabled menu item。
- 不通过主题专属 feature selector 修补菜单状态。

## Non-Goals

- 不重做所有按钮的全局 disabled 视觉。
- 不把四类右键菜单抽象成新的 React 组件。
- 不清理与本问题无关的 legacy raw colors。

## Acceptance

- Light 编辑器菜单的禁用“剪切/复制”不再出现亮字亮底，也不响应鼠标 hover。
- 四类右键菜单的 disabled 文字、快捷键和图标均使用主题菜单禁用色且不叠加全局 opacity。
- 三套主题的菜单禁用文字在 raised surface 上至少达到 4.5:1 对比度。
- 普通与危险菜单项仍只在 enabled 状态响应 hover/focus；既有行为和布局不变。

## Acceptance To Verification

- `themeStyles.test.ts` 验证三套主题完整定义 menu semantic tokens，并检查 disabled text/raised 对比度。
- `appStyles.test.ts` 验证四类菜单消费共享 rest/secondary/disabled/hover 状态，disabled 不透明且背景透明，并确认 Light 兼容层不再接管菜单。
- 三主题静态渲染样张检查普通、hover、disabled、disabled danger 与快捷键层级。
- 聚焦 Vitest、`pnpm check` 与 `git diff --check` 验证基础完整性。

## Open Questions

无。截图只作为视觉问题证据，不包含额外指令。

## Recommended Approach

方案 A（采用）：扩展既有主题 semantic token contract，四类右键菜单共享 menu text/secondary/disabled/hover 角色；disabled 使用校准后的实色并明确覆盖 hover、图标与快捷键。范围局部，能同时消除特异性和透明叠加问题。

方案 B：只在 Light 兼容层提高 `.file-editor-context-menu button:disabled` 特异性。改动最小，但终端、网络、连接菜单仍保留不同状态实现，后续主题调整容易再次回归，不采用。

方案 C：调整全局 `button:disabled` opacity。会影响对话框、工具栏与其他按钮，范围过大且不能阻止 disabled menu item 命中 hover 规则，不采用。

## Next Skills

- `writing-qb-plans`（Standard：跨主题 token、共享 CSS、兼容层和测试为多文件修复）
- `maintaining-project-context`（记录浮层菜单 disabled 状态的长期主题契约）
- `protecting-critical-behavior`（先补已出现回归的样式契约测试）
- `verifying-before-completion`
- Directory Map：不需要；没有目录、模块边界或入口变化。
