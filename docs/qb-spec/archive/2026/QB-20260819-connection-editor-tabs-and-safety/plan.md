---
id: QB-20260819-connection-editor-tabs-and-safety
status: archived
archived: 2026-09-02
legacy: true
---
# 连接配置分栏与删除保护 Standard Plan

Status: Complete (2026-08-19)。聚焦回归测试、完整前端质量闸口与差异检查均通过。

## Goal

重组连接配置编辑器并补齐危险操作保护，同时维持既有 profile、凭据和终端目标同步边界。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Implementation

1. 先增加组件与样式回归测试，覆盖 Tab、按钮移除、名称回退、删除确认和私钥表格滚动。
2. 在弹窗编辑区增加可访问 Tab，并按连接信息/认证方式拆分现有表单。
3. 保存前规范化名称；用嵌套确认弹窗包装现有删除流程。
4. 移除即时连接/断开逻辑与无用依赖，将底部操作按钮右对齐。
5. 用固定高度、可滚动的表格替换私钥结果按钮列表。

## Risk And Boundaries

- profile CRUD 仍通过 `lib/tauri/profiles`，UI 不承载持久化规则。
- 密码保存仍通过凭据端口；仅移除与即时连接相关的密码加载分支。
- 选择/保存 profile 后仍更新当前 terminal block target，避免改变现有工作区行为。
- 删除确认是 UI 安全门；确认后的原删除清理顺序保持不变。

## Acceptance To Verification

- 组件行为：运行 `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx`。
- 样式约束：运行 `pnpm vitest run src/app/appStyles.test.ts`。
- 集成质量：运行 `pnpm check`。
- 变更卫生：运行 `git diff --check`。

## Completion Gate

所有新增回归测试和 `pnpm check` 通过，且规格与计划状态更新为 Complete 后才宣告完成。
