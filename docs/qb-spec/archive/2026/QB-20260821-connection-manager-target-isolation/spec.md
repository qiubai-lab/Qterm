---
id: QB-20260821-connection-manager-target-isolation
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

连接管理中的配置操作不再改变当前 Terminal Block 的目标或发起连接，终端左上角目标选择器是连接切换的唯一入口。

## Scope

- 点击连接列表项、右键“编辑连接”只切换连接管理器内部编辑对象。
- 新建或保存连接配置后只刷新 profile catalog 并保持编辑器选中项，不修改当前 Block 的 `profileId`。
- 复制连接后只选中副本供编辑，不修改当前 Block 的 `profileId`。
- 将连接管理标题说明改为配置管理语义，不再暗示操作会连接当前 Block。
- 保留删除当前 Block 正在引用的 profile 时清理失效引用的既有行为。

## Constraints

- 不改变终端左上角选择器现有的目标切换、认证和连接流程。
- 不改变 profile IPC、Workspace schema 或会话后端。
- 管理器内部选中态与 Workspace/Block 目标状态保持分离。

## Non-Goals

- 不重做目标选择器或认证弹窗。
- 不改变删除正在被引用的 profile 时的引用清理策略。
- 不调整连接管理布局和视觉样式。

## Acceptance

1. 鼠标或键盘选择连接列表项后，编辑器显示对应配置，但不调用 `selectBlockTarget`。
2. 保存既有配置或创建新配置后不调用 `selectBlockTarget`。
3. 复制配置后副本仍被选中供编辑，但不调用 `selectBlockTarget`。
4. 右键“编辑连接”与普通点击遵守同一隔离规则。
5. 终端左上角目标选择器的既有选择与连接行为继续通过现有测试。

## Acceptance To Verification

- 1–4：在 `ConnectionDialog.test.tsx` 中添加回归断言，覆盖点击、键盘、右键、保存和复制。
- 5：运行 `LayoutView.test.tsx` 与连接管理聚焦测试。
- 完整性：运行 `pnpm check`，若被既有失败阻塞则单独运行 lint、build 并记录归因。

## Open Questions

无阻塞问题。

## Recommended Approach

方案 A：移除连接管理浏览、保存和复制路径上的 `selectBlockTarget`，保留管理器内部选中态，并保留删除失效引用时的清理。方案 B：重构 WorkspaceProvider，让它监听 catalog 变化并统一清理所有悬空引用。推荐方案 A；它直接修复错误职责和全部可观察入口，风险小且不扩大到 Workspace 引用迁移。

## Next Skills

- `writing-qb-plans`
- `maintaining-project-context`：记录长期产品入口与 UI 职责边界。
- `checking-architecture-boundaries`：确保 ConnectionDialog 不编排目标选择或连接会话。
- `protecting-critical-behavior`：为已发生回归补行为测试。
- `verifying-before-completion`
- Directory Map: not needed；无目录、入口文件或模块结构变化。
