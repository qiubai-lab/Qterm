# 紧凑连接列表、拖放分组与右键菜单 Standard Plan

Status: Complete (2026-08-19)。

## Requirement

压缩连接列表密度，支持连接跨分组拖放，并用按需右键菜单替代分组标题上的常驻管理按钮。

## Scope

仅调整 ConnectionDialog 的侧栏交互、样式和测试；不改变分组 domain、IPC 或持久化 schema，不实现列表排序。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Design

- HTML Drag and Drop 在连接项上携带 profile id；分组标题是唯一 drop zone。
- drop handler 从当前 profiles 构建完整 `ProfileInput`，只替换 `groupId` 后调用现有 adapter。
- context-menu state 保存目标、屏幕坐标与来源类型；菜单通过 fixed 定位并限制在视口内。
- 分组标题只保留折叠按钮和数量；管理动作转入右键菜单。
- 保留编辑器中的分组 select 作为键盘和非拖放回退。

## Acceptance To Verification

- 紧凑密度和无常驻图标：CSS/DOM 断言。
- 跨组及回到未分组：dragStart/dragOver/drop 组件测试。
- 同组 no-op：确认 `updateProfile` 未调用。
- 分组与连接菜单：contextMenu、菜单命令、Escape/外部关闭测试。
- 删除安全：沿用并更新现有二次确认测试。

## Test / Verification

1. 先扩展 `ConnectionDialog.test.tsx` 与样式测试并确认旧实现失败。
2. 实现 UI 状态、拖放编排、菜单与紧凑样式。
3. 运行 focused Vitest。
4. 运行 `pnpm check`。
5. 运行 Rust fmt、clippy、test，确认共享工作树无回归。

## Documentation Updates

完成后更新本 spec/plan 状态与验证证据。长期 context 和 Directory Map 无需更新。

## Completion Evidence

- 连接行压缩为 30px 最小高度，组间距与标题高度同步收窄。
- 分组常驻管理图标已移除；分组和连接右键菜单、键盘等价路径及关闭行为均有组件测试。
- 拖放到其他分组和同组 no-op 均有回归测试，更新仍通过现有 `updateProfile` 边界。
- 完整前端与 Rust 质量门禁全部通过。
