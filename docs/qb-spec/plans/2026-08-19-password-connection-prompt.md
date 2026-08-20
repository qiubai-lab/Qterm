# Password Connection Prompt Strict Plan

Status: completed on 2026-08-19. 已交付密码 profile 的居中一次性凭据弹窗、block/profile 稳定绑定、私钥流程回退与自动化保护。

## Background

当前终端下拉框选中任意远程 profile 后都会打开完整 ConnectionDialog，密码用户需要在管理界面再次输入并点击连接，快速连接路径被配置编辑流程打断。

## Requirement

密码 profile 从终端下拉框进入居中一次性密码弹窗并直接连接；私钥 profile 保持现状。

## Non-Goals

- 不保存密码，不修改 Rust authentication 或 profile persistence。
- 不重构完整 ConnectionDialog。

## Architecture Impact

- `LayoutView` 只负责认证偏好分流并上抛 `{ blockId, profile }`。
- `WorkspaceShell` 作为 modal 组合根持有短生命周期 prompt request。
- `PasswordConnectionDialog` 独占密码局部状态并调用传入的 submit callback，不访问持久化 API。

## Domain Model Impact

- 无 Rust domain 变化；前端增加 runtime-only prompt request。

## API Impact

- `WorkspaceCanvas` 的连接请求 callback 增加明确 block/profile 参数；无 IPC 变化。

## Database Impact

- 无。

## Implementation Tasks

1. 先增加密码弹窗提交/取消/焦点测试和 Layout profile 分流测试。
2. 新增 PasswordConnectionDialog 并增强 DialogFrame 的首选焦点支持。
3. 修改 LayoutView 和 WorkspaceShell 的连接请求编排。
4. 运行前端完整检查与 Rust 基础门禁。

## Acceptance To Verification

- 密码 profile 快速路径与私钥回退：LayoutView RTL。
- 密码一次性生命周期、取消、Escape、焦点：PasswordConnectionDialog RTL。
- 回归：`pnpm check`、Rust fmt/Clippy/test。

## Test Plan

- `pnpm check`。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Rollback Plan

- 移除专用 prompt state/component，恢复 `onRequestConnection()` 无参 callback；无持久化或数据回滚。

## Risks

- modal request 若只读取 activeBlockId 可能连接错误终端；必须捕获点击时 blockId。
- 密码状态在失败/取消路径残留；卸载并显式清空。
- host-key 确认可能紧随提交出现；密码弹窗应在发起连接后关闭，让既有 host-key modal 接管。

## Documentation Updates

- 本 plan/spec；Directory Map 不需要更新。
