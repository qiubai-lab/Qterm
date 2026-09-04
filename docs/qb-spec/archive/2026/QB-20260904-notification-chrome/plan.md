---
id: QB-20260904-notification-chrome
type: design
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 实施计划
## Requirement / Scope
对应同 ID spec AC-001 至 AC-003；仅前端样式与协议标签。
## Design / Affected Files
notifications.css 复用主题 token，独立 TerminalProtocolTag 负责合并和 portal 提示。Provider 保持设置/未读职责；LayoutView 合并两处调用。
## Implementation Tasks
- [x] 更新工作区背景/字体呼吸。
- [x] 合并标签并增加紧凑提示，保留目录和未读状态。
- [x] 更新相邻测试与说明，执行门禁。
## Acceptance To Verification
AC-001：主题样式门禁与 CSS 审阅；AC-002/003：组件测试及 LayoutView 原目录状态回归。
## Test / Verification
聚焦测试后 pnpm check，检查 source-size 无增长债务。桌面视觉效果如未实测明确记录。
## Documentation Updates
更新通知说明与目录图的标签入口。

## Verification Evidence
2026-09-04：pnpm check 通过，110 个测试文件、867 项测试通过；source-size 无 ratchet 提醒，LayoutView 基线从 658 降至 657。后续重连时清理提示的修正通过独立标签测试（2 项）、ESLint 和 pnpm build。git diff --check 通过。
AC-001：检查使用 selection-marker/danger 主题 token，非选中限定，完整背景覆盖与字体呼吸、reduced-motion 回退；主题样式门禁通过。
AC-002/003：LayoutView 目录状态回归及独立协议标签测试覆盖合并、仅启用能力、通知单独开启、全部关闭、断线重连、鼠标/键盘气泡、Escape 和未读点击定位。
未进行实际桌面视觉验收；色彩呼吸强度和紧凑提示的真实显示效果仍需桌面复验。保留原生通知与解析职责，说明文档与 Directory Map 已同步。
