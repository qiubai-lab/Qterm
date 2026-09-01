---
id: QB-20260819-independent-file-window-connections
status: archived
archived: 2026-09-02
legacy: true
---
# Independent File Window Connections Strict Plan

Status: implemented on 2026-08-19; feature-focused verification, frontend tests/build and all Rust gates pass. The combined `pnpm check` is temporarily blocked only by four unrelated ESLint errors in concurrent credential-management changes.

## Background

当前文件窗口通过 `sourceBlockId` 读取终端 runtime。该耦合使文件窗口无法切换独立连接，来源终端断开或关闭时文件窗口也失效，并迫使 SFTP 浏览共享交互终端的 PTY 会话。

## Requirement

将文件窗口提升为独立连接所有者，同时保持与终端一致的目标选择体验，并统一终端快捷方式与右侧工具轨的打开语义。

## Non-Goals

- 不增加破坏性文件操作，不重做传输队列，不持久化任何凭据或运行时会话。

## Architecture Impact

- `workspace/model` 只持久化 Files Block 的 `profileId/path`。
- `WorkspaceProvider` 分离 terminal runtime 与 file runtime，并按 Block 编排关闭、认证和 host-key。
- `commands/files` 暴露 file-session connect transport；SSH infrastructure 用明确 purpose 决定是否创建 PTY/shell。
- `FileBrowserPane` 只消费最小文件来源契约，不依赖 TerminalRuntime。

## Domain Model Impact

- Workspace `Files` leaf 从来源终端引用改为可选 profile 引用。
- SSH session entry 增加用途；Files 用途拒绝终端 write/resize 控制。

## API Impact

- 新增 `files_session_connect` IPC；session close 与 host-key decision 继续复用通用 session id 命令。
- Workspace schema 从 v3 升级到 v4，并兼容读取 v1/v2/v3。

## Database Impact

- 无数据库。版本化 JSON persistence 增加 v3→v4 显式迁移；原文件通过既有原子写策略更新。

## Implementation Tasks

1. 先编写 schema、layout、入口策略、文件浏览 runtime 与 session purpose 的失败回归测试。
2. 更新 Workspace domain/DTO/repository migration 与前端 model/reducer/layout。
3. 在 SSH manager 增加 Files session purpose，并通过 files command/IPC adapter 建立无 PTY 会话。
4. 在 WorkspaceProvider 增加 file-owned runtime、认证、host-key 与级联关闭编排。
5. 复用可配置目标选择器重构 FilesBlock，接入终端快捷方式和右侧入口。
6. 更新长期架构、决策与目录地图，执行完整质量门禁。

## Acceptance To Verification

- 目标与路径继承：reducer/LayoutView 测试断言 `profileId/path`，并断言后续不读取来源终端 runtime。
- 右侧入口：纯策略函数覆盖终端、文件、无有效活动叶三种分支；Shell 测试断言不再打开 TransferDialog。
- 本机/远程浏览：FileBrowserPane 测试断言本机无 session 可读、远程未连接有稳定错误、远程使用自有 session id。
- 会话隔离：Provider 测试断言切换/关闭只关闭 Files Block session；Rust 测试断言 Files purpose 拒绝 PTY 控制。
- schema：Rust v3 fixture 迁移与 v4 round-trip，前端 IPC payload 断言。

## Test Plan

- 开发中运行相关 Vitest 与 Rust module tests，保留测试先失败的证据。
- 完成后运行 `pnpm check`。
- 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- 若当前环境可启动桌面应用，补充本机文件窗口手动冒烟；不可用时明确记录限制。

## Rollback Plan

- 前端可恢复 v3 Files source contract，但 repository 必须继续保留 v4 reader，避免覆盖已升级数据。
- 新的 Files session command 可独立撤回；只读目录功能未修改用户文件，无数据补偿需求。

## Risks

- v3 文件节点引用已不存在的终端；迁移时安全降级为本机。
- 远程认证在 session id 返回前可能先产生事件；使用独立 epoch 防止关闭/切换后的迟到事件污染新 runtime。
- 通用 session manager 中 purpose 分支可能误放行终端控制；在 entry 与 run loop 两层限制。

## Documentation Updates

- 更新 `context/ARCHITECTURE_SPEC.md`、`context/DECISIONS.md` 与 `DIRECTORY_MAP.md`，记录 Files Block 会话所有权和无 PTY SFTP 边界。

## Verification Evidence

- Tests-first baseline: 4 focused failures confirmed the old `sourceBlockId` coupling and local-session requirement.
- Focused frontend: reducer、FileBrowserPane、LayoutView、WorkspaceProvider 与 file-window policy tests pass.
- Targeted ESLint for all changed frontend feature files passes with zero warnings.
- Rust: `cargo fmt --all -- --check` passes; `cargo clippy --all-targets --all-features -- -D warnings` passes; `cargo test --all-targets --all-features` passes 66 tests with 1 environment-dependent OpenSSH test ignored.
- Repository-wide `pnpm test` passes 59 tests and `pnpm build` succeeds. `pnpm check` reaches ESLint and is not green only because of the concurrent unrelated files recorded in Status; the App test exercises the rail button creating an in-layout local Files Block rather than the old transfer dialog.
