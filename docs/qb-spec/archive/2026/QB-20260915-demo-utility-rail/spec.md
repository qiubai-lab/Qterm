---
schema: 1
id: QB-20260915-demo-utility-rail
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Demo 共享工具栏与精简 MOTD

## Requirements

- REQ-001: 移除 MOTD 中自动展示的 help 内容，手动 help 命令保留。
- REQ-002: Demo 右侧同步桌面九个按钮的名称、图标、顺序及上下布局，仅展示，不接入操作。
- REQ-003: 抽取共享组件，桌面端原回调、锁定禁用、选中和更新提示保持不变。

## Behavior Delta

### MODIFIED
- REQ-001: 启动自动帮助改为简短标题及提示符。
- REQ-002: 三个可操作 Demo 工具改为九个纯展示产品工具；终端标题栏原功能入口保留。
- REQ-003: 桌面内部工具按钮移至 WorkspaceUtilityRail，由调用者传 controls。

## Acceptance

- AC-001 [REQ-001]: 启动不包含可体验命令，手动 help 可用，历史和目录不受影响。
- AC-002 [REQ-002]: 九项按连接、凭证、文件、网络、Git、终端、锁定、设置、关于排序，锁定之前留弹性间隔；Demo 无点击业务，使用 aria-disabled 标记。
- AC-003 [REQ-003]: 桌面 WorkspaceShell 原测试和共享工具栏回归通过，pnpm check 与站点检查通过。

## Implementation plan

1. 抽取 WorkspaceUtilityRail，集中工具定义与按钮展示，保留桌面调用者拥有状态和回调。
2. Demo 使用无 controls 的工具栏，移除原三项回调；简化终端启动输出。
3. 更新相邻行为测试和文档，降低 WorkspaceShell 源码基线至 598 行。
4. 完成前端、Demo、站点构建及浏览器验收后归档。

## Verification

- AC-001: terminalSession 相邻测试验证启动无帮助、手动 help 仍可用、历史和 cwd 正常；生产浏览器只显示标题和提示符。
- AC-002: 浏览器 1280×800 验证九项名称、顺序、上下分组及 aria-disabled=true；最后按钮底部 742px，小于工具栏底部 749px，全部可见。控制台无 warn/error。
- AC-003: pnpm check 全流程通过，包含 1074 个前端测试通过、2 跳过，17 个 Node 工具测试通过，ESLint、TypeScript 和生产构建通过。桌面 WorkspaceShell 测试保持通过；共享组件新增测试覆盖纯展示和桌面回调、选中、锁定禁用、更新提示。
- test:demo 26 个测试通过；build:site、check:site、diff whitespace 检查通过。源文件基线降至 598，source-size 复查无 ratchet 提醒。

全部计划完成。
