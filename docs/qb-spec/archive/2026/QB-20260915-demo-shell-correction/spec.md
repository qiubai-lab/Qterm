---
schema: 1
id: QB-20260915-demo-shell-correction
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Demo 窗口风格与启动说明修正

## Requirements

- REQ-001: 恢复 macOS 交通灯及品牌区域，继续使用产品 WorkspaceTabs。
- REQ-002: 外层页面保持赛博基底的固定样式，三主题只改变内嵌工作台；保留滑动选择与减少动态效果支持。
- REQ-003: 每个新终端在提示符前直接显示 help 完整内容，不能污染命令历史或改变目录。

## Behavior Delta

### MODIFIED
- REQ-001: 上次精简移除的 macOS 装饰恢复。
- REQ-002: 全页面主题切换改为固定页面、可切换工作台。
- REQ-003: “输入 help 查看命令”替换为实际 help 内容。

## Acceptance

- AC-001 [REQ-001]: 桌面及手机显示三色交通灯，不进入焦点序列，工作区标签仍可用。
- AC-002 [REQ-002]: 切换三主题时页面、导航、主题按钮容器背景和文字色不变；工作台 token 和 xterm 主题变化，手机无横向溢出。
- AC-003 [REQ-003]: 初始输出包含 help 内容，提示符和 cwd 正常，上箭头不会召回自动执行的 help。

## Implementation plan

1. 恢复 DemoWorkbench macOS 标识、装饰及 CSS。
2. 复用三套 token 的 data-demo-theme 作用域；DemoApp 固定 cyberpunk，DemoWorkbench 根据主题变化。root 保留当前主题以供现有 xterm renderer 与 portal 使用。
3. terminalSession.start 读取同一命令帮助输出；增加启动与历史回归测试。
4. 运行 test:demo、pnpm check、站点构建及浏览器桌面/手机验收，记录结果后归档。

## Verification

- AC-001: 浏览器 1280×720 与 390×844 均显示三灯，aria-hidden=true，不进入焦点顺序；macOS 品牌与工作区标签布局恢复，手机无横向溢出。
- AC-002: 浏览器实测 cyberpunk → light，页面背景始终 rgb(7,9,13)，导航、主题容器和 caption 的计算颜色不变；工作台 canvas 从 #07090d 变为 #f3f5f4，再切深色变为 #090a0c。xterm 文字与工作台同时变化。控制台无 warn/error。
- AC-003: 浏览器启动直接显示可体验命令、日志与编辑快捷键；相邻测试验证与 help 输出一致，cwd 保持不变且上箭头不召回 help。
- test:demo：10 个文件、26 个测试通过；完整前端测试 1072 通过、2 跳过，Node 工具测试 17 通过。
- 源码大小、ESLint、TypeScript、站点生产构建和 check:site 通过；没有新增依赖或原生打包改动。

- pnpm check 全流程通过，包含桌面前端生产构建。所有实施步骤完成。
