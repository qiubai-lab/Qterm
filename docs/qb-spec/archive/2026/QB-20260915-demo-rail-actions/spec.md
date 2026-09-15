---
schema: 1
id: QB-20260915-demo-rail-actions
type: design
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Demo 工具栏基础操作

## Requirements

- REQ-001: 文件、网络、Git、打开终端四项复用现有 mock 与产品工作区操作。
- REQ-002: 连接、凭证、锁定、设置、关于暂不实现，显示禁用状态及悬停提示。

## Behavior Delta

### MODIFIED
- REQ-001: 四项按钮从纯展示改为可操作。
- REQ-002: 其余按钮增加 native disabled，保留 aria-disabled，以可配置 title 显示“暂未开放演示”。

## Acceptance

- AC-001 [REQ-001]: 四项分别打开共享文件、网络、Git 面板或新增模拟终端，不创建新的功能实现分支。
- AC-002 [REQ-002]: 其余五项不能触发操作；共享 tooltip 可展示提示，桌面已有 controls 的行为保持不变。

## Implementation plan

1. DemoWorkbench 给四项传入现有 actions，打开终端使用 splitTerminalBlock。
2. WorkspaceUtilityRail 为缺少 controls 的按钮提供 disabled 和可选 unavailableTitle，复用既有禁用 CSS 与 tooltip。
3. 更新相邻禁用回归测试，运行 pnpm check、test:demo、站点构建与浏览器验证后归档。

## Verification

- AC-001: 生产浏览器逐项点击四个按钮，文件打开 /home/demo/qterm 列表，网络展示三条种子规则，Git 展示预置更改，打开终端新增开发服务器会话；控制台无 warn/error。
- AC-002: 五项在浏览器 accessibility tree 中均 disabled 且带说明；共享组件测试验证 native disabled、title 和真实 tooltip provider 的 pointer-over 提示。桌面原有操作回归通过。
- test:demo 26 个测试通过；完整前端测试 1074 个通过、2 个跳过，Node 工具测试 17 个通过。随后追加 hover 测试，工具栏相邻测试 3 个全部通过。
- 源码大小、ESLint、TypeScript、build:site、check:site 与 diff whitespace 检查通过。

- pnpm check 全流程（含桌面前端生产构建）通过，全部实施步骤完成。
