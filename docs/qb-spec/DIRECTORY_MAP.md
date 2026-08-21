# Directory Map

## Root Directories

- `src/`：负责 React 展示、用户交互和 Tauri IPC 客户端；不读取私钥、不实现 SSH 规则，也不持久化敏感凭据。
- `src-tauri/`：负责桌面运行时、应用用例、领域规则和基础设施适配器；不承载 React 页面状态。
- `docs/qb-spec/`：负责长期产品上下文、需求规格和实施计划；不作为运行时代码或配置来源。
- `.github/`：负责持续集成、依赖更新和原生桌面产物构建自动化；不包含产品业务逻辑、发布凭据或部署实现。

## Important Files

- `src/main.tsx`：React 入口，只负责挂载应用根组件。
- `src/app/App.tsx`：前端组合入口，只装配 Workspace provider 与 shell；不直接调用底层 SSH 库。
- `src/workspace/WorkspaceShell.tsx`：顶部 Workspace 标签、工具轨、Terminal/Files/Network 认证路由、关闭编排和快捷键入口；不实现布局树变换或 SSH 协议。
- `src/workspace/model.ts`、`layout.ts`、`reducer.ts`：可持久化工作区契约、纯布局树变换与低频结构状态；不持有 session、xterm 或凭据。
- `src/workspace/WorkspaceProvider.tsx`：Workspace 持久化与按 `blockId` 隔离的 Terminal/File/Network runtime 编排边界；Files 与 Network 远程 session 独立于终端，且不持久化活动转发状态。
- `src/workspace/fileWindow.ts`：终端快捷方式和右侧工具轨共用的文件窗口打开策略；不创建 session 或读取文件系统。
- `src/workspace/networkWindow.ts`：远程终端快捷方式和右侧工具轨共用的 Network Block 打开策略；不创建 session 或启动规则。
- `src/network/NetworkPane.tsx`、`NetworkRuleDialog.tsx`：按 profile 共享的 Local/Remote/SOCKS5 规则列表、编辑、暴露警告和 Block 局部启停交互；不传输隧道字节或保存认证材料。
- `src/components/dialogs/ConnectionAuthDialog.tsx`：一次性密码、已有凭证与 SSH Agent 的人工连接入口；本次选择不回写 profile。
- `src/components/dialogs/CredentialDialog.tsx`、`ChangeMasterPasswordDialog.tsx`：双栏凭证库管理、锁定门、密码/私钥操作、强清库确认和主密码迁移表单；不读取私钥正文或实现加密。
- `src/components/dialogs/MasterPasswordDialog.tsx`：主密码初始化/解锁入口；不列出、解密或管理已保存凭据。
- `src/components/dialogs/SettingsDialog.tsx`：设备安全设置页面与显式保存反馈；不拥有锁定计时或 Windows 会话监听。
- `src/components/dialogs/ConnectionDialog.tsx`：连接、分组与凭证引用管理入口；只允许显式查看当前引用的单条密码。
- `src/components/dialogs/SshConfigImportDialog.tsx`：SSH Config 文件选择、连接信息/凭证双 Tab 与批量导入界面；负责默认未分组、连接选择和逐项私钥授权，不接收设备路径或私钥正文。
- `src/terminal/TerminalPanel.tsx`：每个 Block 的 xterm 生命周期、直接输出 writer、OSC 工作目录和 PTY 尺寸适配；不管理连接配置或布局树。
- `src/files/FileBrowserPane.tsx`、`CodeEditor.tsx`、`MarkdownPreview.tsx`：内部文件窗口的目录导航、下载、瞬时预览编辑状态与按需编辑/渲染组件；不依赖 TerminalRuntime，不直接读取本地文件或实现 SFTP。
- `src/lib/tauri/profiles.ts`：连接配置与 SSH Config 导入 IPC 客户端契约；导入协议不包含配置路径或私钥路径，也不实现校验、持久化或凭据处理。
- `src/lib/tauri/credentials.ts`：密码/私钥凭证库的窄 IPC 契约；不实现 KDF、加密或 JSON 访问。
- `src/lib/tauri/settings.ts`：设备安全设置的窄 IPC 契约；不缓存或执行锁定策略。
- `src/lib/tauri/sessions.ts`：SSH 会话命令与有序状态 Channel 契约；不实现主机密钥规则或协议状态机。
- `src/lib/tauri/transfers.ts`：单文件 SFTP 选择、启动、进度和取消 IPC 契约；不直接访问本地或远程文件系统。
- `src/lib/tauri/files.ts`：本地/远程目录、受限文件读取、带修订保存与 Files-only SSH connect IPC 契约；不执行文件系统或 SFTP 操作。
- `src/lib/tauri/network.ts`：Network 规则 CRUD、独立 SSH session 与规则启停的窄 IPC 契约；TCP 字节不经过 WebView。
- `src/lib/tauri/workspaces.ts`：版本化 Workspace 文档的 load/save IPC 契约；不包含运行时会话字段。
- `src/lib/tauri/window.ts`：桌面平台判定与当前窗口控制适配；不拥有 Workspace 状态或窗口视觉样式。
- `src-tauri/src/main.rs`：原生可执行入口，只委托给库组合根。
- `src-tauri/src/lib.rs`：Tauri 组合根，注册 commands、装配 adapters，并将可迁移连接/凭证定位到 `~/.qterm`；设备状态仍使用 app-data。
- `src-tauri/src/domain/profile.rs`：连接配置领域模型和校验规则；不包含 IPC 或 JSON 序列化模型。
- `src-tauri/src/domain/auth.rs`：短期凭据包装、可执行认证请求与稳定认证失败；不表达 profile 的 `manual` 策略，也不依赖 `russh` 或 Tauri。
- `src-tauri/src/domain/credential.rs`、`ports/credential_vault.rs`、`application/credential_service.rs`：vault 领域语义、外部存储端口与用例边界；不依赖具体密码学文件格式或 UI。
- `src-tauri/src/domain/settings.rs`、`ports/settings_repository.rs`、`application/settings_service.rs`：安全设置默认值、范围、存储端口与用例；不依赖 JSON、Tauri 或 Windows API。
- `src-tauri/src/application/credential_lifecycle.rs`：统一拥有凭证解锁时间、deadline generation、锁定原因与 data-key 生命周期编排；不依赖 Tokio timer、Tauri event 或 Win32 类型。
- `src-tauri/src/domain/session.rs`：主机密钥比较、连接目标规则和会话状态迁移；不执行网络连接或文件读写。
- `src-tauri/src/domain/transfer.rs`：远程路径边界和稳定传输事件；不依赖 SFTP、Tauri 或本地文件 API。
- `src-tauri/src/domain/files.rs`：稳定目录列表、文件条目与排序/数量边界；不依赖文件系统、SFTP 或 Tauri。
- `src-tauri/src/application/file_service.rs`：本地文件预览限制、UTF-8 校验、内容修订与原子保存用例；不依赖 Tauri UI 或 SFTP 类型。
- `src-tauri/src/domain/workspace.rs`：Workspace/split tree 不变量与资源上限；不依赖前端状态、Tauri 或 JSON 格式。
- `src-tauri/src/domain/network.rs`、`ports/network_repository.rs`、`application/network_service.rs`：转发规则、不变量、profile 引用与配置用例边界；不包含 socket、SSH channel、运行状态或持久化格式。
- `src-tauri/src/commands/network.rs`：Network 严格 DTO、profile-bound session 建连和规则启停 IPC；不实现 SOCKS5 或 TCP 数据泵。
- `src-tauri/src/infrastructure/persistence/json_network_repository.rs`：`network-forwards.json` schema v1 的严格、无敏感字段、原子持久化适配器。
- `src-tauri/src/infrastructure/ssh/forwarding.rs`：本地 listener、SOCKS5 CONNECT、Remote target 路由、有界转发任务与 TCP/SSH 双向数据泵；第三方 channel 类型不得离开 infrastructure。
- `src-tauri/src/ports/profile_repository.rs`：应用层拥有的连接配置 repository 契约；不规定文件格式。
- `src-tauri/tauri.conf.json`：全平台统一无边框桌面窗口、构建和打包配置；不承载 Workspace 或 SSH 规则。
- `src-tauri/capabilities/default.json`：主窗口最小 Tauri 权限清单。
- `package.json`、`src-tauri/Cargo.toml`：前端与 Rust 的直接依赖及质量命令入口。
- `.github/workflows/build-desktop.yml`：macOS ARM64、Windows x64 与 Linux x64 的版本标签/手动构建和 workflow artifact 上传入口；不发布 Release 或执行部署。

## Module Responsibilities

- `src/app/`：负责顶层布局与 feature 组合；不承载认证、连接或传输规则。
- `src/workspace/`：负责工作区结构模型、布局树变换、顶部 Workspace 导航和 block runtime 编排；不读取本地文件或实现 SSH/SFTP。
- `src/terminal/`：负责 xterm 实例及终端 I/O 适配；不持久化 buffer 或拥有 Workspace 生命周期。
- `src/files/`：负责内部文件窗口展示、导航、下载反馈与瞬时预览编辑状态；不直接访问本地文件系统或 SSH infrastructure。
- `src/network/`：负责网络规则配置 UI、共享刷新、运行状态展示与安全暴露提示；不实现 SSH/SOCKS5 协议或持久化。
- `src/components/dialogs/`：负责连接、传输、设置、帮助与确认弹窗；不定义领域规则或直接操作 Rust infrastructure。
- `src/test/`：负责前端测试运行环境；不放置生产代码。
- `src/lib/tauri/`：负责类型安全的前端 IPC 调用；不持有领域规则或直接访问文件系统。
- `src-tauri/src/commands/`：负责 IPC DTO 校验、secret 包装、用例调用和错误映射；不实现领域决策或 SSH 协议。
- `src-tauri/src/application/`：负责 profile、credential、workspace、network、host-key 信任和文件内容安全用例；不依赖 Tauri UI 或具体 SSH 库类型。
- `src-tauri/src/domain/`：负责稳定领域模型、状态和规则；不依赖 Tauri、russh 或持久化格式。
- `src-tauri/src/ports/`：负责由应用层拥有的外部能力接口；不包含具体适配实现。
- `src-tauri/src/infrastructure/`：负责 persistence、russh、known-hosts、PTY 和 SFTP 的 ports 实现；不把第三方库类型泄漏到 IPC 或 domain。
- `src-tauri/src/infrastructure/persistence/`：负责当前 schema 的严格 JSON 读取、敏感字段拒绝、原子写入，以及 credential vault 的 Argon2id + envelope AES-GCM 适配；不负责旧版本迁移或 UI 流程。
- `src-tauri/src/infrastructure/windows/`：负责 Windows WTS session-lock 注册、消息映射与窗口 hook 生命周期；Win32 类型不得越过该 adapter。
- `src-tauri/src/infrastructure/ssh/`：负责 `russh` 私钥凭证解析、SSH Config 有界解析、平台 SSH Agent 签名适配、带用途连接生命周期、PTY、SFTP 与有界 TCP forwarding；只读取系统选择器明确授权的配置入口及受限 Include，并仅在用户明确授权后读取候选私钥，不泄漏私钥正文或第三方 channel 类型。
- `src-tauri/src/infrastructure/ssh/config_import.rs`：负责 SSH Config 的受限读取、Include 展开、Match 隔离、候选解析与私钥元数据检查；不执行 Match 或代理命令。

## Forbidden Contents By Directory

- `src/`：禁止私钥正文、后端文件读取、SSH/加密实现和直接密码/口令持久化；只允许短期 UI secret state 与窄 vault IPC。
- `commands/`：禁止业务状态机、持久化策略和原始敏感值日志。
- `application/` 与 `domain/`：禁止依赖 Tauri、russh、xterm.js 或具体 JSON model。
- `infrastructure/`：禁止定义前端契约或反向控制应用层规则。
- `docs/qb-spec/`：禁止密钥、密码、口令或其他真实凭据。
- `.github/`：禁止提交签名证书、访问令牌或其他真实凭据；敏感值只能来自 GitHub Actions Secrets。
