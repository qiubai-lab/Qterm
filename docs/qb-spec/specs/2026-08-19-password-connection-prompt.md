# Password Connection Prompt

Status: superseded by `2026-08-19-session-authentication-dialog.md`.

## Goal

用户从终端连接下拉框选择密码认证配置后，可以直接在居中轻量弹窗中输入密码并连接，无需进入连接管理窗口再次点击连接。

## Scope

- 下拉框选择密码 profile 后，将该 profile 设为当前 Terminal Block 目标并打开密码输入弹窗。
- 弹窗显示目标名称、用户名和主机，密码输入自动聚焦，Enter 提交，Escape/取消关闭。
- 提交后调用现有 block-scoped `connectBlock`，立即清空前端密码状态并关闭弹窗。
- 私钥 profile 保持现有连接管理流程；连接管理仍负责 profile CRUD。

## Constraints

- 密码只存在于弹窗局部状态和一次性 `SessionAuth` 参数，不进入 profile、Workspace、日志或持久化。
- 切换目标前继续关闭该 Block 原有会话，保持现有 epoch 隔离规则。
- 快速连接必须绑定用户点击时的 blockId/profile，不能因随后切换活动 Block 而串到其他终端。

## Non-Goals

- 保存密码、系统钥匙串或自动重连。
- 重做私钥选择、加密私钥口令和连接管理 UI。
- 修改 Rust 认证协议或 IPC schema。

## Acceptance

1. 选择密码 profile 后不打开连接管理，而是打开居中的密码弹窗。
2. 弹窗提交使用正确的 block/profile/password 调用连接，提交后密码输入被清空且弹窗关闭。
3. 取消或 Escape 不调用连接；密码不会进入可持久化对象。
4. 选择私钥 profile 仍打开现有连接管理窗口。
5. 弹窗具备自动聚焦、提交中禁用和可访问名称。

## Acceptance To Verification

- 1、4：`LayoutView.test.tsx` 验证 profile 分流和 callback 参数。
- 2、3、5：`PasswordConnectionDialog.test.tsx` 验证提交、取消、Escape、焦点与临时密码清理。
- 全部：`pnpm check`；Rust 无行为变化，仅运行现有 Rust 门禁确认无回归。

## Open Questions

- 无。

## Recommended Approach

由 Terminal Block 判断 profile 的认证偏好并向 WorkspaceShell 上抛不可持久化的连接请求；WorkspaceShell 作为弹窗组合根渲染专用密码对话框。相比复用 ConnectionDialog，此方案避免把 profile 编辑状态与一次性凭据混合，也保持 blockId 绑定稳定。

## Next Skills

- `writing-qb-plans`（Strict）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`

Directory Map: not needed；新增组件位于既有 dialogs 边界且职责不变。
