---
id: QB-20260819-terminal-file-browser
status: archived
archived: 2026-09-02
legacy: true
---
# Terminal File Browser

## Goal

用户可以从 Terminal Block 标题栏打开该终端当前目录，并在工作区内部的文件窗口中浏览本地或远程文件。

## Scope

- Terminal Block 标题栏右侧增加文件夹按钮。
- 终端运行时接收 OSC 7 并保存当前工作目录；本地终端以应用当前目录为初始目录，SSH 终端以远程 home (`~`) 为降级初始目录。
- 工作区布局新增可持久化的 `files` 叶子节点，并在当前终端右侧打开。
- 文件窗口提供面包屑路径、返回上级、刷新、目录优先排序和双击进入目录。
- 本地目录由 Rust 本地文件系统 adapter 读取；远程目录在已有 SSH 连接上使用独立 SFTP channel 读取。

## Constraints

- 远程目录浏览使用 SFTP，不使用缺少目录枚举语义的 SCP。
- session id、终端输出和凭据不得持久化。
- 文件窗口只引用来源 Terminal Block；来源连接断开后显示可恢复错误，不创建隐式重复登录。
- IPC 只暴露稳定 DTO，不泄漏 `russh-sftp` 类型。

## Non-Goals

- 删除、重命名、新建目录、权限修改和递归操作。
- 多选、拖放和完整桌面文件管理器能力。
- 对不产生 OSC 7 的任意远程 shell 强制注入 prompt 脚本。

## Acceptance

1. 已连接终端的标题栏显示文件夹按钮，点击后在右侧打开文件窗口。
2. 文件窗口能够列出本地目录和 SSH SFTP 目录，目录可继续导航并可返回上级、刷新。
3. 收到合法 OSC 7 时更新对应终端路径；非法 URI 不改变路径。
4. 文件窗口节点可随工作区布局保存、加载、关闭和移动；旧 v2 工作区可迁移到新 schema。
5. SSH 断开、权限不足和未知目录以窗口内错误状态呈现，不破坏终端会话或工作区。

## Acceptance To Verification

- 1、3：TerminalPanel、LayoutView 组件测试。
- 2、5：文件 IPC/Rust 单元测试和 FileBrowserPane 组件测试。
- 4：布局 reducer 测试、Rust workspace domain/repository schema migration 测试。
- 全部：`pnpm check` 与 Rust fmt、Clippy、test。

## Open Questions

- 无阻塞问题；远程 shell 未提供 OSC 7 时从 home 打开并允许用户在文件窗口内导航。

## Recommended Approach

采用一等 `files` 布局叶子、block-scoped CWD runtime、本地 filesystem command 与同连接 SFTP query。相比弹窗方案，它保持内部窗口的一致布局语义；相比 SCP/远程 `ls`，SFTP DTO 不受 shell、locale 和输出格式影响。

## Next Skills

- `writing-qb-plans`（Strict）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- `updating-directory-map`
