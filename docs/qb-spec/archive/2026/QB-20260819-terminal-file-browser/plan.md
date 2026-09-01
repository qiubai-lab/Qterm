---
id: QB-20260819-terminal-file-browser
status: archived
archived: 2026-09-02
legacy: true
---
# Terminal File Browser Strict Plan

Status: completed on 2026-08-19. 已交付只读本地/SFTP 文件窗口、OSC 7 工作目录、Workspace schema v3 迁移与自动化保护；破坏性文件操作保留在后续阶段。

## Background

现有工作区布局仅支持 Terminal leaf，文件传输只支持单文件 SFTP。新功能会改变持久化 schema、布局公共契约和本地/远程文件读取边界。

## Requirement

从终端标题栏打开当前路径，在工作区内部使用新的文件窗口浏览本地或同一 SSH 会话的远程目录。

## Non-Goals

- 不实现破坏性文件操作、递归传输或 shell 命令解析目录列表。

## Architecture Impact

- `workspace` 只拥有可序列化文件窗口布局与 block runtime CWD，不读取文件。
- `commands/files` 校验 DTO 并路由本地 filesystem 或 SSH manager。
- SSH infrastructure 在当前认证连接上开独立 SFTP channel，返回稳定领域文件条目。

## Domain Model Impact

- Layout 增加 `Files` leaf；所有 leaf 保持全局唯一 block id。
- 增加稳定 `FileEntry` 类型与目录列表上限。

## API Impact

- 新增 `files_list_local(path)` 与 `files_list_remote(sessionId, path)` IPC。
- Workspace schema 从 v2 升级到 v3，读取时兼容迁移 v1/v2。

## Database Impact

- 无数据库；版本化 JSON workspace 文档升级并保持原文件读取兼容。

## Implementation Tasks

1. 先增加布局 Files leaf、通用 leaf 变换和 schema v2→v3 回归测试。
2. 增加本地与 SFTP 目录列表领域 DTO、commands 和 SSH query 控制消息。
3. 增加 OSC 7 解析、runtime CWD 和打开文件窗口 action。
4. 实现 FileBrowserPane、标题栏按钮、导航与视觉状态。
5. 更新 Directory Map，并执行完整验证。

## Acceptance To Verification

- 标题栏打开行为：RTL 查询按钮、dispatch 和文件窗口渲染。
- CWD：合法/非法 OSC 7 单元测试。
- 目录列表：Rust 本地临时目录测试；SSH query 由 manager 控制与既有真实 sshd test 路径保护。
- 布局兼容：TS reducer/layout 测试和 Rust v2 fixture migration/round-trip。
- 错误隔离：FileBrowserPane rejected promise 与断开 session 测试。

## Test Plan

- `pnpm test`、`pnpm lint`、`pnpm build`。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- 如桌面运行环境可用，进行本地目录打开的聚焦冒烟检查。

## Rollback Plan

- 前端移除 Files leaf/action/UI，后端保留 v3 reader 或恢复只写 v2；新增只读 IPC 可独立移除。
- 不对用户远程或本地文件执行写操作，因此功能回滚不需要数据补偿。

## Risks

- 部分远程 shell 不发 OSC 7；降级从 home 打开。
- 超大目录可能影响 UI；后端限制单次条目数量并返回稳定排序输入。
- 来源终端关闭导致 runtime session 消失；文件窗口保留并显示断开状态。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`，记录 `src/files` 与 files command/domain 边界。
