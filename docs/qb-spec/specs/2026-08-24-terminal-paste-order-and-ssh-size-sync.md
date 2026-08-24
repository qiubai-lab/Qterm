## Goal

终端粘贴与紧随其后的键盘输入严格保持用户操作顺序，SSH PTY 从创建起就与当前 xterm 尺寸一致，不再在长提示符跨行后因左右键重绘产生文本、光标错位。

## Scope

- 在终端输入适配层串行化 xterm 输入，并让异步剪贴板读取在快捷键触发时占据输入顺序。
- 保留 xterm.js 对换行和 bracketed paste 的处理。
- 在发起 SSH 连接时读取当前 xterm 列数和行数，并通过 Tauri DTO 传递到 SSH PTY 创建请求。
- 保留新会话取得 `sessionId` 后的强制 resize，作为连接后布局变化与服务端兼容性兜底。
- 为输入越序、写入失败隔离、初始 PTY 尺寸和新会话尺寸同步增加回归测试。

## Constraints

- 不记录、缓存到持久化状态或输出剪贴板正文。
- 终端尺寸使用现有 domain `TerminalSize` 校验；传输 DTO 与 SSH request model 保持分离。
- 本地终端和 SSH 终端复用同一输入保序机制。
- 输入写入失败不能阻塞后续输入，终端 view 销毁后不得继续发送。

## Non-Goals

- 不升级或 fork xterm.js。
- 不改变多行/长文本粘贴确认规则。
- 不重构 Workspace 会话生命周期、文件会话或网络会话。
- 不增加新的视觉状态或依赖。

## Acceptance

1. `Ctrl/Cmd+V` 触发后，即使剪贴板读取尚未完成，后续按键也只能在粘贴内容之后写入 PTY。
2. 粘贴仍通过 `terminal.paste()`，保留换行归一化和 bracketed paste 行为。
3. 某次输入写入失败不会造成未处理的 Promise rejection，也不会阻塞后续输入。
4. SSH 终端连接请求携带连接瞬间重新测量的 xterm 列数和行数，后端用该尺寸直接创建 PTY，不再固定使用 `80×24`。
5. SSH 会话从无 `sessionId` 变为已连接时，即使尺寸与此前相同，也会向后端强制同步一次当前列数和行数。
6. 无效终端尺寸在 Tauri transport 边界被拒绝；文件和网络会话不需要提供终端尺寸。
7. 既有复制、粘贴确认、macOS 单词导航、本地终端和 resize 合并行为保持通过。

## Acceptance To Verification

- `TerminalPanel` 回归测试延迟剪贴板读取并模拟后续 `Ctrl+C` 数据，断言 writer 先收到粘贴文本。
- 输入调度器单元测试验证异步屏障、同步捕获、失败隔离和销毁行为。
- `resizeScheduler` 单元测试验证强制请求不会被同尺寸去重，包括已有请求正在发送的情况。
- `TerminalPanel` 测试验证 Workspace 注册的尺寸读取器会在连接前重新 fit，并返回当前 xterm 尺寸。
- `WorkspaceProvider` 与 Tauri adapter 测试验证 SSH connect 输入携带当前尺寸。
- Rust command/request 测试验证尺寸 DTO 校验，SSH request 测试验证 PTY 使用请求中的尺寸。
- `TerminalPanel` 回归测试验证连接取得新 `sessionId` 后强制请求当前尺寸。
- 运行聚焦 Vitest、Rust 测试、`pnpm check`、Rust fmt/clippy/test 和 `git diff --check`。

## Open Questions

无。新增复现条件表明粘贴内容本身正确，左右键触发 Readline 重绘后才错位；截图中的 50 字符提示符与 31 字符命令合计 81，直接跨过后端固定的第 80 列。

## Recommended Approach

方案 A（采纳）：保留输入调度器，并增加 SSH 初始尺寸握手。Terminal view 在连接瞬间提供重新测量后的尺寸，Workspace 只负责把值传给 Tauri，transport 校验后由 SSH infrastructure 在 `request_pty` 中使用。它从源头消除 shell 按错误列数初始化的竞态。

方案 B：只增强连接后的 `window-change` 重试。改动更小，但 shell 和 Readline 已经可能按 `80×24` 初始化，且 SSH window-change 没有应用层确认，不能消除初始竞态，不采用。

方案 C：只在 `WorkspaceProvider` 串行化 `writeBlock`。它能保证已经产生的写入顺序，却无法阻止剪贴板读取期间后续按键先产生，因此不能完整修复，不采用。

## Next Skills

- `writing-qb-plans`（Standard）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要；不改变长期产品或领域规则。
- Directory Map：不需要；只扩展既有终端、transport 和 SSH request 边界，不移动模块职责。
