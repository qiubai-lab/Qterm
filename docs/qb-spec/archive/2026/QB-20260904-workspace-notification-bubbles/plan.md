---
id: QB-20260904-workspace-notification-bubbles
type: feature
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 工作区通知实施计划

## Requirement / Scope
对应同 ID spec REQ-001 至 REQ-005。只改前端提醒，不改原生通知和协议解析。

## Affected Files / Design
`src/terminal/notifications/`：独立瞬时气泡 store，Provider 负责按窗口/工作区路由及生命周期；WorkspaceNotificationLabel 接入锚定气泡组件；CSS 使用专门提示色与伪元素，避免复用选中边框。新模块各小于 200 行，不增长 WorkspaceShell。

## Implementation Tasks
- [x] 增加瞬时气泡合并与生命周期，接入现有未读链路。
- [x] 实现气泡定位、暂停倒计时、点击来源以及弱呼吸样式。
- [x] 补充相邻测试与通知使用说明，运行必要门禁。

## Acceptance To Verification
- AC-001、AC-003：Provider 前后台、工作区、会话有效性测试。
- AC-002：store 合并/旧定时器保护及组件暂停/关闭测试。
- AC-004：样式检查（主题、非选中限定、reduced-motion）及构建。
- AC-005：气泡正文、定位及点击组件测试。

## Test / Verification
聚焦通知测试 → pnpm check（含 source-size、lint、全量测试和 build）。无需原生打包。记录无法完成的桌面视觉验证，不以构建替代人工视觉证据。

## Documentation Updates
更新 docs/terminal-notifications.md，通知域目录入口保持不变。

## Verification Evidence
2026-09-04：pnpm check 通过（source-size 无 ratchet reminder、ESLint、Vitest、脚本测试、TypeScript、Vite build）；git diff --check 通过。
AC-001/003：Provider 测试验证前台跨工作区合并、后台分流、关闭气泡保留未读及窗口失焦清理；既有 epoch/已聚焦抑制回归通过。
AC-002：相邻 store 和组件测试验证合并计数、过期 revision、4 秒到期、悬停与键盘暂停、更新后继续暂停和卸载清理。
AC-005：组件测试验证正文开关、点击路由、焦点目标会话再次校验、Escape、标签溢出定位及模态清理。
AC-004：样式检查确认仅非选中标签使用底部主题 danger 色，3 秒 × 3 次 opacity 动画及 reduced-motion 静态回退；主题颜色门禁通过。未进行真实桌面视觉验收，呼吸效果强弱及跨屏观感仍需桌面复验。
模块边界保持在通知域，WorkspaceShell 未增长；Directory Map 和使用说明已更新。
