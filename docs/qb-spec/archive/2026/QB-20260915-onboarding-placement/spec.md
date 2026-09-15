---
schema: 1
id: QB-20260915-onboarding-placement
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# 引导定位与入口精简

## Requirements
- REQ-001: Demo 重看入口放在页面 header 右侧；关于弹窗入口复用 headerActions，移除重复说明。
- REQ-002: 欢迎卡片居中于画布，后续卡片移动到目标附近，窗口边界避让；尊重 reduced-motion。
- REQ-003: 高亮外扩 8px，窗口顶部容不下间距时使用上方开口边框，只修改引导层。
- REQ-004: 终端连接选择和操作按钮分为两步，两端共享。

## Behavior Delta
### MODIFIED
- REQ-001: 重看入口位置变化，首次触发、持久化和完成闪烁行为保持原规则。
- REQ-002: 固定右下角改为画布居中与目标附近自动定位；目标隐藏时回退居中说明。
- REQ-003: 贴顶高亮采用开口上边缘，不改变工作区布局或按钮样式。
- REQ-004: 引导由七步扩为八步，分别定位连接名称与按钮区域。

## Acceptance
- AC-001 [REQ-001]: 两端重看按钮可使用，关于不再显示冗余说明。
- AC-002 [REQ-002]: 欢迎中心匹配画布；顶部和右侧入口附近出现气泡，窄屏不越界。
- AC-003 [REQ-003]: 贴顶高亮不在标签上方挤出紧邻边框，既有工作区样式无修改。
- AC-004 [REQ-004]: 两个终端步骤分别高亮左侧连接与右侧按钮，跳过/回退/完成仍可用。

## Implementation plan
1. 调整 Demo 和关于的现有重看按钮插槽。
2. onboarding 独立维护纯几何计算、目标测量和卡片定位；单模块低于默认源文件上限。
3. 拆分终端内容，通过已有终端锚点定位内部组件，不增加布局包装。
4. 添加定位边界测试，执行共享引导回归、完整检查和浏览器验证。

## Verification
- 共享引导与几何边界测试通过；两端共用八步内容。
- 浏览器验证 1280×720、390×780：欢迎居中、终端两个区域独立高亮、卡片移动与隐藏入口回退可用。桌面贴顶开口由纯几何测试保护，本轮未启动原生桌面程序。
- 默认 pnpm check 出现工作区预览与 Git 解析加载超时；额外发现右键菜单测试需要明确已看过引导的用户前提，已修正该 fixture。
- pnpm exec vitest run --maxWorkers=2：1084 通过、2 跳过；Demo 35 通过；Node 脚本 17 通过。
- pnpm lint、pnpm build、pnpm build:site、pnpm check:site、pnpm check:source-size 全部通过；source-size 无 ratchet 提醒。构建保留既有大 chunk 提醒。
