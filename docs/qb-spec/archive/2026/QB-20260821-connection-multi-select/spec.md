---
id: QB-20260821-connection-multi-select
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让用户能在连接管理器中快速选择并批量整理多个 SSH 连接。

## Scope

- 使用 Command（macOS）或 Ctrl（Windows/Linux）点击/键盘激活连接以增减多选集合。
- 普通点击仍切换为单选并打开对应连接编辑器。
- 拖动任一已选连接时，将全部已选连接移动到目标分组。
- 右键已选连接时保留多选并提供批量删除；右键未选连接时切换为该连接的单选菜单。
- 批量删除保留现有二次确认和关联网络规则清理语义。
- 相邻连接项之间增加细小间距。

## Constraints

- 复用现有连接管理器状态、拖拽手势、右键菜单和单条 profile API。
- 保持紧凑暗色工作台风格、键盘可访问性和单选编辑行为。
- 不覆盖工作区中与终端目标选择器相关的现有未提交改动。

## Non-Goals

- 不增加框选、Shift 连续区间选择或独立批量工具栏。
- 不新增后端批处理 API，不改变连接或分组数据模型。

## Acceptance

- 修饰键操作可增减多个选择，普通操作恢复单选。
- 多选集合可以一次拖到另一分组，已在目标分组的项不重复更新。
- 已选项的右键菜单可以删除整个选择集合，并明确显示数量。
- 批量删除仅确认一次，刷新列表一次，并正确清理当前工作区引用。
- 相邻连接选择背景之间至少保留 2px 视觉余量。

## Acceptance To Verification

- 使用 ConnectionDialog Testing Library 测试覆盖选择、菜单、拖拽和删除。
- 使用 appStyles 样式测试覆盖连接项间距。
- 运行聚焦测试和 `pnpm check`。

## Open Questions

- 无阻塞问题；平台修饰键按常见桌面约定解释为 Command/Ctrl。

## Recommended Approach

将现有单一编辑焦点保留为 `selectedId`，新增独立选择集合；这样编辑器始终有明确对象，同时批量动作只消费选择集合。相比新增“批量模式”，该方案操作更快、界面更轻，也能复用当前拖拽和菜单结构。

## Next Skills

- `writing-qb-plans`：Standard 计划。
- `protecting-critical-behavior`：为多选和批处理行为增加回归测试。
- `verifying-before-completion`：执行聚焦测试与完整前端检查。
- Directory Map: not needed；无目录或模块边界变化。
