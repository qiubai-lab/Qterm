---
schema: 1
id: QB-20260915-onboarding-inset
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# 紧凑引导高亮

## Requirements
- REQ-001: 两端高亮不依赖外部容器间距，贴边时保留完整描边，允许轻微覆盖目标。
- REQ-002: 工作区框选实际标签与新建入口，排除空白伸展区域，不改产品控件布局。

## Behavior Delta
### MODIFIED
- REQ-001: 外扩 8px、2px 边框及外侧光晕改为内缩 2px、1px 完整描边和轻透明填色，移除顶部开口特例。
- REQ-002: 在引导目标测量中合并实际可见标签、新建入口和滚动按钮边界；标签按滚动视口裁切。

## Acceptance
- AC-001 [REQ-001]: 上下左右贴边、部分可见及小尺寸目标的描边尺寸非负并保持在视口内。
- AC-002 [REQ-002]: 空白标签栏不计入高亮，滚出视口的标签区域被排除；两端共享实现。

## Implementation plan
1. 调整引导几何计算和专属 CSS，移除开口标记。
2. 在目标测量层收紧工作区范围，不触碰工作区与终端 CSS。
3. 补充贴边及标签裁切回归测试，执行全量检查和浏览器验证。

## Verification
- 共享引导与工作区预览定向回归 16 项通过（maxWorkers=2）。
- pnpm check：source-size、lint 通过；全量 1085 通过、2 跳过，workspaceTabDeck 的既有 5 秒超时失败，单独复跑通过；未修改超时阈值。
- pnpm build、pnpm build:site、pnpm check:site 通过，保留既有大 chunk 提醒。
- 浏览器确认工作区紧凑框选、连接名称与右侧文件工具的细描边，透明覆盖不遮挡文字；原生窗口贴边由几何测试覆盖，本轮未启动原生应用。
