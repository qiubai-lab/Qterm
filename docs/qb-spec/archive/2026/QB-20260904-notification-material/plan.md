---
id: QB-20260904-notification-material
type: design
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 实施与验证
## Scope / Design
通知域 WorkspaceNotificationLabel、WorkspaceNotificationBubble 和 notifications.css；复用 Icon 与主题 token。标题独立 span 与静态圆点，气泡保留交互处理，仅改信息层次和材质。无需动效依赖或 gesture spring，当前没有拖拽交互。
## Tasks
- [x] 移除背景提示，重设计标题动效与未读圆点。
- [x] 紧凑材质卡片、查看动作、按下反馈及偏好回退。
- [x] 通知回归、主题门禁与 pnpm check。
## Acceptance To Verification
AC-001/002：主题样式检查与 CSS 审查；AC-003：既有 Bubble/Label/Provider 相邻测试，保留倒计时、暂停、合并、定位、正文、Escape 行为。
## Documentation
更新 docs/terminal-notifications.md。能力仍归通知域，入口未变化。

## Verification Evidence
pnpm check 通过：110 个测试文件、867 项测试、脚本测试、ESLint、TypeScript、Vite build，source-size 无 ratchet 提醒。git diff --check 通过。标题嵌套结构改变后更新拖拽测试选择器，工作区排序行为回归通过。AC-001/002 经主题样式门禁和代码审阅；AC-003 由现有通知交互回归覆盖。尚未进行真实桌面视觉验收，材质与动效实际观感需在应用内复验。
