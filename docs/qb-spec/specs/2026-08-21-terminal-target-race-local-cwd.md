# Terminal Target Race And Local CWD

## Goal

用户从失败或进行中的 SSH 连接切回本地终端后，只看到并使用新的本地 Shell；从本地终端打开当前文件夹时，开发版与发布版都使用终端的本地初始目录，而不是 Qterm 进程工作目录。

## Scope

- 终端目标切换立即使旧认证解析、旧关闭操作、旧 SSH 事件和旧失败回调失效。
- 自动认证在异步边界后复核 Block 当前目标，不为已经切走的配置继续连接或弹出认证。
- 本地 PTY 明确从用户主目录启动，并通过本地会话连接 DTO 返回规范化初始目录。
- 本地终端尚未收到 OSC 7 时使用后端返回的绝对初始目录；后续合法 OSC 7 仍可更新当前目录。
- 增加认证竞态、会话关闭竞态和本地目录回归测试。

## Constraints

- 会话 generation、当前目标和失败回调归 `WorkspaceProvider` 编排，不进入展示组件。
- 本地主目录解析和 PTY 初始目录归 Rust 本地基础设施/command adapter。
- 不改变远程 SSH、SFTP 的路径语义，不持久化 session id 或运行时 CWD。
- 保持现有终端标题栏布局、交互和可访问名称。

## Non-Goals

- 不在本次扩展完整的 zsh、fish、PowerShell shell integration。
- 不修改 workspace schema、连接配置或凭证存储格式。
- 不重构文件浏览器或 SSH backend。

## Acceptance

1. SSH 自动认证或连接仍在进行时切换到本地，旧请求不能启动、关闭、覆盖或标记本地会话为失败。
2. 切换目标后到达的旧 SSH failed/close 回调不能打开认证框，也不能消费新连接的失败处理器。
3. 本地 PTY 从用户主目录启动，前端保存后端返回的绝对初始目录。
4. 本地终端标题栏文件夹按钮不再把 `.` 传给本地文件浏览器；开发版和发布版均不依赖应用进程 CWD。
5. 已连接 SSH、远端文件浏览和合法 OSC 7 更新行为不回归。

## Acceptance To Verification

- 1、2：`WorkspaceProvider` 与 `WorkspaceShell` 延迟 Promise/晚到事件组件测试。
- 3：Rust `LocalSessionManager`/command 单元测试与 TypeScript IPC client 测试。
- 4：`LayoutView` 与 `WorkspaceProvider` 测试断言绝对本地路径。
- 5：相关聚焦测试、`pnpm check`、Rust fmt/clippy/test。

## Open Questions

- 无。用户已采纳 generation + 后端绝对初始 CWD 的稳健方案。

## Recommended Approach

以 Block 当前目标和单调 epoch 作为会话提交条件：目标切换先更新意图并同步清空旧 Runtime，异步关闭只关闭捕获到的旧 session；所有认证与连接结果在提交前复核目标/epoch。Rust 本地 PTY 解析、规范化并设置用户主目录，连接 DTO 同时返回 session id 与绝对 CWD。相比只隐藏 `failed` 或只把 `.` 改为 `~`，该方案同时消除真实会话串线和发布环境路径依赖。

## Next Skills

- `writing-qb-plans`（Strict）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（不改变目录、模块所有权或持久化入口）
