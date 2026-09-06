---
id: QB-20260906-app-shortcut-reduction
type: design
tier: standard
status: archived
created: 2026-09-06
updated: 2026-09-06
supersedes: []
---

# Application Shortcut Reduction

## Goal

将 Qterm 自定义应用级快捷键收敛为“切换到当前第 1–9 个 Workspace”和“搜索当前终端”两类，减少工作台组合键对终端程序及桌面环境的干扰。

## Scope

- 收窄应用级快捷键命令、解析规则、执行分支和展示标签。
- 更新相邻自动化测试与 README 快捷键说明。
- 保持终端、编辑器、Git feature-local 快捷键，以及菜单、树、列表和对话框的键盘可访问交互不变。

## Non-Goals

- 不引入可配置快捷键、全局系统快捷键、命令面板或新的快捷键 Hook。
- 不修改 Workspace、Block、终端会话或持久化模型。
- 不改写历史归档规格。

## Requirements

- REQ-001: 应用级快捷键仅支持按平台搜索当前终端与选择第 1–9 个 Workspace。
- REQ-002: 原有新建 Workspace、打开连接管理、横纵分割 Block、循环 Workspace、方向聚焦 Block 与循环 Block 组合键不再被应用层解析或拦截。
- REQ-003: 终端剪贴板与 macOS 单词导航、文件编辑器标准键、Git feature-local 键位及组件无障碍键盘交互保持不变。
- REQ-004: 应用界面与 README 不再展示已移除的应用级快捷键。
- REQ-005: 对话框、菜单、锁屏、可编辑控件和终端焦点下的既有快捷键隔离规则保持不变。

## Acceptance Criteria

- AC-001 [REQ-001]: macOS 的 `Command+F`、`Command+1..9` 与 Windows/Linux 的 `Ctrl+Shift+F`、`Ctrl+Shift+1..9` 解析并执行原有动作。
- AC-002 [REQ-002]: 所有被移除的应用级组合键解析为 `null`，且 WorkspaceShell 不再含对应执行分支。
- AC-003 [REQ-003, REQ-005]: TerminalPanel、CodeEditor、Git 和组件级键盘处理代码不因本变更修改，相关聚焦测试保持通过。
- AC-004 [REQ-004]: README 及新建 Workspace 的 UI 提示只呈现仍受支持的应用级快捷键。

## Behavior Delta

### MODIFIED

- REQ-001: 应用级快捷键由多类 Workspace/Block 操作收敛为搜索终端和数字选择 Workspace。

### REMOVED

- REQ-002: 移除新建 Workspace、打开连接管理、分割 Block、循环 Workspace、方向聚焦 Block 与循环 Block 的应用级快捷键。
- REQ-004: 移除对应的用户文档和 UI 快捷键提示。

## Quality

目标、非目标、保留不变量和可观察验收闭合；不存在需要独立评审的高影响歧义。

## Verification Evidence

- AC-001、AC-002：快捷键解析与 WorkspaceShell 聚焦测试通过，已移除组合键均不再触发应用命令。
- AC-003：TerminalPanel、CodeEditor 与相邻应用测试通过；对应生产实现未修改。
- AC-004：README 与新建 Workspace 提示已移除废弃快捷键，TypeScript 和生产构建通过。
- `pnpm check:source-size`：通过，`WorkspaceShell.tsx` 基线由 633 下调至 612，无 ratchet reminder。
- 全量 `pnpm test`：919/920 通过；`workspaceTabDeck.test.tsx` 在全量并发下超时，单独复跑对应文件 5/5 通过。该测试及其生产代码不在本次变更范围。
- `pnpm build` 与 17 个仓库脚本测试通过。

## Residual Risk

全量并发测试仍存在一个可重复出现、但隔离运行通过的既有时序波动；本次快捷键验收无未覆盖项。
