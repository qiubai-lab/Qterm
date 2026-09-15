---
schema: 1
id: QB-20260915-site-showcase
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# GitHub Pages 产品介绍页

## Goal

保留已确认的首屏文案，使用真实 Demo 截图讲清工作台特色，提升科技感与动态反馈，同时保持简洁、快速和可访问。用户已批准设计并授权实施。

## Scope

仅修改静态介绍页及其资源，不改桌面和 Demo 的业务组件。展示文件、网络、Git、自由工作区、OSC 7、远程 CLI Agent 资料暂存，以及选中终端输出导出图片。

## Requirements

- REQ-001: 保留首屏标题、摘要、行动按钮和平台说明原文，优化导航与视觉层次。
- REQ-002: 使用 Demo 实际截图，准确标注模拟环境与仅桌面支持的能力。功能展示顺序为文件、网络、Git。
- REQ-003: 使用终端选中内容导出图片展示替代主题展示。
- REQ-004: 支持首屏进场、一次性滚动显现和页签切换动效；支持键盘和 reduced-motion，禁用 JavaScript 时仍可阅读全部内容。
- REQ-005: 介绍页不加载 React、xterm 或桌面 IPC；资源在 GitHub Pages 子路径下可用，窄屏无横向溢出。

## Behavior Delta

### ADDED

- REQ-002, REQ-003: 真实截图、工作流程页签、特色能力示意与导出效果。
- REQ-004: 轻量渐进增强脚本与可访问的页签操作。

### MODIFIED

- REQ-001: 首屏布局、导航标志、微光网格与按钮动效。
- REQ-005: 公开资源由 Vite 处理基路径，避免占位符与 Vite 叠加造成双重 /Qterm/。

### REMOVED

- REQ-002, REQ-003: 旧的三张纯文字功能卡布局；不增加三主题展示。

## Acceptance Criteria

- AC-001 → REQ-001: 首屏原文保持一致。
- AC-002 → REQ-002, REQ-003: 五张实际截图可用，网络模拟与桌面专属说明准确。
- AC-003 → REQ-004: 点击和方向键/Home/End 可切换页签；减少动效下不启动动画；无脚本时全部内容可读。
- AC-004 → REQ-005: 执行 pnpm check、build:site、check:site；失败需定位复查并记录，桌面/窄屏检查无横向溢出。

## Implementation Plan

1. 从 Demo 捕获工作区、编辑文件、网络规则、Git 差异、选中内容导出预览。
2. 重构 site/index.html 与 src/site/site.css，沿用现有暗色语义 token。
3. site/public/site-interactions.js 只负责页签和一次性滚动显现，不引入依赖。
4. 相邻测试保护渐进增强、键盘导航及 reduced-motion；执行完整检查和站点构建。
5. 浏览器验证桌面与窄屏、所有截图和子路径，记录结果。

## Verification

- AC-001: 浏览器核对首屏原文、导航与 CTA 保留。
- AC-002: 五张 Demo 实际截图均已核对；生产 /Qterm/ 资源与静态脚本加载正常。
- AC-003: 新增 3 项行为测试通过；生产页面点击与 Home 键切换通过，390px/1440px 无横向溢出。
- AC-004: source-size、lint、桌面 build、build:site、check:site 通过。完整 pnpm check 中 1087 项通过、2 项跳过，4 项既有用例在默认并发下超过 5 秒；降低并发单独复查相关 4 个文件，37 项全部通过。Node 命令层 17 项通过。未修改超时阈值或业务测试。
- AC-004: Demo 独立配置下 13 个文件、39 项测试全部通过。
