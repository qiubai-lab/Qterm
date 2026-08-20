# 本地终端与连接选择器实施计划

## Requirement

Plan Level: Standard。改动跨越 React 工作区编排、Tauri IPC 与本地 PTY adapter，但不改变公共 schema、认证策略或核心领域模型。

## Scope

实现默认本地 PTY、Block 目标选择器和本地/SSH 生命周期切换；不实现凭据持久化、自定义 Shell 设置或连接配置 schema 变更。

## Affected Files

- `src-tauri/Cargo.toml` / `Cargo.lock`
- `src-tauri/src/infrastructure/local/*`
- `src-tauri/src/commands/local_session.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/localSessions.ts` 及测试
- `src/workspace/WorkspaceProvider.tsx` 及测试
- `src/workspace/LayoutView.tsx`
- `src/workspace/TerminalTargetPicker.tsx` 及测试
- `src/workspace/WorkspaceShell.tsx`
- `src/app/app.css`

## Design

- `portable-pty` adapter 拥有系统默认 Shell 子进程、PTY master、writer 与关闭句柄；commands 暴露 connect/write/resize/close。
- Workspace runtime 增加 `kind: local | ssh | null`，所有终端操作按 kind 路由，保持 UI 不接触 adapter 细节。
- `profileId: null` 继续作为持久化的本地目标；TerminalPanel 注册 writer 后确保本地会话启动。
- 目标选择器为纯 UI 边界，切换动作由 WorkspaceProvider 编排；SSH 配置选择后复用 ConnectionDialog 获取临时凭据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 默认本地 Shell 与 PTY 行为 | Rust manager 测试、Tauri wrapper 测试、桌面命令输入输出。 |
| 目标菜单内容与选择行为 | Testing Library 组件测试和桌面点击验证。 |
| 本地/SSH 安全切换 | WorkspaceProvider 测试断言关闭旧 kind、路由新 kind。 |
| 多 Block 隔离与关闭 | 扩展现有 provider 回归测试；Rust session map 测试。 |
| 完整性 | `pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。 |

## Test / Verification

1. 先为 local session IPC、provider kind 路由和目标选择器添加失败测试。
2. 实现 PTY adapter、commands 和前端 wrapper。
3. 实现 provider 生命周期与目标选择器。
4. 运行聚焦前端/Rust 测试。
5. 运行完整前端与 Rust 质量门，并在 Windows 桌面应用中验证本地 PowerShell 输入输出、双 Block 隔离和连接菜单。

## Documentation Updates

完成后更新 task spec 状态；无需 Project Context 或 Directory Map 更新。
