# Independent File Window Connections

## Goal

文件窗口采用与终端窗口一致的连接选择交互，但独立拥有本机或远程 SFTP 目标；终端文件夹按钮与右侧“文件传输”入口只负责打开合适的文件窗口。

## Scope

- `files` 布局节点持久化 `profileId` 与当前路径，不再持久化来源 Terminal Block。
- 文件窗口标题栏复用终端连接选择器的布局和状态样式，主图标改为文件夹。
- 文件窗口可选择本机或任意远程连接配置；远程目标通过一次性认证建立仅用于 SFTP 的 SSH 会话。
- 终端标题栏文件夹按钮以该终端的 profile 与当前工作目录初始化新文件窗口。
- 右侧“文件传输”按钮：活动 Block 是终端时按其 profile/CWD 打开；活动 Block 已是文件窗口时保持该窗口；没有可用活动终端上下文时打开本机文件窗口。
- 文件 Block 关闭、Workspace 关闭或目标切换时，关闭其独立远程会话。
- Workspace schema v3 迁移到 v4；旧文件节点根据 `sourceBlockId` 引用的终端 profile 推导目标，无法推导时降级为本机。

## Constraints

- session id、认证信息和 host-key prompt 不得持久化。
- 本机文件浏览不创建本地 PTY；远程文件浏览不请求远程 PTY 或 shell。
- 文件浏览仍为只读，不扩大文件系统写权限。
- transport DTO 不泄漏 `russh`/SFTP 类型，连接配置仍只引用 profile id。
- 已知主机密钥变化继续阻断；未知主机密钥仍需明确确认。

## Non-Goals

- 上传、下载入口的重新设计以及删除、重命名、新建目录等写操作。
- 在一个文件 Block 内同时维持多个远程连接。
- 保存密码、口令、SSH session 或恢复应用重启前的连接状态。

## Acceptance

1. 文件窗口标题栏与终端目标选择器视觉一致，显示文件夹图标，并可选择本机或任意远程 profile。
2. 文件窗口选择本机后无需终端 session 即可浏览；选择远程 profile 后完成认证即可通过该文件 Block 自有 session 浏览 SFTP。
3. 终端文件夹按钮打开以当前终端 profile/CWD 初始化的文件窗口，之后两者连接生命周期互不依赖。
4. 右侧文件传输按钮遵守活动终端优先、活动文件窗口不重复创建、无终端上下文时本机降级的规则。
5. 关闭文件 Block、关闭 Workspace 或切换文件目标会关闭其自有远程 session，不影响终端 session。
6. v3 Workspace 文件可迁移到 v4；保存结果不包含 `sourceBlockId`、session id 或凭据。
7. 远程 Files 会话不申请 PTY/shell，只允许 SFTP 目录与传输控制。

## Acceptance To Verification

- 1、3、4：连接选择器、LayoutView、WorkspaceShell/纯入口策略组件测试。
- 2、5：WorkspaceProvider 与 FileBrowserPane 回归测试、IPC mock 断言。
- 6：TypeScript contract、Rust workspace command/domain/repository v3 migration 测试。
- 7：Rust session purpose/control 单元测试及现有真实 SSH ignored 测试边界。
- 全部：`pnpm check`、Rust fmt、Clippy 与全量测试。

## Open Questions

- 无阻塞问题。远程初始路径沿用终端 CWD；右侧入口无远程上下文时使用 `.` 作为本机路径。

## Recommended Approach

采用 file-owned runtime 与显式 `Terminal | Files` SSH session purpose。这样既复用现有 host-key、认证和 SFTP infrastructure，又避免把 PTY 写入/resize 能力暴露给文件窗口；可持久化节点只保存 profile/path，运行时 session 严格按 Block 隔离。

