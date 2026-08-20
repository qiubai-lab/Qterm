## Requirement

新增终端缓冲清除按钮，消除重复连接同一远程终端时旧缓冲被重复追加的问题，并修复 Windows ConPTY 会话在前端清理后继续输入时的异常空行和光标错位。

## Scope

扩展前端终端视图注册契约、会话启动编排和终端头部动作；Windows 本地终端通过已有 PTY 输入通道执行 `cls`，不修改 Rust 会话接口或文件窗口。

## Affected Files

- `src/components/Icon.tsx`
- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/workspace/WorkspaceProvider.tsx`
- `src/workspace/WorkspaceProvider.test.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src-tauri/src/infrastructure/local/pty.rs`（仅 Windows PTY 回归验证）

## Design

在现有 writer 注册中同时提供 `clear` 控制回调，并复用同一 ownership token 管理清理。Provider 暴露 `clearBlockBuffer(blockId)` 并同步删除未回放输出。Windows ConPTY 本地会话的手动清理经现有 writer 发送 Escape + `cls`，先放弃未执行输入，再让 Shell 与 ConPTY 共同更新屏幕和光标；不再只调用会重置 xterm 行坐标的 `terminal.clear()`。远程或非 Windows 会话保留普通 buffer clear；`startLocalBlock` 和 `connectBlock` 在启动新会话前使用完整 reset。

新增语义明确的清除图标，沿用 `.block-actions` 的 25×23 像素图标按钮样式。

## Acceptance To Verification

- 头部入口：LayoutView 行为测试断言按钮和 block 路由。
- Windows 同步清除：TerminalPanel 测试断言 ConPTY 本地会话发送 Escape + `cls` 且不直接调用 `terminal.clear()`。
- 其他终端清除：TerminalPanel 测试断言远程或非 Windows 会话仍调用 `terminal.clear()`。
- 新会话边界：Provider 测试断言 SSH 连接调用之前已清除旧缓冲。
- 生命周期隔离：Provider 测试断言旧注册 cleanup 不移除新 clearer。

## Test / Verification

1. 先新增 Windows ConPTY 清理路由的失败回归测试。
2. 实现 Windows PTY 同步清屏，同时保留其他终端和新会话的既有清理行为。
3. 运行三个相关测试文件。
4. 运行 Windows 本地 PTY 聚焦测试，确认清屏输入后 CMD 与 PowerShell 均发出同步清屏序列并仍可执行命令。
5. 运行 `pnpm check` 和 `git diff --check`。

## Documentation Updates

新增本 task spec 和 Standard plan；无目录或长期架构变化，无需更新 Directory Map 或长期项目上下文。
