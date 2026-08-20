# 连接分组 Pointer 拖动回归修复 Standard Plan

Status: Complete (2026-08-19)。

## Requirement

用 WebView 可靠的 Pointer Events 修复连接无法拖动到分组的问题。

## Scope

只替换 ConnectionDialog 前端拖动手势与视觉反馈；保留现有移动持久化、右键菜单和后端边界。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本次 spec/plan

## Design

- pointer down 建立 pending drag 并捕获 pointer；8px hysteresis 后激活。
- pointer move 通过 `elementFromPoint` 查找带 `data-profile-drop-group` 的分组区块，并更新 ref/state。
- fixed、pointer-events-none 的预览以 transform 跟随指针，保留 grab offset。
- pointer up 从同步 ref 读取最终目标，清理后调用既有 `moveProfile`；cancel 只清理。

## Acceptance To Verification

- 阈值、预览、跨组提交：pointer 手势组件测试。
- 同组、空白、cancel：no-op 和状态清理测试。
- 点击/右键不回归：既有菜单测试和选择测试。
- 视觉契约：样式测试。

## Test / Verification

先把现有 drag 事件测试改为 pointer 手势并确认旧实现失败；实现后运行 focused Vitest、`pnpm check` 与 Rust fmt/clippy/test。

## Documentation Updates

完成后更新本 spec/plan 状态和验证证据；长期 context 与 Directory Map 不变。

## Result

- 已移除原生 HTML Drag and Drop 事件链，改用带 8px 阈值和 pointer capture 的手势状态机。
- 整个分组区块均可接收投放，浮层预览不会阻挡坐标命中。
- 同组、空白区域、取消均保持 no-op；点击、键盘与右键菜单路径保留。
- 聚焦测试、`pnpm check`、Rust fmt/clippy/test 与 diff 检查均通过。
