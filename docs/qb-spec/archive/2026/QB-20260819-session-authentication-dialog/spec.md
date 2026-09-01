---
id: QB-20260819-session-authentication-dialog
status: archived
archived: 2026-09-02
legacy: true
---
# Session Authentication Dialog

## Goal

用户从终端连接下拉框选择任意远程 profile 后，可在居中轻量弹窗中选择密码、私钥文件或 SSH Agent 并立即连接，无需进入连接管理窗口。

## Scope

- 弹窗显示目标名称、用户名、主机和端口，并按 profile 的认证偏好预选密码或私钥。
- 密码仅接受本次连接密码；私钥仅接受系统文件选择器确认的路径和可选一次性口令。
- SSH Agent 在 Unix 使用 `SSH_AUTH_SOCK`，Windows 优先 OpenSSH Agent named pipe，并兼容 Pageant。
- Agent 身份按返回顺序逐一尝试，成功后停止；不可用、空 Agent 和全部密钥被拒绝具有稳定错误码。
- 连接管理继续只负责 profile CRUD，不承担终端下拉框的快速连接步骤。

## Constraints

- 密码和口令提交时立即离开弹窗状态，绝不进入 profile、Workspace、日志或持久化。
- 私钥正文不进入前端；SSH Agent 私钥不被应用读取，签名由 Agent 完成。
- 不扫描 `~/.ssh`，不解析 OpenSSH config，不调用或实现 `ssh-add`。
- 快速连接绑定用户点击时的 blockId/profile，不能因随后切换活动 Block 而串到其他终端。

## Acceptance

1. 任意远程 profile 均打开轻量认证弹窗，不打开连接管理。
2. 密码、私钥和 SSH Agent 三种方式可切换，且只显示当前方式相关控件。
3. 密码与私钥口令提交后立即清空；取消不发起连接。
4. 私钥路径必须通过本次系统文件选择操作确认。
5. SSH Agent 不接受额外秘密字段，并正确区分 Agent 不可用、无身份和服务端不接受身份。
6. 弹窗具备自动聚焦、提交中禁用和可访问名称。

## Acceptance To Verification

- 1：`LayoutView.test.tsx` 验证 password/private-key profile 的统一路由。
- 2、3、4、6：`ConnectionAuthDialog.test.tsx` 验证三种提交、私钥选择、秘密清理、取消和焦点。
- 5：Rust session DTO、domain debug 与 SSH auth adapter 测试/编译门禁。
- 全部：`pnpm check` 和 Rust fmt/clippy/test 门禁。

## Open Questions

- Agent 实机认证需要具备 Agent 与测试 SSH 服务的环境，自动化集成门禁后续可增加专用 fixture。

## Recommended Approach

弹窗只生成一次性 `SessionAuth`；WorkspaceProvider 继续拥有 block-scoped session 编排；domain 表达 `SshAgent` 认证意图；russh infrastructure 独占平台 Agent 发现、身份枚举与签名。profile schema 暂不新增 Agent 偏好，避免为一次性选择引入持久化迁移。

## Next Skills

- `verifying-before-completion`
- `maintaining-project-context`
- `updating-directory-map`
