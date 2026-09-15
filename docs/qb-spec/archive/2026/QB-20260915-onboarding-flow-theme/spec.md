---
schema: 1
id: QB-20260915-onboarding-flow-theme
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# 引导顺序与主题强调

## Requirements
- REQ-001: 工具步骤顺序为文件、网络、Git；Demo 重看入口放在底部说明旁。
- REQ-002: 客户端最后一步只说明关于中的重看入口，提供完成按钮，不要求打开关于。
- REQ-003: 工作区高亮与标签选中区域保持对称上下间距并向左扩展，不改变工作区样式。
- REQ-004: 气泡跟随当前主题，赛博主题采用黄色视觉重点。

## Behavior Delta
### MODIFIED
- REQ-001: 交换网络与 Git 步骤，Demo 重看从 header 移到底部 footer。
- REQ-002: 移除关于点击与引导完成的耦合，两端统一使用完成动作。
- REQ-003: 高亮使用标签垂直范围，上下各外扩 3px、左侧 4px，视口边缘仍裁切保护。
- REQ-004: Portal 显式接收当前主题 tokens；强调边框、标题、进度和下一步按钮。

## Acceptance
- AC-001 [REQ-001]: 步骤顺序与工具栏一致；底部按钮可重新启动并完成后闪烁。
- AC-002 [REQ-002]: 点击完成不打开关于；之后仍可在关于中重新开始。
- AC-003 [REQ-003]: 工作区上下间隔一致，左侧与原选中框分离；普通目标仍保持内缩描边。
- AC-004 [REQ-004]: 深浅色和赛博的卡片与当前主题一致，赛博黄色重点清晰，内容可读。

## Implementation plan
1. 调整步骤、footer 和最后一步控制，删除 utility rail 的完成回调。
2. 根据标签高度定位工作区高亮，添加等距边界测试。
3. 为 Portal 添加主题作用域和主题强调 tokens，增加主题与流程测试。
4. 浏览器检查主题和底部入口，运行完整检查与构建。

## Verification
- pnpm check 通过：1088 前端用例通过、2 既有跳过，17 Node 用例通过；lint、source-size 与桌面前端构建通过。
- Demo 39 用例通过，最终 pnpm build、pnpm build:site、pnpm check:site 通过。
- 浏览器验证赛博黄色主题强调、浅色切换、工作区等距高亮、底部入口和完成流程；修正主题 scope 的透明底色覆盖，气泡使用不透明面板背景。
- 客户端不打开关于直接完成、之后手动重看由共享流程测试覆盖；本轮未启动原生桌面程序。
