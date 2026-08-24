# 终端 P0 键盘、搜索与会话操作实施计划

Status: Complete (2026-08-24)

Plan Level: Standard

## Requirement

实现 `2026-08-24-terminal-p0-interactions.md` 中定义的安全快捷键、终端搜索、活动终端焦点同步和会话生命周期入口。

## Scope

包含跨平台命令解析、终端搜索 UI、焦点注册/恢复、终端会话取消/断开/重连，以及相邻测试和用户文档。排除快捷键自定义、命令面板、Shell Integration 和后端改动。

## Affected Files

- `src/app/shortcuts.ts` 及测试：纯函数快捷键映射和标签。
- `src/terminal/TerminalPanel.tsx`、`terminalSurface.css` 及测试：搜索 addon、搜索 UI、焦点注册和终端安全按键。
- `src/terminal/terminalViewRegistry.ts`：按 Block 暴露终端聚焦与搜索入口。
- `src/workspace/WorkspaceShell.tsx`、`LayoutView.tsx`、`TerminalTargetPicker.tsx`、`WorkspaceProvider.tsx` 及测试：命令执行、焦点编排，以及终端/文件/网络会话动作。
- `src/workspace/blockNavigation.ts` 及测试：基于布局几何选择相邻 Block。
- `src/components/HostIdentity.tsx`、`ConnectionRouteProgress.tsx` 及测试：目标主机概要中的远程断开入口、固定宽度复制状态和连接进度旁动作。
- `src/components/Icon.tsx`：搜索与断开图标。
- `package.json`、`pnpm-lock.yaml`：xterm 搜索 addon。
- `README.md`：平台快捷键与功能描述。

## Design

- 快捷键解析器只把规范化 KeyboardEvent 转成命令，不持有 React 或 Workspace 状态。
- WorkspaceShell 在捕获阶段执行应用命令，使安全组合键能先于 xterm 输入处理；弹窗、锁屏和真实表单编辑继续阻断相应命令。
- TerminalPanel 持有 SearchAddon 与搜索 UI；上下文菜单和终端快捷键调用同一个打开动作；浮层以 Terminal Block 为空间锚点居中，使用主输入/次导航层级和无回弹入场反馈。
- TerminalPanel 注册按 blockId 聚焦的公共适配，WorkspaceShell 仅在活动对象变化且旧焦点不属于新 Block 时请求聚焦。
- LayoutView 只表达会话动作状态和位置：右上角保留搜索，终端/文件/网络远程断开进入 HostIdentity，重连/启动/取消贴近状态；WorkspaceShell 按会话所有者确认和路由；WorkspaceProvider 负责三类会话的实际关闭与本地重启。

## Acceptance To Verification

| Acceptance | Planned verification |
| --- | --- |
| A1-A2 快捷键安全 | 新增解析器单测；扩展 WorkspaceShell 测试验证捕获、锁定和表单排除。 |
| A3 搜索 | 扩展 xterm mock 与 TerminalPanel 测试；断言 SearchAddon 方向、计数、关闭和 focus。 |
| A4 焦点 | 测试活动 Workspace/Block 变化时的 focus 请求，确保文件/网络不抢焦点。 |
| A5 会话 | HostIdentity/TerminalTargetPicker/LayoutView 测试动作位置和状态；WorkspaceShell 测试确认弹窗；Provider 测试本地 restart/remote disconnect。 |
| A6 文档提示 | `rg` 检查硬编码提示和最大化描述；`pnpm check`。 |

## Test / Verification

1. 先运行新增/修改的快捷键、TerminalPanel、LayoutView、WorkspaceShell、WorkspaceProvider 聚焦测试。
2. 运行 `pnpm lint` 与 `pnpm typecheck`。
3. 运行 `pnpm check` 作为前端完整质量门禁。
4. 检查 `git diff --check`，并确认未覆盖工作区中既有的主题/对比度改动。

## Documentation Updates

- 更新 README 常用操作和 Workspace 功能描述。
- 完成后在 task spec 记录 Verification Evidence。

## Next Skills

- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed；新增文件仍属于现有 workspace/terminal 模块职责。
