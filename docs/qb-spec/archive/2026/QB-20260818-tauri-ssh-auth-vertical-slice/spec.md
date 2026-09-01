---
id: QB-20260818-tauri-ssh-auth-vertical-slice
status: archived
archived: 2026-09-02
legacy: true
---
# Tauri SSH 密码与私钥认证最小垂直切片

## Goal

交付一个可在 Windows、macOS、Linux 构建的桌面终端最小垂直切片：用户维护目标主机信息，通过密码或手动选择的私钥文件完成 SSH 认证，获得可交互终端，并可执行基础 SFTP 上传和下载。

## Scope

- 使用 Tauri 2、React、TypeScript、Vite 和 xterm.js 构建桌面 UI。
- 保存非敏感连接配置：名称、主机、端口、用户名、认证偏好和可选私钥路径。
- 使用 `russh` 连接 SSH，使用 `russh-sftp` 传输文件。
- 支持密码认证。
- 支持用户通过系统文件选择器手动选择私钥文件。
- 支持未加密私钥和带口令私钥；私钥口令按连接临时输入。
- 使用应用自有 known-hosts 信任库；未知主机必须由用户确认，密钥变化必须阻断。
- 支持一个活动 SSH 终端会话，包括输入、输出、窗口 resize 和主动断开。
- 支持单文件上传、下载、进度展示和取消。
- 建立三平台 CI 的检查与构建基线。
- 保持认证策略边界可扩展，后续可以新增 SSH Agent 实现。

## Constraints

- 不解析或复用 `~/.ssh/config`，不扫描 `~/.ssh` 或其他目录发现私钥。
- 私钥只能由用户手动选择；应用可以保存路径，但不得复制私钥正文到自己的配置目录。
- 密码和私钥口令只存在于当前连接的临时 UI state 和 Rust secret wrapper；提交后清空 UI，连接结束或失败后清理 Rust 持有值。
- 私钥正文只允许由 Rust Core 按需读取和解析，不得进入前端 DTO、日志或持久化文件。
- 当前阶段不实现 SSH Agent，但认证领域模型不得与密码或文件私钥硬编码耦合。
- Rust SSH 层保持纯 Rust，不依赖系统 OpenSSH、libssh 或 libssh2。
- 使用 Tauri IPC Channel 传输有序终端输出；不使用全局 JSON event 承载高吞吐终端流。
- 不使用 `unsafe`；运行路径不得依赖 `unwrap`/`expect` 处理可恢复错误。
- 用户可见错误必须是稳定错误码加可读信息，不能泄漏密码、口令、私钥正文或底层敏感上下文。

## Non-Goals

- SSH Agent、Pageant、Agent forwarding 和硬件密钥。
- 自动扫描 `~/.ssh`、自动尝试目录中的密钥或导入私钥副本。
- 系统凭据库、密码保存、私钥口令保存或自动登录。
- `~/.ssh/config`、`Include`、`Match`、`ProxyJump` 或 `ProxyCommand`。
- 多标签、多窗口、会话恢复、端口转发。
- 远程文件浏览器、目录递归传输、断点续传和失败重试队列。
- Web 访问、AI Agent、云同步、多用户和团队共享。
- 自动更新、代码签名和应用商店发布。

## Acceptance

1. 用户可以创建、编辑、删除并重启后恢复非敏感主机配置和可选私钥路径，持久化文件中不包含密码或私钥口令。
2. 用户可用正确密码完成 SSH 认证；错误密码被准确识别，临时密码在失败或断开后清除。
3. 用户可以通过系统文件选择器选择私钥，应用不扫描目录、不复制密钥且不把密钥正文传给前端。
4. 未加密私钥可以完成认证；加密私钥会请求口令，并能区分正确口令、错误口令、损坏文件和不支持格式。
5. 私钥文件缺失、不可读或在配置保存后被移动时，连接前给出明确错误且不会崩溃。
6. 首次连接未知主机时显示主机、算法和指纹，只有明确接受后才写入应用信任库。
7. 已信任主机密钥变化时连接必须失败，且不能提供静默忽略选项。
8. 成功连接后可运行交互命令，终端支持 UTF-8/CJK、控制键和 resize。
9. 用户可以上传和下载单个文件，看到进度，并可取消未完成传输。
10. 断开会话、认证失败、关闭窗口或取消传输后，临时凭据、Tokio task、Channel 和文件句柄能够释放。
11. 代码通过 Rust/TypeScript 静态检查和测试，并在 Windows、macOS、Linux CI 中完成构建检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1 | Profile repository 单元测试覆盖 CRUD、重启恢复、schema version 和“无密码/口令字段”；UI 手工冒烟测试。 |
| 2 | 容器化 `sshd` 集成测试覆盖正确密码、错误密码、服务端禁用密码认证和连接后清理。 |
| 3-5 | 临时目录密钥 fixture 测试覆盖手动路径、无扫描、未加密/加密密钥、正确/错误口令、缺失、权限拒绝、损坏和不支持格式。 |
| 6-7 | Host-key verifier 行为测试覆盖 unknown/accept/reject/changed，并用真实 sshd 轮换主机密钥验证。 |
| 8 | SSH PTY 集成测试覆盖命令回显、resize 和 UTF-8；三平台手工检查输入法、复制粘贴和控制键。 |
| 9 | SFTP 集成测试校验上传/下载 hash、进度单调性、取消后的临时文件策略和句柄释放。 |
| 10 | 会话状态机和 secret lifecycle 测试；受控认证失败、断线和重复关闭必须幂等且无敏感日志。 |
| 11 | `pnpm lint`、`pnpm test`、`pnpm build`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、`cargo audit`，加三平台 CI。 |

## Open Questions

- SSH Agent、系统凭据库、更多私钥格式、目录浏览和多标签的优先级留待后续 task spec 决定，不阻塞本切片。

## Recommended Approach

### 方案 A：密码 + 手动选择私钥（采用）

使用 `russh` 原生密码与公钥认证。私钥路径可以随 profile 保存，密码和口令仅在一次连接中临时存在。范围可控，同时覆盖两种最常用认证方式。

### 方案 B：自动扫描 `~/.ssh`（拒绝）

能减少选择步骤，但扩大文件系统读取范围，增加误识别、权限、隐私和跨平台路径风险，不符合当前最小切片。

### 方案 C：SSH Agent（延期）

私钥隔离更强，但引入 Unix socket、Windows named pipe 和 Agent 兼容矩阵。保留认证策略扩展点，后续作为独立 task 实现。

## Next Skills

- `writing-qb-plans`：继续使用 Strict 计划覆盖认证、安全、跨平台和持久化风险。
- `maintaining-project-context`：同步认证范围、凭据生命周期和延期决策。
- `checking-architecture-boundaries`：分离临时凭据、认证策略、SSH adapter、IPC DTO 和持久化模型。
- `protecting-critical-behavior`：密码/口令清理、密钥解析、host-key trust 和会话清理优先测试。
- `verifying-before-completion`：实现完成前汇总自动化和三平台证据。
- `updating-directory-map`：实现新增顶层与模块结构后更新目录索引。
