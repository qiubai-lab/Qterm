---
id: QB-20260904-workspace-tab-deck
type: feature
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 工作区堆叠实施计划

## Requirement / Scope
对应同 ID spec 的 REQ-001—005。仅前端工作区导航，保持会话/持久化/关闭确认契约。

## Design / Affected Files
- workspaceTabDeck.ts：纯几何规则，正常宽度/最小露出/预览空间/溢出。
- useWorkspaceTabDeck.ts：容器测量、悬停/焦点/锁定、滚动可见性。
- WorkspaceTabs.tsx：从 Shell 提取的标签渲染及重命名；useWorkspaceTabDrag.ts：原拖拽生命周期，适配可见几何。
- WorkspaceTabStrip.tsx：既有菜单与批量关闭，向标签层反馈菜单锁定。
- workspaceTabDeck.css：堆叠/展开/主题/减少动效；通知气泡定位使用可见几何。
- WorkspaceShell.tsx：仅组合新入口，保留工作区内容切换方向。

边界检查：纯规则不依赖 React/Tauri；UI hook 不拥有工作区/会话第二份状态；现有 Context 是唯一数据源。新文件遵守默认尺寸，Shell 基线随提取降低。

## Implementation Tasks
- [x] 为边界布局与选中/预览写纯模型测试。
- [x] 提取标签和拖拽职责，实现稳定堆叠布局。
- [x] 接通键盘、右键/编辑锁定、通知锚点与主题样式。
- [x] 浏览器交互原型验证后调整动效及几何。
- [x] 运行相关回归、pnpm check，更新 Directory Map 与基线，验证后归档。

## Acceptance To Verification
| Acceptance | Verification |
| --- | --- |
| AC-001 | 模型边界测试、浏览器不同宽度与数量、加号/边框检查 |
| AC-002 | hook/组件交互测试、静止/快速移动鼠标、键盘与 reduced-motion 浏览器检查 |
| AC-003 | App/工作区菜单/拖拽相关回归与浏览器堆叠排序检查 |
| AC-004 | 三主题浏览器检查、通知定位回归 |

## Test / Verification
先纯模型和相邻行为测试，后实际浏览器交互检查，最后 pnpm check。无需 native build。

## Documentation Updates
更新 Directory Map 导航能力 owner；记录证据并 conflict-free 归档。无长期 context 修改。

## Completion
实施与验证完成，证据见同目录 spec.md。
