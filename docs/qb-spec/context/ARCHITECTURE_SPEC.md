# Architecture Spec

## Technology Baseline

- Desktop shell: Tauri 2
- Frontend: React + TypeScript + Vite + xterm.js
- Core runtime: Rust + Tokio
- SSH: russh
- File transfer: russh-sftp
- Authentication: one-time password, reusable encrypted credential reference, and system SSH Agent

## Trust Boundaries

- 前端是不可信展示边界，只短暂持有输入或按需显示的单条密码；不得直接持久化。私钥正文、KEK、vault data key 永不进入前端。
- Tauri command 是 transport adapter，只校验 DTO、将敏感输入包装为 secret type、调用应用服务并映射错误。
- 应用层拥有连接、认证、host-key、终端和传输的编排与状态机。
- SSH/private-key/SFTP/known-hosts 是基础设施实现，不能把库类型泄漏为前端或持久化契约。

## Dependency Direction

```text
Frontend -> Tauri Commands -> Application -> Domain / Ports <- Infrastructure
                                      ^                         |
                                      +------ composition ------+
```

`src-tauri/src/lib.rs` 是组合根。Infrastructure 实现 ports；domain 和 application 不依赖 Tauri、russh、xterm.js 或具体存储格式。

## Model Separation

- Domain model 表达 profile、authentication request、trust decision、session 和 transfer 状态。
- 普通 IPC DTO 只包含 UI 所需字段和稳定错误码；认证请求 DTO 是唯一允许短暂携带密码/口令的受控例外，且不得被记录或持久化。
- Persistence model 带 schema version，只接受当前开发 schema，不直接复用 domain struct；不兼容文件显式拒绝且不得自动改写。
- russh/lib types 只能存在于 infrastructure 和组合根附近。
- Authentication 使用有限策略边界；一次性 password、stored credential 和 SSH Agent 由 session 请求表达，平台 Agent 协议只存在于 infrastructure adapter。`manual` 只属于 profile 连接策略，不是 session auth variant。
- profile-auth resolver 把 SSH Agent 或 `credentialId` 解析为无秘密 IPC 请求，并让 `manual` 返回人工认证流程。session command 在 Rust 内通过 credential application service 得到 `AuthRequest`；WorkspaceProvider 和 WebView 不读取私钥或批量凭证。
- credential application service 拥有凭证实体、保险库生命周期与恢复重置用例；`CredentialVault` port 提供恢复材料准备、初始化、解锁、锁定、主密码重包、恢复轮换、列表元数据、密码/私钥存取和整体 clear。Json adapter 实现 envelope encryption、严格恢复文件格式与 zeroized runtime data key；Tauri command 只拥有系统文件选择和受限文件 I/O。
- settings domain/application 分别拥有安全策略与可迁移目录规则；固定系统 app-config 中的 `storage-location.json` 只承担启动定位，组合根从可迁移目录派生 `connections.json` 与 `secrets.vault`，从系统 app-data 派生 `known-hosts.json`、`workspaces.json` 与 `settings.json`。默认可迁移目录为 `~/.qterm`，保存新目录只初始化并要求重启，不自动迁移旧数据。credential lifecycle application/runtime coordinator 拥有最近解锁时间、自动锁定 deadline 与统一 lock；React timer、window blur 和 command handler 不拥有这些规则。
- Windows session-lock infrastructure 将 WTS 会话消息转换成无平台类型的锁定事件；Win32 类型停留在 `cfg(windows)` adapter 与组合根。vault 状态事件不含秘密，只用于前端清除缓存，敏感操作始终以后端状态为准。
- 连接 profile catalog 同时保存独立的一层 `ProfileGroup` 与 profile 的可空 `groupId`。domain 不提供父分组字段；repository 在单次锁定和原子写入内维护引用完整性，删除 group 时清空相关 profile 引用而不删除 profile。
- `connections.json` schema v4 持久化顶层 `groups`、profile `groupId`、`manual | password | privateKey | sshAgent` 偏好与可空 `credentialId`，不保存私钥路径。profile、vault 和 workspace reader 只接受当前 schema，旧版本不运行时迁移。

## Workspace UI Model

- 长期界面层级固定为 `Workspace → Block layout`。顶部每个标签直接对应 Workspace，不存在下拉 Workspace 管理器或内部终端 Tab。当前 Block 实现 Terminal 与 Files，未来 Web/AI 等类型必须通过显式 widget 边界加入。
- Workspace 直接拥有可序列化 layout tree 与 active block；Terminal Block 与 Files Block 都以稳定 block id 隔离运行时。Terminal 持有本地 PTY 或交互 SSH session，Files 只持有本机来源或独立 SFTP SSH session。
- 切换 Workspace 只改变可见性和焦点，不关闭、重建或混用活动 session。显式关闭 Block 才触发对应 session close；关闭 Workspace 必须级联处理其 Block。
- 高频终端字节直接进入 block-scoped xterm runtime，不进入 Workspace reducer 或持久化 model。
- Workspace、layout、Terminal/Files 的 profile 引用与文件路径可以持久化；session id、终端 buffer 和私钥口令禁止持久化。用户明确保存的密码只能进入独立加密 vault，不得进入 Workspace/profile。
- 前端组合入口只装配 workspace shell。layout tree 变换、terminal runtime registry、工具弹窗和持久化 IPC 必须拥有独立模块边界。
- WorkspaceShell 拥有不可持久化的应用内终端锁状态：锁屏挂载在 `workspace-stage`，只有工作区内容必须 inert 且隐藏于辅助技术；顶部 `app-chrome` 位于锁定边界外，Workspace 切换/新建与窗口控制保持可用。Escape、背景点击和终端操作快捷键不得绕过锁屏；专用锁屏只短暂持有主密码输入并复用 credential unlock IPC。终端锁不得进入 Workspace reducer、settings 或 persistence。
- SSH session 必须带显式用途。`Terminal` 用途可以申请 PTY/shell并接受 write/resize；`Files` 用途不得申请 PTY/shell，只接受 SFTP 目录和传输控制。
- 远程 Files leaf 初次创建或切换 profile 时必须自动请求自身的 SFTP 会话，不复用来源终端 session；本机 Files leaf 不触发认证。

## Streaming Rules

- 高频、有序终端输出和传输进度使用 Tauri IPC Channel。
- 内部队列必须有界；小输出可批量后发送。
- 所有长任务必须拥有取消路径、超时策略和幂等 close。
- 大文件必须流式处理，禁止为方便一次性读入内存。

## Security Rules

- 私钥只能通过凭证管理中的系统文件选择器显式导入；设备路径和私钥正文不进入连接配置或 WebView。
- SSH Agent 私钥不得由应用读取或导出；Unix 仅通过 `SSH_AUTH_SOCK`，Windows 通过 OpenSSH Agent named pipe 或 Pageant 请求签名。
- profile 只允许保存认证偏好和 `credentialId`。`secrets.vault` 使用 Argon2id KEK 与独立 256-bit recovery key 分别包装同一个随机 data key，并用 AES-256-GCM 逐条加密密码、私钥正文和可选口令；恢复文件只保存 vault identity、generation 与 recovery key，不保存主密码、data key 或凭证明文。主密码、KEK、recovery key 和 data key 禁止进入 WebView 或日志。
- 密码和口令使用 secret wrapper，在成功、失败、取消和断开路径释放；不得通过 Debug/Display/Serialize 泄漏。
- 私钥正文只存在于 Rust Core 的认证与公钥派生路径，不得进入前端、日志或应用配置文件。公钥派生复用 SSH infrastructure 的私钥解析器，窄化 credential IPC 只接收凭证 ID 并只返回标准 OpenSSH 公钥文本。
- host-key unknown 需要用户明确接受；changed 必须阻断。
- 敏感值仅允许进入一次性认证或窄化 vault IPC DTO；凭证摘要列表只返回 ID、名称、类型和算法元数据，并允许在 vault 锁定时读取，以保持 profile 引用可解释。读取密码、私钥正文及凭证库写操作仍由后端要求解锁；连接编辑器更改 profile 的凭证引用前由前端先完成解锁交互。前端只有在凭证管理中由用户明确点击“显示”后才可恢复当前选中的单条密码，私钥内容没有返回 IPC。任何敏感值都禁止进入日志和 panic message。
- 整体 clear 删除 `secrets.vault` 和内存派生密钥并解除 profile 引用，同时保持 profile/workspace 实体不变；存储删除失败时必须保留运行时状态并返回稳定错误，不得伪报成功。
- 主密码变更必须在后端验证旧密码，使用新 salt/KDF 重新包装同一个随机 data key 并原子写回；不得把 data key 或逐条凭证明文送入 WebView。Windows 锁屏与凭证会话到期只锁定 runtime key，不删除凭证或终止既有 SSH/SFTP 会话，系统解锁不自动解锁 vault。
- 手动“锁定终端和凭证”必须先完成后端 vault lock 再进入前端锁屏；主密码验证成功后通过既有 vault unlock 同时恢复两者。前端终端锁只阻断当前应用交互，会话继续运行，状态不得持久化或宣称为 OS 级安全边界。
- 初始化与恢复轮换的每个系统文件选择器之前都必须显示明确的前端确认；用户取消属于正常中止，不映射为错误。恢复重置拆为选择验证旧密钥与保存提交新密钥两个 IPC 阶段：准备 IPC 必须先完整校验恢复文件格式、vault ID、generation 与 AEAD 包装，成功前前端不得显示或收集新主密码；验证成功后前端才显示新密码表单，随后显示“保存新恢复密钥”，用户再次点击后才能打开保存窗口。阶段间当前/替代恢复材料只以 zeroizing 类型暂存在 Rust `CredentialState`，返回、关闭或取消时由清理 IPC 删除，路径与内容不得进入 WebView。恢复文件只在用户选定保存目标后写入，默认文件名为 `qterm-recovery-{Unix 时间戳}.key`。恢复重置使用新主密码重新包装原 data key，并生成下一代恢复文件使旧文件失效；替代恢复文件保存取消或失败时不得修改 vault。旧版 vault 不迁移，只允许经现有破坏性确认流程定向清除 vault 与 credential references。
- Tauri capabilities 使用最小权限；前端不能直接执行任意 shell 或读取任意文件。
- 安全关键行为必须由真实 sshd/SFTP、密码与私钥 fixture 集成测试保护。
