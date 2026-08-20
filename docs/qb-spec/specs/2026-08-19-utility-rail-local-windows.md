# Utility Rail Local Windows

## Goal

右侧工具栏以明确、低干扰的文字标签提供常用入口，并让文件与终端入口始终创建本地窗口。

## Scope

- 文件管理按钮每次点击都在当前活动块旁创建本地文件窗口，初始路径为 `.`。
- 新增打开终端按钮，每次点击都在当前活动块旁创建本地终端。
- 五个入口显示“链接管理 / 文件管理 / 打开终端 / 系统设置 / 系统帮助”的小号说明文字。
- 保持连接、设置、帮助弹窗的现有开关行为。

## Constraints

- 工具栏只触发 workspace action，不承载连接或布局业务判断。
- 不改变终端标题栏从当前会话打开远端文件目录的现有能力。
- 标签应可读但不抢占工作区视觉重点。

## Non-Goals

- 不修改文件浏览器、终端运行时或连接认证流程。
- 不增加新的 Tauri IPC 或持久化 schema。

## Acceptance

1. 点击“文件管理”始终 dispatch 本地文件窗口 action，不继承活动 SSH 终端的 profile 或 cwd。
2. 点击“打开终端”始终 dispatch 本地终端分割 action。
3. 工具栏完整显示五个指定标签，并保留设置、帮助的底部分组。
4. 工具栏样式紧凑，标签字体小于主界面常规字号，并有 hover / active / focus 可用状态。

## Acceptance To Verification

- 1、2、3：`WorkspaceShell` 组件测试和 `openFileWindowAction` 单元测试。
- 4：样式契约测试及聚焦页面检查（环境允许时）。
- 全部：`pnpm check`。

## Open Questions

- 无。将“打开窗口”解释为每次创建新的本地块，使按钮行为稳定且可预测。

## Recommended Approach

保留既有 reducer action：文件入口通过纯 action helper 固定生成本地文件参数，终端入口复用 `splitBlock`（其节点默认本地）。相比在 UI 中检查 runtime 或复用现有块，这一方案状态依赖更少、测试边界更清晰。

## Next Skills

- `writing-qb-plans`（Standard）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（无目录、模块或入口职责变化）
