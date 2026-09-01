---
id: QB-20260819-session-authentication-dialog
status: archived
archived: 2026-09-02
legacy: true
---
## Background

远程目标的轻量连接弹窗目前只接受密码，私钥连接仍会跳回连接管理。用户已确认第三种认证方式为 SSH Agent，希望一次性连接弹窗统一提供密码、私钥文件和 SSH Agent。

## Requirement

- 所有已配置的远程目标都通过居中轻量弹窗发起连接。
- 弹窗提供密码、私钥文件、SSH Agent 三种本次连接方式，并按 profile 的认证偏好预选密码或私钥。
- SSH Agent 使用操作系统现有 Agent：Unix 使用 `SSH_AUTH_SOCK`，Windows 优先 OpenSSH Agent named pipe，并兼容 Pageant。
- Agent、密码及私钥口令不得写入 profile、workspace 或日志。

## Non-Goals

- 不扫描 `~/.ssh`，不解析 `~/.ssh/config`。
- 不管理 Agent 中的密钥，不提供 `ssh-add` 能力。
- 不改变 profile 持久化 schema；SSH Agent 仅作为本次连接选择。
- 不实现多因素或键盘交互认证。

## Architecture Impact

- React 弹窗只拥有短生命周期凭据和认证方式 UI，通过 `SessionAuth` 传给 WorkspaceProvider。
- Tauri command 只反序列化 Agent 标记，不处理 Agent 协议。
- domain `AuthRequest` 表达 Agent 认证意图；russh infrastructure 负责平台 Agent 发现、身份枚举和签名。

## Domain Model Impact

- `AuthRequest` 新增无秘密字段的 `SshAgent` 变体。
- `AuthFailure` 新增 Agent 不可用、无身份和 Agent 拒绝签名等稳定失败语义。

## API Impact

- `session_connect.input.auth` 新增 `{ method: "sshAgent" }`。
- 这是向后兼容的 tagged union 扩展；现有 password/privateKey 不变。

## Database Impact

无。profile schema 和 workspace schema 均不变。

## Implementation Tasks

1. 先扩展前端弹窗测试、目标路由测试与 Rust DTO/domain 测试，覆盖三种认证及秘密清理。
2. 将轻量密码弹窗扩展为三方式连接弹窗，接入系统私钥选择器。
3. 扩展前端 SessionAuth 和 WorkspaceShell 编排，使所有远程 profile 使用轻量弹窗。
4. 扩展 Rust DTO、domain failure 映射与 russh Agent adapter。
5. 更新认证规格和目录地图中的职责说明。

## Acceptance To Verification

- 三种方式可选择且表单只显示相关字段：RTL 弹窗测试。
- 密码与口令提交后立即从输入状态清空：RTL 弹窗测试。
- 私钥必须来自系统选择器：RTL 测试及既有 command 校验。
- 所有 profile 均走轻量弹窗：LayoutView 测试。
- `sshAgent` DTO 被接受且未知秘密字段仍被拒绝：Rust command 单元测试。
- Agent 失败具有稳定错误码且不泄露身份/秘密：Rust domain/infrastructure 测试与 clippy。
- 前后端完整性：`pnpm check`、Rust fmt/clippy/test。

## Test Plan

- Frontend: focused Vitest for connection dialog and LayoutView, then `pnpm check`。
- Rust: focused auth/session tests, then `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- Agent 实机连接依赖本机 Agent 和测试 SSH 服务，作为残余手工验证项明确报告。

## Rollback Plan

移除 `sshAgent` tagged-union 变体和 Agent adapter 分支，恢复弹窗仅按现有 password/privateKey 连接；无持久化迁移需要回滚。

## Risks

- Windows OpenSSH Agent 与 Pageant 传输不同，通过平台 cfg 和统一动态 Agent client 隔离。
- Agent 可能为空、不可达或拒绝签名，需要区分并显示可操作错误。
- 多个 Agent identity 逐一尝试可能触发服务端认证次数限制；保持 Agent 返回顺序并在成功后立即停止。

## Documentation Updates

- 更新认证 task spec，记录 SSH Agent 平台边界和非持久化约束。
- 如组件职责或入口名称变化，同步 `docs/qb-spec/DIRECTORY_MAP.md`。
