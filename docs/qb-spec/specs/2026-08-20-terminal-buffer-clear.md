## Goal

用户可以清除当前终端的显示与回滚缓冲；Windows 本地终端清理后，PowerShell 与 CMD 继续输入和执行命令时不会出现异常空行或光标错位；每次建立新的本地或远程终端会话时，不会把新输出追加到同一目标的旧会话缓冲后。

## Scope

- 在终端窗口头部右侧增加常驻图标按钮，提供清除当前终端缓冲区的操作。
- 终端视图向 Workspace 会话编排层注册清除能力，并与 writer 使用相同的实例所有权。
- Windows ConPTY 本地会话通过 Shell 的 `cls` 清屏完成手动清理，避免只重写 xterm 缓冲造成前后端光标状态分叉。
- 新终端会话开始连接前清除旧视图和尚未回放的输出缓存。
- 覆盖手动清除、新会话清除及旧视图清理不影响新视图的回归测试。

## Constraints

- 复用现有 xterm、Icon 和紧凑头部按钮样式，不增加依赖或确认弹窗。
- Windows 本地终端的手动清除先发送 Escape 放弃当前未执行输入，再通过 PTY 执行 CMD 与 PowerShell 均支持的 `cls`；不重置终端模式、不关闭会话。其他终端保持 xterm buffer clear；新会话开始前允许重置已结束会话的 xterm 状态。
- 会话启动前同步执行清除，避免新输出到达后再清除造成内容丢失。

## Non-Goals

- 不清除远程 Shell 历史文件或本地命令历史。
- 不持久化终端缓冲，也不新增自动定时清理。
- 不调整文件窗口或后端 PTY/SSH 协议。

## Acceptance

- 每个终端头部存在带清晰 tooltip/aria-label 的清除图标按钮。
- 点击按钮后，当前 xterm 回滚缓冲被清除，连接保持不变。
- Windows 本地 PowerShell/CMD 清理后继续输入命令，前端与 ConPTY 的光标位置保持同步，不产生由 `terminal.clear()` 引起的大段空行或显示错位。
- 对同一远程目标重复建立新会话时，旧欢迎信息不会与新会话输出重复叠加。
- 旧 TerminalPanel 的卸载清理不会注销新 TerminalPanel 注册的清除能力。

## Acceptance To Verification

- `LayoutView` 测试验证按钮存在且调用当前 block 的清除动作。
- `TerminalPanel` 测试验证 Windows ConPTY 本地会话发送 Escape + `cls`，且不直接调用 `terminal.clear()`；非 Windows/远程终端仍映射到 `terminal.clear()`。
- Windows `portable-pty` 测试验证默认 CMD 与切换后的 PowerShell 都发出清屏、光标归位及滚动区清理序列，并且清理后仍可执行命令。
- `WorkspaceProvider` 测试验证远程连接前先清除，并验证清除能力的实例所有权。
- 聚焦测试及 `pnpm check` 验证整体回归。

## Open Questions

无。

## Recommended Approach

由 TerminalPanel 注册终端清除回调，WorkspaceProvider 统一拥有“清除当前 block 缓冲”的编排入口。Windows ConPTY 本地终端的手动清理发送 Escape + `cls`，由 PowerShell/CMD 经 PTY 产生清屏与光标归位输出；其他终端保留 xterm clear。新会话启动继续使用完整 reset。这样既避免 Windows 两套屏幕状态分叉，也不扩大 Rust PTY 接口。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed
