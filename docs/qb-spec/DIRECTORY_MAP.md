# Directory Map

## Root Directories

- `src/`：负责 React 展示、用户交互和 Tauri IPC 客户端；不读取私钥、不实现 SSH 规则，也不持久化敏感凭据。
- `src-tauri/`：负责桌面运行时、应用用例、领域规则和基础设施适配器；不承载 React 页面状态。
- `docs/qb-spec/`：负责长期产品上下文、需求规格和实施计划；不作为运行时代码或配置来源。
- `.github/`：负责持续集成、依赖更新和原生桌面产物构建自动化；不包含产品业务逻辑、发布凭据或部署实现。

## Important Files

- `src/main.tsx`：React 入口，同步设置默认 `data-theme="dark"`，在首次渲染前引导已保存主题并挂载应用根组件；不持有 feature theme state。
- `src/app/app.css`、`src/app/styles/themes/{dark,light}.css`：固定顺序样式 manifest 与两套预设 semantic token；Dark 保持缺省，Light compatibility override 只承接尚未语义化的旧 feature 颜色。
- `src/app/theme/AppThemeProvider.tsx`：应用级主题唯一状态 owner，负责 bootstrap、preview/commit/restore，以及 DOM、xterm 和原生窗口同步；不进入 Workspace persistence，也不允许任意主题值。
- `src/app/App.tsx`：前端组合入口，只装配 App theme、Workspace provider 与 shell；不直接调用底层 SSH 库。
- `src/workspace/WorkspaceShell.tsx`：顶部 Workspace 标签、工具轨、Terminal/Files/Network 认证路由、route 凭证库解锁、关闭编排和快捷键入口；不解析跳板图、布局树或 SSH 协议。
- `src/workspace/model.ts`、`layout.ts`、`reducer.ts`：可持久化工作区契约、纯布局树变换与低频结构状态；不持有 session、xterm 或凭据。
- `src/workspace/WorkspaceProvider.tsx`：Workspace 持久化与按 `blockId` 隔离的 Terminal/File/Network runtime 编排边界，并展示结构化 route 节点事件；Files 与 Network 远程 session 独立于终端，且不持久化活动转发状态。
- `src/workspace/workspaceRuntime.ts`：Workspace runtime 类型、默认值、epoch/failure key、connection intent 与 route notice 纯规则；不持有 React state 或可变全局单例。
- `src/workspace/connectionProgress.ts`、`src/components/ConnectionRouteProgress.tsx`：三类 SSH Block 共用的 route 事件展示状态映射与悬浮进度组件；不管理 session、认证、失败详情或持久化。
- `src/components/Button.tsx`、`button.css`：共享文本按钮、图标按钮与非交互状态标签的语义、尺寸、主题和可访问契约；不拥有 feature 事件、tabs、菜单项、列表行或选择卡片行为。
- `src/workspace/fileWindow.ts`：终端快捷方式和右侧工具轨共用的文件窗口打开策略；不创建 session 或读取文件系统。
- `src/workspace/networkWindow.ts`：远程终端快捷方式和右侧工具轨共用的 Network Block 打开策略；不创建 session 或启动规则。
- `src/network/NetworkPane.tsx`、`NetworkRuleDialog.tsx`、`NetworkAccessDialog.tsx`：按 profile 共享的 Local/Remote/SOCKS5 规则列表、编辑、暴露警告、访问地址复制和 Block 局部启停交互；实验浏览器区只请求受限 IPC，不传输隧道字节、启动任意进程或保存认证材料。
- `src/components/dialogs/ConnectionAuthDialog.tsx`：一次性密码、已有凭证与 SSH Agent 的人工连接入口；本次选择不回写 profile。
- `src/components/dialogs/CredentialDialog.tsx`、`ChangeMasterPasswordDialog.tsx`：双栏凭证库管理、锁定门、密码/私钥操作、强清库确认和主密码迁移表单；不读取私钥正文或实现加密。
- `src/components/dialogs/MasterPasswordDialog.tsx`：主密码初始化/解锁入口；不列出、解密或管理已保存凭据。
- `src/components/dialogs/SettingsDialog.tsx`：系统设置分类、保存编排与反馈；`ConfigurationDirectorySetting.tsx` 负责整个配置根的输入/选择/恢复默认，`ConfigurationPaths.tsx` 负责只读派生路径预览；这些组件不迁移数据、拥有锁定计时或监听系统会话。
- `src/components/dialogs/ConnectionDialog.tsx`：连接、分组、凭证引用、显式跃点编辑和不兼容配置清除确认入口；展示后端候选与原因，不拥有 route 校验或文件删除授权。
- `src/components/dialogs/connection/`、`credential/`：Connection jump/反馈展示、纯 profile 模型与 Credential 浮层/安全提示局部模块；父 dialog 继续拥有 draft、选择和 nested dialog 生命周期。
- `src/components/dialogs/SshConfigImportDialog.tsx`：SSH Config 文件选择、连接信息/凭证双 Tab 与批量导入界面；负责默认未分组、连接选择和逐项私钥授权，不接收设备路径或私钥正文。
- `src/terminal/TerminalPanel.tsx`、`terminalTheme.ts`：每个 Block 的 xterm 生命周期、直接输出 writer、OSC 工作目录、PTY 尺寸适配与 semantic token palette registry；不管理连接配置、布局树或 theme selection。
- `src/files/FileBrowserPane.tsx`、`FileList.tsx`、`fileBrowserModel.ts`、`CodeEditor.tsx`、`MarkdownPreview.tsx`：内部文件窗口的目录导航、虚拟列表/排序纯规则、下载、瞬时预览编辑状态与按需编辑/渲染组件；不依赖 TerminalRuntime，不直接读取本地文件或实现 SFTP。
- `src/lib/tauri/profiles.ts`：连接配置、有序跃点候选/route 要求、不兼容存储清除与 SSH Config 导入 IPC 客户端契约；不包含配置路径、私钥路径、强制删除参数或领域校验。
- `src/lib/tauri/credentials.ts`：密码/私钥凭证库的窄 IPC 契约；不实现 KDF、加密或 JSON 访问。
- `src/lib/tauri/settings.ts`：配置根选择、派生存储布局快照与设备安全设置的窄 IPC 契约；不开放分区路径写入、缓存或执行锁定策略。
- `src/lib/tauri/sessions.ts`：以目标 profile ID 建连的 SSH 会话命令与带节点/阶段的有序状态 Channel 契约；不解析 route、主机密钥规则或协议状态机。
- `src/lib/tauri/transfers.ts`：单文件 SFTP 选择、启动、进度和取消 IPC 契约；不直接访问本地或远程文件系统。
- `src/lib/tauri/files.ts`：本地/远程目录、受限文件读取、带修订保存与 Files-only SSH connect IPC 契约；不执行文件系统或 SFTP 操作。
- `src/lib/tauri/network.ts`：Network 规则 CRUD、独立 SSH session 与规则启停的窄 IPC 契约；TCP 字节不经过 WebView。
- `src/lib/tauri/browserProxy.ts`：桌面端 Chrome/Edge 代理浏览器检测与启动的固定枚举 IPC 契约；不接收可执行路径、任意参数或用户 Profile。
- `src/lib/tauri/workspaces.ts`：版本化 Workspace 文档的 load/save IPC 契约；不包含运行时会话字段。
- `src/lib/tauri/window.ts`：桌面平台判定与当前窗口控制适配；不拥有 Workspace 状态或窗口视觉样式。
- `src-tauri/src/main.rs`：原生可执行入口，只委托给库组合根。
- `src-tauri/src/lib.rs`：Tauri 组合根，注册 commands、装配 adapters，先从 home locator 解析配置根，再派生并初始化 root/data/device/cache 后构造全部 repositories；不读取旧 AppData 位置或在 repository 内重复计算全局路径。
- `src-tauri/src/domain/profile.rs`：连接配置、最多 4 个显式有序跃点、候选资格与引用完整性规则；不包含 IPC、凭证明文或 JSON 序列化模型。
- `src-tauri/src/domain/auth.rs`：短期凭据包装、可执行认证请求与稳定认证失败；不表达 profile 的 `manual` 策略，也不依赖 `russh` 或 Tauri。
- `src-tauri/src/domain/credential.rs`、`ports/credential_vault.rs`、`application/credential_service.rs`：vault 领域语义、外部存储端口与用例边界；不依赖具体密码学文件格式或 UI。
- `src-tauri/src/domain/settings.rs`、`ports/settings_repository.rs`、`application/settings_service.rs`：安全设置默认值、范围、存储端口与用例；不依赖 JSON、Tauri 或 Windows API。
- `src-tauri/src/application/credential_lifecycle.rs`：统一拥有凭证解锁时间、deadline generation、锁定原因与 data-key 生命周期编排；不依赖 Tokio timer、Tauri event 或 Win32 类型。
- `src-tauri/src/application/credential_workflow.rs`：恢复重置与私钥草稿的 opaque pending 状态、替换、完成和取消语义；secret bytes 保持 zeroizing 且不进入 DTO。
- `src-tauri/src/application/ssh_config_import.rs`：SSH Config preview 生命周期、候选重复判断、唯一命名与无分组 profile input 映射；不依赖 Tauri 对话框或 command DTO。
- `src-tauri/src/domain/session.rs`：主机密钥比较、route 节点/阶段事件和多跳会话状态迁移；不执行网络连接或文件读写。
- `src-tauri/src/domain/transfer.rs`：远程路径边界和稳定传输事件；不依赖 SFTP、Tauri 或本地文件 API。
- `src-tauri/src/domain/files.rs`：稳定目录列表、文件条目与排序/数量边界；不依赖文件系统、SFTP 或 Tauri。
- `src-tauri/src/application/file_service.rs`：本地文件预览限制、UTF-8 校验、内容修订与原子保存用例；不依赖 Tauri UI 或 SFTP 类型。
- `src-tauri/src/domain/workspace.rs`：Workspace/split tree 不变量与资源上限；不依赖前端状态、Tauri 或 JSON 格式。
- `src-tauri/src/domain/network.rs`、`ports/network_repository.rs`、`application/network_service.rs`：转发规则、不变量、profile 引用与配置用例边界；不包含 socket、SSH channel、运行状态或持久化格式。
- `src-tauri/src/commands/network.rs`：Network 严格 DTO、profile-bound session 建连和规则启停 IPC；不实现 SOCKS5 或 TCP 数据泵。
- `src-tauri/src/commands/browser.rs`：Chrome/Edge 白名单 DTO、SOCKS5 规则类型复核与浏览器 adapter 调用；不接受可执行路径、命令参数或实现平台探测。
- `src-tauri/src/infrastructure/browser/`：共享 SOCKS5 greeting、固定 Chromium 参数和机器本地隔离 Profile，并以 Windows、macOS、Linux adapter 受限探测和无 Shell 启动 Chrome/Edge；不修改系统代理、支持沙箱化 Linux 浏览器、复用日常 Profile 或管理浏览器退出。
- `src-tauri/src/infrastructure/persistence/json_network_repository.rs`：`network-forwards.json` schema v1 的严格、无敏感字段、原子持久化适配器。
- `src-tauri/src/ports/settings_repository.rs`、`src-tauri/src/infrastructure/persistence/json_appearance_settings_repository.rs`：设备外观 port 与独立 `device/appearance.json` schema v1 适配器；只保存 Dark/Light，不覆盖损坏或未来文件，也不修改 security settings。
- `src-tauri/src/infrastructure/ssh/forwarding.rs`：本地 listener、SOCKS5 CONNECT、Remote target 路由、有界转发任务与 TCP/SSH 双向数据泵；第三方 channel 类型不得离开 infrastructure。
- `src-tauri/src/ports/profile_repository.rs`：应用层拥有的连接配置 repository 契约；不规定文件格式。
- `src-tauri/src/infrastructure/ssh/client.rs`、`client/{handler,session,network,transfer}.rs`：稳定 `SshSessionManager` façade 与内部 route/host-key handler、session runner、forward runtime、SFTP/transfer 实现；第三方 russh/SFTP 类型只在该 infrastructure 子树内，测试位于 `client/tests.rs`。
- `src-tauri/tauri.conf.json`、`tauri.macos.conf.json`：通用无边框桌面窗口与 macOS 原生 Overlay 标题栏的分层配置，以及构建和打包入口；不承载 Workspace 或 SSH 规则。
- `src-tauri/capabilities/default.json`：主窗口最小 Tauri 权限清单。
- `package.json`、`src-tauri/Cargo.toml`：前端与 Rust 的直接依赖及质量命令入口。
- `.github/workflows/build-desktop.yml`：macOS ARM64、Windows x64 与 Linux x64 的版本标签/手动构建和 workflow artifact 上传入口；不发布 Release 或执行部署。

## Module Responsibilities

- `src/app/`：负责顶层布局、feature 组合与应用级预设主题生命周期；不承载认证、连接或传输规则。
- `src/workspace/`：负责工作区结构模型、布局树变换、顶部 Workspace 导航和 block runtime 编排；不读取本地文件或实现 SSH/SFTP。
- `src/terminal/`：负责 xterm 实例及终端 I/O 适配；不持久化 buffer 或拥有 Workspace 生命周期。
- `src/files/`：负责内部文件窗口展示、导航、下载反馈与瞬时预览编辑状态；不直接访问本地文件系统或 SSH infrastructure。
- `src/network/`：负责网络规则配置 UI、共享刷新、运行状态展示、安全暴露提示和可复制访问地址派生；不实现 SSH/SOCKS5 协议、浏览器进程启动或持久化。
- `src/components/`：负责跨 feature 的小型展示与交互原语；不吸收 feature 状态、业务编排或领域规则。
- `src/components/dialogs/`：负责连接、传输、设置、帮助与确认弹窗；不定义领域规则或直接操作 Rust infrastructure。
- `src/test/`：负责前端测试运行环境；不放置生产代码。
- `src/lib/tauri/`：负责类型安全的前端 IPC 调用；不持有领域规则或直接访问文件系统。
- `src-tauri/src/commands/`：负责 IPC DTO 校验、secret 包装、用例调用和错误映射；不实现领域决策或 SSH 协议。
- `src-tauri/src/application/`：负责 profile、credential、workspace、network、host-key 信任和文件内容安全用例；不依赖 Tauri UI 或具体 SSH 库类型。
- `src-tauri/src/domain/`：负责稳定领域模型、状态和规则；不依赖 Tauri、russh 或持久化格式。
- `src-tauri/src/ports/`：负责由应用层拥有的外部能力接口；不包含具体适配实现。
- `src-tauri/src/infrastructure/`：负责 persistence、russh、known-hosts、PTY、SFTP 和受限本机浏览器启动适配；不把第三方库或 Win32 类型泄漏到 IPC 或 domain。
- `src-tauri/src/infrastructure/persistence/`：负责当前 schema 的严格 JSON 读取、敏感字段拒绝、原子写入，以及 credential vault 的 Argon2id + envelope AES-GCM 适配；不负责旧版本迁移或 UI 流程。
- `src-tauri/src/infrastructure/windows/`：负责 Windows WTS session-lock 注册、消息映射与窗口 hook 生命周期；Win32 类型不得越过该 adapter。
- `src-tauri/src/infrastructure/ssh/`：负责 `russh` 私钥凭证解析、SSH Config 有界解析、平台 SSH Agent 签名适配、纯 Rust 多跳连接生命周期、PTY、SFTP 与有界 TCP forwarding；只读取系统选择器明确授权的配置入口及受限 Include，并仅在用户明确授权后读取候选私钥，不泄漏私钥正文或第三方 channel 类型。
- `src-tauri/src/infrastructure/ssh/config_import.rs`：负责 SSH Config 的受限读取、Include 展开、Match 隔离、候选解析与私钥元数据检查；不执行 Match 或代理命令。

## Forbidden Contents By Directory

- `src/`：禁止私钥正文、后端文件读取、SSH/加密实现和直接密码/口令持久化；只允许短期 UI secret state 与窄 vault IPC。
- `commands/`：禁止业务状态机、持久化策略和原始敏感值日志。
- `application/` 与 `domain/`：禁止依赖 Tauri、russh、xterm.js 或具体 JSON model。
- `infrastructure/`：禁止定义前端契约或反向控制应用层规则。
- `docs/qb-spec/`：禁止密钥、密码、口令或其他真实凭据。
- `.github/`：禁止提交签名证书、访问令牌或其他真实凭据；敏感值只能来自 GitHub Actions Secrets。
