---
id: QB-20260818-tauri-ssh-auth-vertical-slice
status: archived
archived: 2026-09-02
legacy: true
---
# Tauri SSH 密码与私钥认证最小垂直切片实施计划

## Background

仓库当前为空。产品选择 Tauri 2，第一阶段不解析 `~/.ssh/config`，不扫描私钥目录，也不对接 SSH Agent；只实现密码和用户手动选择私钥文件的认证链路。目标是验证从连接配置、临时凭据、host-key trust、交互终端到单文件 SFTP 的完整链路。

本任务涉及认证、安全边界、敏感数据生命周期、持久化格式和跨平台构建，因此保持 Strict 计划。

## Requirement

- 建立 Tauri 2 + React + TypeScript + Vite 应用。
- Rust 后端使用 `russh`、`russh-sftp` 和 Tokio。
- 保存非敏感连接配置及可选私钥路径。
- 支持密码、未加密私钥和带口令私钥认证。
- 私钥由用户通过系统文件选择器手动选择；不自动扫描任何目录。
- 密码和私钥口令不持久化，并在连接结束或失败时清理。
- 实现应用自有 known-hosts、单会话 xterm.js 终端和单文件 SFTP 上传/下载。
- 建立自动测试、三平台 CI 和基本安全检查。

## Non-Goals

- 不实现 SSH Agent、Pageant、Agent forwarding 或硬件密钥。
- 不实现目录扫描、自动密钥发现或私钥复制导入。
- 不实现系统凭据库、密码保存、口令保存或自动登录。
- 不实现 OpenSSH config、跳板机、多标签、目录浏览、断点续传和自动更新。
- 不引入数据库、Web 服务、AI Agent 或微服务结构。

## Architecture Impact

采用四个明确边界：

1. `src/` 前端管理表单、临时密码/口令输入和 xterm.js 视图；提交认证后立即清空敏感字段，不持久化到 localStorage 或状态持久化中间件。
2. `commands/` 校验 Tauri DTO、把敏感字符串立即包装为 secret type 并调用应用服务；不得 Debug 或记录原始请求。
3. `application/` 编排 profile、authentication、host-key、session 和 transfer，拥有状态机、凭据生命周期和取消语义。
4. `infrastructure/ssh/` 封装 `russh`、私钥解析、known-hosts 和 SFTP，实现应用层端口。

依赖方向为 `commands -> application -> domain/ports <- infrastructure`。`lib.rs` 是组合根。认证建模为有限策略枚举/端口，当前只组合 password 和 key-file；未来 Agent 新增 adapter，不反向修改 UI 或会话核心。

终端输出和传输进度使用 Tauri `Channel` 保序流式发送。前端输入按小时间窗合并后调用写入命令，避免逐按键产生过多 IPC。

## Domain Model Impact

- `ConnectionProfile`：`id`、`name`、`host`、`port`、`username`、`authPreference`、可选 `privateKeyPath`；不包含密码或口令。
- `AuthRequest`：`Password(SecretString)` 或 `PrivateKey { path, passphrase: Option<SecretString> }`，只存在于连接用例生命周期。
- `AuthFailure`：invalidCredentials、keyMissing、keyUnreadable、keyEncrypted、invalidPassphrase、unsupportedKey、serverRejected。
- `HostKeyDecision`：unknown/accepted/rejected/changed；changed 永远不可自动接受。
- `SessionId` 与 `SessionState`：connecting、awaitingHostKey、authenticating、connected、closing、closed、failed。
- `TransferId` 与 `TransferState`：queued、running、completed、cancelled、failed。

Domain model、IPC DTO 和 JSON persistence model 分离。Secret type 不实现明文 Debug/Display/Serialize；private key library type 只存在于 SSH infrastructure。

## API Impact

计划提供最小 Tauri command surface：

- `profile_list/create/update/delete`
- `session_connect/accept_host_key/reject_host_key/write/resize/close`
- `transfer_upload/download/cancel`

`session_connect` 接收认证 DTO、terminal output channel 和状态 channel。命令返回后前端必须清空密码/口令 state。错误统一为 `{ code, message, retryable }`；底层私钥正文、解析错误原文和敏感路径上下文不直接序列化到前端。

文件选择使用受限 Tauri dialog 能力；后端只读取用户明确选择且与当前请求一致的路径，不提供目录枚举 command。

## Database Impact

不引入数据库。连接配置使用 app-data 下的 versioned JSON 文件，采用临时文件加原子替换；known-hosts 使用独立文件。

允许持久化私钥路径，但禁止 password、passphrase、privateKeyData 等字段。首次格式为 `schemaVersion: 1`。读取未知版本时失败并保留原文件，不自动覆盖。测试使用临时目录和注入式 repository path。

## Implementation Tasks

### 1. 工程与验证基线

Status: completed on 2026-08-18. 本地 macOS 空壳已通过前端检查、Rust fmt/Clippy/test、`cargo audit` 和 Tauri release build；Windows/Linux 构建等待 GitHub CI 首次执行确认。

- 用 pnpm 创建 Tauri 2 + React + TypeScript + Vite 项目。
- 配置 TypeScript strict、ESLint、Vitest、React Testing Library。
- 配置 Rust `rustfmt`、Clippy、单元测试、`cargo-audit`、`secrecy`/`zeroize`。
- 建立 Windows、macOS、Linux CI，先运行空应用构建和静态检查。
- 固定依赖版本并记录升级策略。

关键位置：`package.json`、`vite.config.ts`、`tsconfig*.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`.github/workflows/ci.yml`。

### 2. 领域模型、端口和配置持久化

Status: completed on 2026-08-18. 已实现 profile domain validation、repository port、versioned JSON 原子持久化、敏感字段拒绝、应用服务、稳定 IPC 错误和 Tauri CRUD commands；连接配置 UI 留在阶段 7。Authenticator、host-key、session 和 transfer ports 延后到对应真实用例阶段定义，避免无调用方的空抽象。

- 先写 profile validation、versioned JSON、原子写入和敏感字段拒绝测试。
- 建立 profile repository port；authenticator、host-key store、SSH session 和 transfer ports 在阶段 3、4、6 与真实调用方同步建立。
- 实现 profile application service 和 JSON repository。
- 建立稳定 error code 枚举与 IPC error mapping。
- 认证抽象只覆盖当前真实用例，避免预先实现空 Agent adapter。

关键位置：`src-tauri/src/domain/`、`src-tauri/src/ports/`、`src-tauri/src/application/profile_service.rs`、`src-tauri/src/infrastructure/persistence/`。

### 3. 密码和私钥认证

Status: completed on 2026-08-18. 已实现 secret wrapper、系统文件选择、Rust-only 私钥读取/解析、加密 Ed25519 fixture、Unix 权限警告、稳定错误映射，以及已由阶段 4 session adapter 调用的密码/私钥认证函数。RSA 因 RUSTSEC-2023-0071 暂时编译关闭。真实服务器认证仍在阶段 8 使用 sshd 完成兼容矩阵；不会为了测试绕过主机密钥确认。

- 先写 secret wrapper、错误脱敏和生命周期测试。
- 实现密码认证，区分服务端拒绝、认证方式禁用和连接错误。
- 使用系统文件选择器获取用户选择路径，不提供目录扫描接口。
- Rust Core 按需读取和解析私钥；支持计划中明确列出的 OpenSSH 私钥算法和加密私钥口令。
- 私钥路径缺失、不可读、损坏、不支持和错误口令必须映射到稳定错误码。
- 对 Unix 过宽文件权限给出安全警告；是否阻断由实现 spike 后记录，不影响 Windows。
- 认证完成、失败或取消后主动 drop/zeroize 临时 password、passphrase 和可控的私钥字节缓冲。

关键位置：`src-tauri/src/domain/auth.rs`、`src-tauri/src/application/auth_service.rs`、`src-tauri/src/infrastructure/ssh/auth.rs`、`src/features/auth/`。

### 4. 主机密钥信任与 SSH 会话状态机

Status: completed on 2026-08-18. 已实现应用自有 versioned known-hosts、指纹重算校验、unknown accept/reject、changed-key 强制阻断、15 秒连接超时、60 秒确认超时、可取消和幂等关闭、有限完成会话缓存，以及 Tauri Channel 状态流。行为和持久化由自动测试覆盖；真实 sshd 的握手、轮换和认证联调仍按阶段 8 集成矩阵执行。

- 先写 unknown/accept/reject/changed 的行为测试。
- 将 `russh::client::Handler::check_server_key` 连接到应用层 host-key decision gate。
- unknown 通过 oneshot 等待用户决定；changed 立即失败；accept 原子写入应用 known-hosts。
- 实现连接、认证、关闭、网络断开和幂等清理状态机。
- 为连接、handshake 和用户确认设置超时或明确的可取消等待。

关键位置：`src-tauri/src/domain/session.rs`、`src-tauri/src/application/connection_service.rs`、`src-tauri/src/infrastructure/ssh/known_hosts.rs`、`src-tauri/src/infrastructure/ssh/client.rs`。

### 5. 终端 Channel

Status: completed on 2026-08-18. 已实现 `xterm-256color` PTY/shell、64 KiB 输入边界、有界控制队列、字节输出 Channel、resize、EOF、断线和关闭；前端使用 xterm.js + fit addon 与流式 UTF-8 decoder。MVP 使用默认 renderer，未引入 WebGL addon；输出洪峰与 IME 留给跨平台后续验证。

- 申请远端 `xterm-256color` PTY 和 shell channel。
- 用有界内部队列读取远端字节，合并小块后通过 Tauri Channel 顺序传给前端。
- 实现 write、resize、EOF、disconnect；前端组件卸载和窗口关闭触发 close。
- xterm.js 接入 fit、WebGL 可用时启用、不可用时回退默认 renderer。
- 覆盖 UTF-8 分块、resize、控制键、输出洪峰和断线。

关键位置：`src-tauri/src/infrastructure/ssh/client.rs`、`src-tauri/src/commands/session.rs`、`src/app/TerminalPanel.tsx`、`src/lib/tauri/sessions.ts`。

### 6. 单文件 SFTP

Status: completed on 2026-08-18. 已在同一认证 SSH 连接上开启独立 SFTP channel，支持流式上传/下载、字节进度和取消。两种方向均写临时文件后 rename 并在失败/取消时清理；上传在目标已存在时拒绝，不静默覆盖。本机 OpenSSH 集成测试验证了内容一致性、进度和覆盖保护。会话运行时可管理多个任务，但 MVP UI 同时只暴露一个活动任务。

- 建立上传/下载 hash 校验集成测试，再实现 SFTP adapter。
- 流式读写文件，进度使用 Tauri Channel，取消使用 cancellation token。
- 下载写入临时文件，成功后原子 rename；取消或失败清理临时文件。
- 上传第一阶段不承诺远端原子替换；覆盖目标前必须在 UI 明确确认。
- 限制单次只运行一个 transfer，避免尚未验证的并发语义。

关键位置：`src-tauri/src/domain/transfer.rs`、`src-tauri/src/infrastructure/ssh/client.rs`、`src-tauri/src/commands/transfer.rs`、`src/lib/tauri/transfers.ts`。

### 7. 最小 UI 串联

Status: completed on 2026-08-18. 单窗口 UI 已串联 profile CRUD、临时凭据、系统私钥选择、连接/断开、主机指纹确认、xterm.js 终端，以及 SFTP 上传/下载/进度/取消；会话创建返回后清空密码和私钥口令。1040×720 默认窗口完成本地视觉冒烟检查，无页面级溢出。

- 主机配置页：列表、创建、编辑、删除、认证偏好和私钥路径。
- 认证区：密码输入、手动选择私钥、私钥口令输入；不提供扫描按钮。
- 连接页：状态、host-key confirmation 和稳定错误展示。
- 终端页：单 xterm.js 实例、连接/断开。
- 文件传输区：选择本地文件、输入远端路径、上传/下载、进度和取消。
- 提交认证后清空密码/口令；禁止 localStorage、sessionStorage、日志和 telemetry 保存敏感输入。

关键位置：`src/app/App.tsx`、`src/app/TerminalPanel.tsx`、`src/app/app.css`、`src/lib/tauri/`。

### 8. 集成、兼容性和交付检查

Status: completed for the MVP on 2026-08-18. 使用本机临时 OpenSSH `sshd`（不依赖 Docker、不接触 `~/.ssh`）完成未知主机确认、Ed25519 私钥认证、PTY 命令输出、SFTP 上传/下载和拒绝覆盖集成测试。前端 lint/typecheck/build、Rust fmt/Clippy/test、依赖审计和 macOS Tauri release bundle 均纳入最终门禁；Windows/Linux 安装包与密码服务端矩阵继续由 CI/后续兼容性阶段覆盖，不扩大 MVP 支持声明。

- Docker/容器化 `sshd` 集成环境生成临时用户、密码、主机密钥和测试私钥。
- 覆盖正确/错误密码、服务端禁用密码、未加密/加密私钥、错误口令、损坏/缺失密钥、host-key 轮换、PTY、SFTP、取消和断线。
- 对支持的私钥算法/编码建立显式兼容矩阵；未测试格式不得在 UI 宣称支持。
- 在三平台执行打包 smoke build；记录产物大小、首次启动和空闲内存作为非阻断基线。
- 更新 README、故障排查和安全模型文档。

## Acceptance To Verification

| Acceptance | Evidence |
| --- | --- |
| Profile CRUD/恢复且无秘密 | Repository 单元测试、敏感字段拒绝、schema version 测试和 UI smoke。 |
| 密码认证和清理 | `russh` 认证结果分类、secret redaction/zeroize 行为测试；UI 在会话创建后清空输入。真实密码 sshd 矩阵留待后续。 |
| 手动私钥选择且无扫描 | Command surface 审查、UI 组件测试、临时目录 fixture 确认只读取显式路径。 |
| 私钥/口令认证错误 | 未加密/加密 key 集成测试，覆盖正确/错误口令、缺失、权限拒绝、损坏和不支持格式。 |
| Host key trust | unknown/trusted/changed 单元测试、known-hosts 篡改保护，以及真实 sshd 首次接受测试。 |
| 交互终端 | 真实 sshd PTY 命令输出测试、write/resize IPC 测试和 xterm 组件生产构建。 |
| 上传/下载/取消 | 真实 SFTP 内容往返、progress 和拒绝覆盖测试；取消/临时文件清理由实现路径与状态测试覆盖。 |
| 生命周期释放 | 状态机单测、认证失败/断网集成测试、窗口关闭手工检查。 |
| 三平台构建 | macOS release bundle 本地验证；Windows/Linux 由仓库 CI workflow 验证。 |

## Test Plan

- 测试优先区域：secret lifecycle、profile 敏感字段禁入、认证错误分类、私钥解析、host-key decision、session/transfer state machine。
- Rust 单元测试：领域规则、错误映射、repository、状态机、fingerprint、secret redaction。
- Rust 集成测试：真实 sshd 密码与密钥认证、PTY、SFTP、主机密钥轮换和断线。
- 前端单元/组件测试：认证 DTO 构造后清空、状态展示、host-key confirmation、取消与清理。
- 手工三平台：文件选择器、加密私钥口令、IME/CJK、复制粘贴、resize、窗口关闭和安装包启动。
- 安全检查：`cargo audit`、依赖锁文件审查、日志敏感信息扫描、Tauri capabilities 最小权限。

## Rollback Plan

- 每个阶段保持可独立回滚，先合入测试与端口，再合入 auth/SSH adapter，最后串 UI。
- profile JSON 带 schema version；若实现失败或回滚，保留未知版本原文件，不做破坏性降级。
- known-hosts 与 profile 独立存储，回滚 UI 或 SSH adapter 不删除用户信任记录。
- 密码和口令从不持久化，因此认证实现回滚不需要秘密迁移。
- CI 在功能合入前保持空壳构建可用，失败时移除未注册 command/feature，不重置用户工作树。

## Risks

- 私钥格式和加密算法支持受 `russh`/`ssh-key` 版本影响；先做 fixture spike 并只承诺验证过的格式。
- 密码和口令会短暂存在于 WebView 输入和 IPC payload；必须立即清空前端 state、禁止持久化并在 Rust 侧使用 secret wrapper。
- Rust 无法保证第三方库内部所有私钥副本立即清零；安全模型需陈述该残余风险。
- host-key 用户确认与握手 task 之间可能死锁；使用显式 session state、oneshot 和超时。
- 高频终端数据可能压垮 IPC；使用有界队列、批量和 Tauri Channel。
- 取消 SFTP 时远端可能保留部分文件；第一期需明确展示，后续再引入远端临时文件加 rename。
- 三平台 WebView 的 IME、WebGL 和字体存在差异；保留 renderer fallback 和手工矩阵。
- vibe coding 容易产生只为通过编译器的修补；安全关键路径必须以行为测试和架构边界验收。

## Documentation Updates

- `README.md`：开发命令、支持认证方式、支持的私钥格式和运行方式。
- `docs/security-model.md`：临时凭据、私钥 Rust-only 边界、host-key trust 和日志红线。
- `docs/troubleshooting.md`：错误密码、错误口令、损坏/不支持密钥、host-key 变化和平台差异。
- `docs/qb-spec/context/*`：保持产品、架构和决策上下文同步。
- 实现产生目录结构后运行 `updating-directory-map`。

## Next Skills

- 实现阶段持续使用 `checking-architecture-boundaries` 和 `protecting-critical-behavior`。
- 完成前使用 `verifying-before-completion` 执行本计划的验证矩阵。
- 新增模块和入口后使用 `updating-directory-map`。
