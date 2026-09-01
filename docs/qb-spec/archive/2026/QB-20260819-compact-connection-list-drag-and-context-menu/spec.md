---
id: QB-20260819-compact-connection-list-drag-and-context-menu
status: archived
archived: 2026-09-02
legacy: true
---
# 紧凑连接列表、拖放分组与右键菜单 Task Spec

Status: Complete (2026-08-19)。

## Goal

连接管理侧栏在相同高度内展示更多分组与连接，并让用户通过直接拖放和按需出现的右键菜单高效管理连接与分组。

## Scope

- 收窄连接 item 的垂直高度和组间距，保留名称与目标摘要。
- 连接 item 可拖到任一分组标题或“未分组”，落下后立即持久化新的 `groupId`。
- 拖动经过有效目标时提供明确高亮；结束、取消或失败后清理拖动状态。
- 移除分组标题常驻的新建/更多按钮。
- 分组右键菜单提供“在组内新建连接 / 重命名分组 / 删除分组”。
- 连接右键菜单提供“编辑连接 / 移到未分组或指定分组 / 删除连接”。
- 右键菜单支持点击外部或 Escape 关闭，并支持键盘 ContextMenu / Shift+F10 打开。

## Constraints

- 拖动只改变 profile 的 `groupId`，复用现有 `updateProfile` 与 repository 引用校验。
- “未分组”标题始终存在，即使当前为空，也必须可作为放置目标。
- 删除连接和删除分组继续使用既有二次确认。
- 遵守 `prefers-reduced-motion`，拖动与菜单反馈不依赖大幅位移动画。

## Non-Goals

- 不支持连接排序、分组排序、多选或跨窗口拖放。
- 不改变后端 schema、domain、IPC 契约和认证流程。
- 不新增第三方拖放或菜单依赖。

## Acceptance

1. 连接 item 高度显著收窄，名称与 `username@host:port` 仍可辨识。
2. 连接可拖到其他分组或“未分组”，正确调用 profile 更新并刷新列表。
3. 无效/同组放置不发起持久化，拖动目标有即时视觉反馈。
4. 分组标题不再显示常驻管理图标，右键菜单可完成原有管理动作。
5. 连接右键菜单可编辑、移动和请求删除，破坏性动作仍有确认。
6. 菜单可通过鼠标、键盘打开，并可通过 Escape 或点击外部关闭。

## Acceptance To Verification

- 1、3、4：样式契约测试与组件 DOM 断言。
- 2、5、6：`ConnectionDialog.test.tsx` 覆盖拖放、菜单动作和关闭行为。
- 全部：`pnpm check`；本次不改 Rust，但运行 Rust fmt/clippy/test 作为工作树完整性门禁。

## Open Questions

无；桌面管理场景采用标准右键菜单，同时保留表单中的分组选择作为无拖放回退路径。

## Recommended Approach

方案一使用 HTML Drag and Drop，改动小、符合桌面鼠标模型且可直接测试；方案二自行实现 Pointer Events 拖动，能获得更连续的物理跟手效果，但会显著增加命中、滚动和辅助功能复杂度。本次推荐方案一，并以即时目标高亮、菜单轻量出现动画和键盘等价路径补足体验。

## Next Skills

- `writing-qb-plans`（Standard：多文件 UI 行为与回归测试）
- `checking-architecture-boundaries`（确认拖放只编排既有 profile 更新）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed（不改变长期产品或领域规则）
- Directory Map: not needed（不改变模块与目录职责）

## Verification

- Focused Vitest：`ConnectionDialog.test.tsx` 与 `appStyles.test.ts` 共 19 个测试通过。
- `pnpm check`：通过（24 个测试文件、92 个测试，含 lint、TypeScript 与 Vite build）。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test --all-targets --all-features`：通过（76 passed；1 个依赖本机 OpenSSH 的既有测试按设计 ignored）。
- Project Context 与 Directory Map 无需更新：此次只调整既有 ConnectionDialog 的呈现和前端编排。
