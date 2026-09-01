---
id: QB-20260819-connection-sidebar-hierarchy
status: archived
archived: 2026-09-02
legacy: true
---
# 连接侧栏信息层级优化 Standard Plan

Status: Complete (2026-08-19)。

## Requirement

精简连接管理右键菜单，固定高频操作，支持未分组折叠，并提升紧凑连接项的视觉辨识度。

## Scope

仅调整 DialogFrame 标题栏扩展点、ConnectionDialog 的侧栏结构/行为和对应样式测试；不改变持久化或领域规则。

## Affected Files

- `src/components/dialogs/DialogFrame.tsx`
- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本次 spec/plan

## Design

- 为 DialogFrame 增加可选 `headerActions`，与关闭按钮共同位于标题栏尾部。
- 将侧栏分为固定 toolbar 和单独可滚动 list。
- “未分组”改用与普通分组一致的 toggle，并用独立状态保存折叠状态。
- 连接菜单仅保留编辑/删除；移动仍由拖动和表单分组选项承担。
- 连接项使用状态点、copy 容器、等宽 endpoint 和选中态 accent rail，不增加额外行高。

## Acceptance To Verification

- 菜单精简、未分组折叠、密码入口与 toolbar 结构：组件测试。
- 拖动到未分组：保留并扩充 pointer 回归测试。
- 信息层级和固定布局契约：样式测试。

## Test / Verification

先更新相关行为测试并确认现状不满足，再实现；运行聚焦 Vitest、`pnpm check`、Rust fmt/clippy/test 与 `git diff --check`。

## Documentation Updates

完成后更新本 spec/plan 状态和验证证据；长期 Project Context 与 Directory Map 不变。

## Result

- DialogFrame 已支持可选标题栏操作区，密码管理入口迁移完成。
- 创建工具条与列表滚动区已结构分离，“未分组”支持折叠并继续接受拖放。
- 连接右键菜单仅保留编辑和删除，拖动与表单分组选择继续承担移动操作。
- 连接项采用选中强调线、状态点、名称和等宽端点两级层次，保持 30px 紧凑密度。
- 聚焦测试、本地界面检查、前端全量门禁、Rust 门禁和 diff 检查全部通过。
