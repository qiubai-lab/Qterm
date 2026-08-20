# 配置认证自动连接与失败回退

## Goal

用户选择已配置的远程连接，或从远程终端打开文件窗口时，应用直接按 profile 的认证偏好尝试连接；只有配置凭据不可用或实际连接失败时才显示认证弹窗。

## Scope

- Terminal 目标选择后自动使用已配置的密码、私钥或 SSH Agent。
- 远程 Files Block 创建或切换目标后自动建立独立 SFTP 会话。
- 已保存密码仅在 vault 已解锁时自动使用；未保存或锁定时回退认证弹窗。
- 私钥路径存在时使用已配置路径和空口令尝试；需要口令、路径未获授权或认证失败时回退。
- SSH Agent 直接尝试。
- 异步 session `Failed` 事件触发一次认证弹窗，不重复重连。

## Constraints

- 保持 Terminal 与 Files 独立 session 生命周期。
- 不自动解锁密码 vault，不保存新的秘密，不绕过主机密钥确认。
- 自动尝试与手动弹窗继续共用既有 `connectBlock` / `connectFileBlock` 编排。

## Non-Goals

- 不实现自动重试次数、连接退避、主密码自动保存或私钥口令保存。
- 不改变 SSH 协议、host-key 或 vault 加密格式。

## Acceptance

1. SSH Agent profile 点击后不先显示认证弹窗，并立即创建 Terminal 连接尝试。
2. 可用的已保存密码或已配置私钥会直接尝试；凭据不可用时显示认证弹窗。
3. 自动尝试收到异步失败事件后仅显示一次对应 owner/block 的认证弹窗。
4. 从已连接远程终端打开 Files Block 后自动尝试该 profile 的独立 SFTP 连接，无需再次点击下拉框。
5. 本机终端与本机 Files 行为不变；主机密钥确认仍优先显示。

## Acceptance To Verification

- 1、2：configured-auth resolver 单元测试与 WorkspaceShell 交互测试。
- 3：WorkspaceProvider failure callback 回归测试。
- 4、5：LayoutView Files 初始目标与选择目标测试。
- 完整性：`pnpm check`、Rust fmt/Clippy/test。

## Open Questions

- 无阻塞项。

## Recommended Approach

采用前端应用编排层的 profile-auth resolver，将非敏感 profile 偏好解析为一次性 `SessionAuth`；WorkspaceProvider 只负责 session 生命周期并把异步失败通知调用方。相比在 UI 内复制三套认证判断，这能让 Terminal 与 Files 使用同一规则，同时不把 vault 或弹窗职责下沉到 provider。

## Next Skills

- `writing-qb-plans`：认证路由使用 Strict 计划。
- `checking-architecture-boundaries`：保持 resolver、session provider 和 dialog 职责分离。
- `protecting-critical-behavior`：先补自动连接与异步失败回退回归测试。
- `verifying-before-completion`：执行全量质量门。
- Directory Map: not needed；未改变既有模块边界或入口职责。
