---
schema: 1
id: QB-20260915-demo-presentation
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# 在线体验页面精简与默认场景

用户明确要求默认开发服务器、网络 mock 内容、移除网络常驻模拟提示、默认赛博主题和居中滑动主题选项，以及简洁精致的 header 与页面排布。本变更沿用共享产品面板，不恢复 Demo 功能页面分叉。

## Requirements

- REQ-001: 默认场景自动连接开发服务器，刷新恢复初始虚构状态；保留显式 local 场景供测试。
- REQ-002: 开发目标默认包含本地转发、远程转发和 SOCKS5 三条可编辑、启停的演示规则；默认停止，reset 恢复种子数据；移除 NetworkPane 常驻模拟提示。
- REQ-003: 移除试一试、命令快捷按钮、主题 label/下拉框、体验指南等页面操作；以居中三选项按钮提供深色、浅色、赛博主题，首次加载即赛博。
- REQ-004: 主题选中背景滑动，主要表面颜色平滑变化；键盘方向键和焦点可用，reduced-motion 禁止过渡；窄屏保留 Block 切换能力。
- REQ-005: 精简站点 header 和工作台装饰，增大实际工作空间，共享桌面面板及其行为不变。

## Behavior Delta

### MODIFIED
- REQ-001: 默认本地终端改为开发服务器。
- REQ-002: 空网络列表改为三类种子规则，取消 NetworkPane 常驻说明。
- REQ-003: 复杂工具栏改为居中主题选项，默认深色改为赛博。
- REQ-004: 原 select 即时切换改为可中断的选中背景滑动与表面颜色过渡。
- REQ-005: 大间距说明/装饰外壳改为紧凑 header 与大工作台。

## Acceptance

- AC-001 [REQ-001, REQ-002]: 默认 workspace profile 为开发服务器，网络三类规则可加载并恢复；新增/删除状态不污染其他目标。
- AC-002 [REQ-003, REQ-004]: 仅三个居中主题选项，默认赛博；点击及左右键改变主题/选中项，滑动背景无初始飞入，reduced-motion 无过渡。
- AC-003 [REQ-003, REQ-005]: 页面无试一试、命令按钮、主题 label、体验指南与重置/连接工具栏；NetworkPane 无指定提示；原有文件/Git/网络入口可用。
- AC-004 [REQ-004, REQ-005]: 1280 与 390 宽度无横向页面溢出，手机可切换 Block，主题与工作台层级清晰；pnpm check、test:demo、build:site、check:site 通过。

## Implementation plan

1. 修改默认场景、HTML/启动主题和网络种子；更新隔离及 reset 测试。
2. 将 DemoToolbar 收敛为主题分段控件及手机 Block 选择器；精简 DemoApp/DemoWorkbench，移除 guide 和多余操作。
3. 重排 Demo CSS：轻量品牌 header、居中主题条、大工作台；选中背景 transform 过渡及 scoped 表面颜色过渡；reduced-motion 降级。
4. 验证主题键盘/默认场景/网络种子与共享面板回归；浏览器检查桌面和手机，记录证据并归档。

## Implementation and verification

- AC-001: workspaces 默认 profile 为 demo-development；settings、入口 HTML 和 main 均默认 cyberpunk。networkFixtures 返回新对象，网络 reset 重建三类规则。相邻测试覆盖目标隔离、删除恢复和新增清理。
- AC-002: DemoToolbar 使用 radio group、roving tabindex 和方向键/Home/End；选中背景 transform 280ms，表面颜色 240ms；初始 transform 直接处于选中位置，reduced-motion 关闭过渡。主题色点复用已有令牌。主题点击和键盘切换测试通过。
- AC-003: DemoApp/DemoWorkbench 删除命令快捷入口、指南、额外连接/重置操作及交通灯；连接管理仍可从产品目标菜单访问。NetworkPane 删除指定常驻说明，保留产品面板。共享面板测试覆盖种子展示及规则创建/启停回调。
- AC-004: 生产预览浏览器验收 1280×720（页面 scrollWidth 1280、scrollHeight 720、主题中心 x=640）和 390×844（scrollWidth 390）。验证开发服务器自动连接、三个网络实例、模拟启停、三主题点击/键盘、手机终端/网络视图切换、刷新恢复默认；控制台无 warn/error。
- test:demo：10 个测试文件、25 个测试通过。
- pnpm check 全流程通过（含 TypeScript 和桌面前端生产构建）。完整前端测试：171 个文件通过，1071 个测试通过、2 个跳过；Node 工具测试 17 个通过。源码大小与 ESLint 检查通过。
- build:site 与 check:site 通过，浏览器/桌面产物边界保持隔离。构建保留已有的大 chunk 提示。

所有计划步骤完成；本变更不涉及原生依赖或打包配置，无需桌面安装包构建。
