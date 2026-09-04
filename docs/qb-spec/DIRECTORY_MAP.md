# Directory Map

## Root Directories

- `.agents/skills/`：负责 Qterm 项目级、可自动发现的 agent 工作流与稳定规范入口；不保存单次任务计划、运行时代码或重复的可执行配置。
- `src/`：负责 React 展示、用户交互和 Tauri IPC 客户端；不读取私钥、不实现 SSH 规则，也不持久化敏感凭据。
- `src-tauri/`：负责桌面运行时、应用用例、领域规则和基础设施适配器；不承载 React 页面状态。
- `scripts/`：负责仓库级可测试命令入口；当前只为 Tauri `dev` 注入开发 flavor 并把其他 CLI 参数原样转发，不承载应用业务、发布凭据或 shell 拼接。
- `docs/qb-spec/`：负责长期产品上下文、需求规格和实施计划；不作为运行时代码或配置来源。
- `.github/`：负责持续集成、依赖更新和原生桌面产物构建自动化；不包含产品业务逻辑、发布凭据或部署实现。

## Important Files

- `native/conpty/`：G0 隔离原型的上游版本锁、MIT 许可与原生输出边界补丁；`scripts/build-conpty-prototype.ps1` 构建未发布的测试 host，`scripts/conpty-ordered-probe-consumer.mjs` 只供真实 PTY 探针消费 QTR0 帧。尚未作为生产 runtime 或应用 IPC 协议接线。

- `src/components/ThemedTooltipButton.tsx`、`themedTooltip.css`：跨终端、Git、文件和网络窗口共享的主题提示按钮与浮层样式；只负责提示展示、定位和无障碍交互，不拥有操作业务逻辑。`src/workspace/BlockHeaderClose.tsx` 组合窗口头部关闭入口。

- `src/terminal/terminalLayout.ts`：终端尺寸测量与布局同步 owner；Windows ConPTY 在拖动停稳并处理已接收输出后提交尺寸，其余终端即时适配；`resizeScheduler.ts` 继续负责有序 IPC 与去重。`scripts/conpty-resize-probe.mjs` 和 `src-tauri/examples/conpty_resize_probe.rs` 提供真实 Windows PTY 回归检查。

- `src/terminal/notifications/`：实验性终端通知的有界流解析、epoch 隔离、未读派生状态、限流与设置 provider；`TerminalProtocolTag.tsx` 展示统一协议标签与提示，`workspaceNotice.ts` 管理前台瞬时气泡，`WorkspaceNotificationBubble.tsx` 负责定位、暂停倒计时与交互；只观察实时输出，不修改渲染字节、不拥有 session 或持久化 Workspace。
- `src/components/dialogs/TerminalNotificationSetting.tsx`、`src/lib/tauri/notifications.ts`：高级设置开关展示与通知 IPC façade；缺失设置默认开启，错误不覆盖已有设置。
- `src/terminal/TerminalHeaderActions.tsx`、`src/workspace/workspaceFocus.ts`：终端头部操作菜单与工作区焦点辅助；由布局/工作区入口组合，不持有通知策略。
- `src-tauri/src/application/notification_service.rs`、`ports/notification.rs`、`commands/notification.rs`、`infrastructure/notifications.rs`、`infrastructure/notifications/macos.rs`、`infrastructure/persistence/json_notification_settings_repository.rs`：通知用例、端口、IPC、原生发送与独立 `device/notifications.json` 持久化；开关与发送串行，发送用例按独立正文偏好裁剪内容，原生接受已净化的来源与可选正文。
- `docs/terminal-notifications.md`：终端通知协议范围、CLI 接入与人工复验说明。

- `.agents/skills/qterm-maintainable-modules/SKILL.md`：非平凡功能增长与结构调整的 owner-first 开发入口，要求窄 façade、capability modules、相邻行为测试和源码尺寸 ratchet；具体数值继续以 `scripts/check-source-size.mjs` 与 baseline 为事实源。
- `src/main.tsx`：React 入口，同步设置默认 `data-theme="dark"`，在首次渲染前引导已保存主题并挂载应用根组件；不持有 feature theme state。
- `src/editor/editorLanguage.ts`、`useEditorLanguage.ts`：跨 Files/Git 编辑表面的文件名语言识别、精选 CodeMirror 解析器动态加载/缓存/纯文本回退与 React 加载生命周期 owner；不拥有文件读取、Git diff、lint 规则、编辑状态或持久化。
- `src/app/app.css`、`src/app/styles/themes/{dark,light,cyberpunk}.css`：固定顺序样式 manifest 与三套封闭预设 semantic token；Dark 保持缺省，Cyberpunk 复用 Dark 原生窗口模式，Light compatibility override 只承接尚未语义化的旧 feature 颜色。
- `src/app/theme/AppThemeProvider.tsx`：应用级主题唯一状态 owner，负责 bootstrap、preview/commit/restore，以及 DOM、xterm 和原生窗口同步；不进入 Workspace persistence，也不允许任意主题值。
- `src/app/App.tsx`、`useBrowserContextMenuGuard.ts`：前端组合入口装配 App theme、Workspace provider、shell 与仅阻止 WebView 原生菜单的应用级 `contextmenu` 生命周期；不停止 feature 事件传播、不决定 Qterm 菜单内容，也不直接调用底层 SSH 库。
- `src/workspace/WorkspaceTabStrip.tsx`、`WorkspaceTabMenu.tsx`、`WorkspaceBatchCloseDialog.tsx`、`workspaceClose.ts`：工作区右键菜单、左右/其他目标选择及一次性批量关闭确认；复用现有 closeSessions，reducer 原子移除并保留基准页，不持有新的会话状态。
- `src/workspace/WorkspaceTabs.tsx`、`workspaceTabDeck.ts`、`useWorkspaceTabDeck.ts`、`useWorkspaceTabDrag.ts`：工作区导航、窄窗口堆叠几何、稳定悬停/键盘展开、可中断弹簧、可见区域拖拽；只拥有导航展示状态，复用 Workspace Context，不持久化堆叠状态。
- `src/workspace/WorkspaceShell.tsx`：组合顶部 Workspace 导航、工具轨、Terminal/Files/Network/Git 认证路由、route 凭证库解锁、关闭编排、快捷键与一次性启动更新提示入口；不请求任意更新地址、解析跳板图、布局树或 SSH 协议。
- `src/workspace/model.ts`、`layout.ts`、`reducer.ts`、`gitRepositoryHistory.ts`：schema v10 可持久化工作区契约、Git `Unbound | Local | Remote` target、按本机或 profile 隔离的有界 Git 仓库 MRU、使用调用方提供稳定 ID 的纯布局树变换与低频结构状态；不持有 session、xterm、Git 快照、远程命令、一次性启动目录或凭据。
- `src/workspace/WorkspaceProvider.tsx`、`useWorkspacePersistence.ts`：兼容的单一 Workspace Context façade，以及 hydration、debounced save、close flush 和 profile refresh owner；Git target retarget 可在同 profile 的已连接 Git session 上只切换路径，Provider 不直接实现会话事件或连接生命周期，运行时状态不持久化。
- `src/workspace/useWorkspaceRuntimeState.ts`、`useWorkspaceRuntimeController.ts`、`use{Terminal,File,Network,Git}WorkspaceController.ts`：按 `blockId` 隔离的单一 runtime 状态内核、跨用途清理组合器，以及四类独立的事件/connect/disconnect/host-key controller；Git controller 还拥有未持久化 remote target 前的 profile intent 暂存、取消清理与确认复用；共享 epoch、intent、writer、buffer 和 session ownership，不引入第二套 store 或可变全局单例。
- `src/workspace/workspaceRuntime.ts`：Workspace runtime 类型、默认值、epoch/failure key、connection intent 与 route notice 纯规则；不持有 React state 或可变全局单例。
- `src/workspace/connectionProgress.ts`、`src/components/ConnectionRouteProgress.tsx`：Terminal/Files/Network/Git SSH Block 共用的 route 事件展示状态映射与悬浮进度组件；`src/components/HostIdentity.tsx` 统一直连/route 完成态的主机概要、视口浮层和地址复制；这些组件不管理 session、认证、凭证或持久化。
- `src/components/Button.tsx`、`button.css`：共享文本按钮、图标按钮与非交互状态标签的语义、尺寸、主题和可访问契约；不拥有 feature 事件、tabs、菜单项、列表行或选择卡片行为。
- `src/components/dialogs/DialogFrame.tsx`、`dialogFrame.css`、`useDialogCloseTransition.ts`：共享 modal 的结构、焦点栈、进入/退出展示状态与 reduced-motion 生命周期；feature 继续拥有关闭后的业务动作和父级挂载状态，该层不执行保存、删除、连接或持久化。
- `src/workspace/fileWindow.ts`：终端快捷方式和右侧工具轨共用的文件窗口打开策略；不创建 session 或读取文件系统。
- `src/workspace/networkWindow.ts`：远程终端快捷方式和右侧工具轨共用的 Network Block 打开策略；不创建 session 或启动规则。
- `src/workspace/gitWindow.ts`：右侧工具轨共用的 Git Block 上下文打开策略；从本机或远程 Files 路径以及同 profile 的有效 Terminal OSC 7 目录派生显式 target，不解析仓库或执行 Git。
- `src/git/GitPane.tsx`、`gitRepositoryClient.ts`、`useGitCommitInspection.ts`、`gitPaneTypes.ts`、`gitPaneViewModel.ts`、`gitPrimaryAction.ts`、`gitSnapshot.ts`：Git Block 的稳定组合入口、本机/SSH action adapter、前台操作与单飞后台 snapshot epoch 编排、展示快照等价判断、提交检查缓存、浮层定位/丢弃影响等纯展示派生、共享局部模型，以及从 staged/worktree/upstream/ahead/behind 派生单步暂存/提交/Pull/Push/Publish 推荐动作的纯前端策略；同时编排专用冲突详情/解决 client 与最新活动 snapshot，不改变 IPC DTO、不生成 Git 命令、不自动串联 mutation，也不把 session、snapshot、活动子仓库、冲突正文、推荐动作或操作记录写入 Workspace persistence。
- `src/git/gitRepositoryContext.ts`、`useGitRepositoryContext.ts`、`useGitSubmoduleSnapshots.ts`、`useGitRepositoryRowActions.ts`、`GitRepositoryTree.tsx`、`GitPaneSections.tsx`、`GitChangeList.tsx`、`gitChangeListModel.ts`、`GitConflictResolver.tsx`、`GitPrimaryActionButton.tsx`、`GitCommitGraph.tsx`、`GitRepositoryOverlays.tsx`、`GitRepositoryHistoryPopover.tsx`、`GitRepositoryPickerDialog.tsx`、`GitRemoteTargetConfig.tsx`、`gitGraph.ts`：以持久化父仓库 target 为根的安全相对节点模型、仅内存活动仓库/逐层 snapshot cache、直属已初始化子模块的非递归展示预加载、epoch 隔离的父子刷新、逐仓库行操作意图与浮层锚点、可访问的同构仓库树，以及共享存储库/更改/提交图；Git 更改列表使用纯范围模型和共享滚动视口实现大列表有界 DOM 渲染，同时保持完整快照、全局索引和全部行操作；远程 target 配置 presentation 组合精确路径输入、最近仓库与现有受限目录选择器，只拥有草稿对应的 picker 可见性，不直接连接或持久化 target；其余模块负责状态驱动的单步聚合 Git 主按钮与选择性提交分割菜单、commit 鼠标/键盘上下文菜单、安全分支/同步/合并、冲突 manager 与仅内存脱敏操作记录；Submodule 单项初始化/检出记录版本保留在树节点，展示和浮层不直接调用 Tauri IPC、不拥有持久化/session 生命周期，也不递归预扫描孙级或更新 Submodule、不提供 URL/force/remote 配置入口。
- `src/git/editor/`：Git 冲突 marker 的纯前端解析、CodeMirror 行/gutter 装饰与循环导航，以及按需加载的只读 Incoming/Current 双路差异 view adapter；只提供编辑辅助，不判定 Git index readiness、不生成三路解决结果，也不调用 Tauri 或执行 Git mutation。
- `src/git/git.css`、`src/git/styles/`：Git Block 样式的固定顺序 manifest，以及工作区、仓库树、提交图、目标配置、分支/合并/操作浮层、仓库选择与可访问媒体规则；仓库树复用 file/path selected/active tokens 并拥有唯一内部滚动区，不定义组件状态、交互逻辑或主题 token 来源。
- `src/network/NetworkPane.tsx`、`NetworkRuleDialog.tsx`、`NetworkAccessDialog.tsx`：按 profile 共享的 Local/Remote/SOCKS5 规则列表、编辑、暴露警告、访问地址复制和 Block 局部启停交互；实验浏览器区只请求受限 IPC，不传输隧道字节、启动任意进程或保存认证材料。
- `src/components/dialogs/ConnectionAuthDialog.tsx`：一次性密码、已有凭证与 SSH Agent 的人工连接入口；本次选择不回写 profile。
- `src/components/dialogs/CredentialDialog.tsx`、`ChangeMasterPasswordDialog.tsx`：双栏凭证库管理、锁定门、密码/私钥操作、强清库确认和主密码迁移表单；不读取私钥正文或实现加密。
- `src/components/dialogs/MasterPasswordDialog.tsx`：主密码初始化/解锁入口；不列出、解密或管理已保存凭据。
- `src/components/dialogs/SettingsDialog.tsx`：系统设置分类、保存编排、远程目录自动集成确认与反馈；`ConfigurationDirectorySetting.tsx` 负责整个配置根的输入/选择/恢复默认，`ConfigurationPaths.tsx` 负责只读派生路径预览；这些组件不迁移数据、拼接远端命令、拥有锁定计时或监听系统会话。
- `src/components/dialogs/ConnectionDialog.tsx`：连接、分组、凭证引用、显式跃点编辑和不兼容配置清除确认入口；展示后端候选与原因，不拥有 route 校验、列表动效测量或文件删除授权。
- `src/components/dialogs/connection/`、`credential/`：Connection jump/反馈展示、纯 profile 模型、分组内容过渡存在期，以及连接与凭证列表主选择、详情 stage 的局部动效测量和 Credential 浮层/安全提示模块；分组展示组件与 motion hook 不拥有展开意图、draft、业务选择或 persistence，父 dialog 继续拥有这些状态和 nested dialog 生命周期。
- `src/components/dialogs/SshConfigImportDialog.tsx`：SSH Config 文件选择、连接信息/凭证双 Tab 与批量导入界面；负责默认未分组、连接选择和逐项私钥授权，不接收设备路径或私钥正文。
- `src/terminal/TerminalPanel.tsx`、`TerminalStagingStatus.tsx`、`terminalTheme.ts`：每个 Block 的 xterm 生命周期、直接输出 writer、本地剪贴板路径准备与远端暂存任务的有序粘贴、按动作挂载的右下角悬浮状态卡片、OSC 工作目录、PTY 尺寸适配与 semantic token palette registry；悬浮卡片不占用 xterm 布局高度；该层只消费一次性最终粘贴文本，不读取本机文件内容/图片像素、选择缓存/远端临时目录、管理连接配置、布局树或 theme selection。
- `src/files/FileBrowserPane.tsx`、`FileList.tsx`、`fileBrowserModel.ts`、`CodeEditor.tsx`、`MarkdownPreview.tsx`：内部文件窗口的目录导航、虚拟列表/排序纯规则、下载、瞬时预览编辑状态与按需编辑/渲染组件；不依赖 TerminalRuntime，不直接读取本地文件或实现 SFTP。
- `src/lib/tauri/profiles.ts`：连接配置、有序跃点候选/route 要求、不兼容存储清除与 SSH Config 导入 IPC 客户端契约；不包含配置路径、私钥路径、强制删除参数或领域校验。
- `src/lib/tauri/credentials.ts`：密码/私钥凭证库的窄 IPC 契约；不实现 KDF、加密或 JSON 访问。
- `src/lib/tauri/settings.ts`：配置根选择、当前构建模式默认根与派生存储布局快照，以及设备安全、外观、更新和远程终端集成偏好的窄 IPC 契约；不开放 locator 路径、构建模式、分区路径写入、Shell cache 或执行锁定/探测策略。
- `src/lib/updateCheck.ts`：固定 GitHub Latest Release 的超时请求、稳定 SemVer 比较、进程内启动单次去重与固定 Releases opener；不持久化偏好、自动安装或接受任意 URL。
- `src/lib/tauri/sessions.ts`、`localSessions.ts`：远程/本地终端建连、可选一次性初始目录、远程剪贴板暂存 opaque task/progress/cancel，以及本地剪贴板一次性最终路径文本的窄 IPC 契约；不传输文件字节、解析 route、验证文件系统路径、执行 Shell 命令或持久化启动上下文。
- `src/lib/tauri/transfers.ts`：单文件 SFTP 选择、启动、进度和取消 IPC 契约；不直接访问本地或远程文件系统。
- `src/lib/tauri/files.ts`：本地/远程目录、受限文件读取、带修订保存与 Files-only SSH connect IPC 契约；不执行文件系统或 SFTP 操作。
- `src/lib/tauri/network.ts`：Network 规则 CRUD、独立 SSH session 与规则启停的窄 IPC 契约；TCP 字节不经过 WebView。
- `src/lib/tauri/git.ts`：本机及 profile-bound SSH 工作区的快照、直接 Submodule 摘要与单项 initialize/checkout-recorded、remote/merge/冲突状态、stage/unstage/commit、分支/同步/安全 merge，以及 Git-purpose 只读目录浏览窄 IPC 契约；只发送封闭 action union 或 session/profile/path/ref/完整 commit OID/已有 remote name/有界文本与 expected revision，不接受 executable、任意 cwd、shell、子命令、参数数组、Submodule URL/OID selector、recursive/remote/force 标志或凭据。
- `src/lib/tauri/browserProxy.ts`：桌面端 Chrome/Edge 代理浏览器检测与启动的固定枚举 IPC 契约；不接收可执行路径、任意参数或用户 Profile。
- `src/lib/tauri/workspaces.ts`：版本化 Workspace 文档的 load/save IPC 契约；不包含运行时会话字段。
- `src/lib/tauri/window.ts`：桌面平台判定与当前窗口控制适配；不拥有 Workspace 状态或窗口视觉样式。
- `src-tauri/src/main.rs`：原生可执行入口，只委托给库组合根。
- `scripts/tauri.mjs`、`tauri-dev-runner.mjs`：package `tauri` script 的跨平台 ESM 入口，以及只在 macOS `dev` 使用的 app-bundle runner；前者注入开发 config/runner 并原样转发其他命令，后者用参数数组执行 Cargo build、原子更新 `target/tauri-dev/.../Qterm Dev.app` 并运行，不承载业务或发布行为。
- `scripts/check-source-size.mjs`、`source-size-baseline.json`：源码尺寸的确定性类型上限和历史热点不增长 ratchet，由 `pnpm check` 在本地与 CI 共用；baseline 只记录待拆热点，不豁免新增文件或生成新的架构规则。
- `src-tauri/tauri.dev.conf.json`、`Info.dev.plist`：声明 `Qterm Dev` / `com.qiubai.qterm.dev` 开发身份和 macOS dev bundle 元数据，不声明窗口数组或业务配置；plist 使用非保留文件名，正式身份继续以 `tauri.conf.json` 为事实源。
- `src-tauri/src/lib.rs`：Tauri 组合根，注册 commands、装配 adapters，把主窗口标题同步为最终 productName，按 Rust debug/release 模式选择互不 fallback 的 home locator/default-root，再派生并初始化 root/data/device/cache 后构造全部 repositories；不写程序目录、不读取另一模式或旧 AppData 位置，也不在 repository 内重复计算全局路径。
- `src-tauri/src/domain/profile.rs`：连接配置、最多 4 个显式有序跃点、候选资格与引用完整性规则；不包含 IPC、凭证明文或 JSON 序列化模型。
- `src-tauri/src/domain/auth.rs`：短期凭据包装、可执行认证请求与稳定认证失败；不表达 profile 的 `manual` 策略，也不依赖 `russh` 或 Tauri。
- `src-tauri/src/domain/credential.rs`、`ports/credential_vault.rs`、`application/credential_service.rs`：vault 领域语义、外部存储端口与用例边界；不依赖具体密码学文件格式或 UI。
- `src-tauri/src/domain/settings.rs`、`ports/settings_repository.rs`、`application/settings_service.rs`：安全、外观、更新与终端集成设置的默认值、范围、注入配置根、存储端口与用例；domain 只展开/校验输入并使用组合根注入的默认目录，application snapshot 投影默认/配置/活动根，不依赖 JSON、Tauri、Cargo build mode、SSH 或 Windows API。
- `src-tauri/src/domain/shell_integration.rs`、`ports/remote_shell_cache.rs`：受支持远程 Shell、目标签名、固定探测输出解析、当前会话 Hook、Shell 专属初始目录字面量编码与可丢弃 cache 契约；不依赖 russh、JSON 或 Tauri。
- `src-tauri/src/application/credential_lifecycle.rs`：统一拥有凭证解锁时间、deadline generation、锁定原因与 data-key 生命周期编排；不依赖 Tokio timer、Tauri event 或 Win32 类型。
- `src-tauri/src/application/credential_workflow.rs`：恢复重置与私钥草稿的 opaque pending 状态、替换、完成和取消语义；secret bytes 保持 zeroizing 且不进入 DTO。
- `src-tauri/src/application/ssh_config_import.rs`：SSH Config preview 生命周期、应用层候选模型、选择/唯一命名、凭证复用、批量 profile commit 与失败 rollback coordinator；不依赖 Tauri、infrastructure parser 类型、对话框或 command DTO。
- `src-tauri/src/domain/session.rs`：主机密钥比较、route 节点/阶段事件、多跳会话状态迁移和有界一次性初始目录值；不执行网络连接或文件读写。
- `src-tauri/src/domain/transfer.rs`：远程路径边界和稳定传输事件；不依赖 SFTP、Tauri 或本地文件 API。
- `src-tauri/src/domain/terminal_staging.rs`、`ports/terminal_staging.rs`、`application/terminal_staging_service.rs`：file list/text/raw-image 优先级、Windows/POSIX 本地路径文本规则、本地 `Empty/Text/Paths` 准备用例、无敏感进度事件，以及 Terminal-only 远端暂存/取消端口与 opaque task 启动用例；不依赖 arboard、Tauri Channel、russh-sftp 或 WebView DTO。
- `src-tauri/src/domain/files.rs`：稳定目录列表、文件条目与排序/数量边界；不依赖文件系统、SFTP 或 Tauri。
- `src-tauri/src/application/file_service.rs`：本地文件预览限制、UTF-8 校验、内容修订与原子保存用例；不依赖 Tauri UI 或 SFTP 类型。
- `src-tauri/src/domain/workspace.rs`：Workspace/split tree、Git target、按 profile 隔离的最近仓库 identity 与 per-scope/global 资源上限；不依赖前端状态、Tauri 或 JSON 格式。
- `src-tauri/src/domain/git.rs`、`ports/{git_executor,remote_git_executor}.rs`、`application/git_service.rs`：Git 与直接 Submodule 元数据、gitlink/内部脏状态、配置问题、单项 initialize/checkout-recorded 前置规则、完整 commit OID、remote/merge/冲突状态、本机/远程输入边界及 Git 能力端口/用例编排；父仓库 gitlink 与子仓库工作树语义保持分离，不依赖 Tauri、process API、shell 或具体 Git 输出格式，也不表达命令、参数、Submodule URL/OID selector、recursive/remote/force 或凭据。
- `src-tauri/src/commands/git.rs`：Git 稳定 snapshot/merge/conflict/Submodule DTO、封闭 local/remote detail/resolve/单项 Submodule 命令、Git-purpose SSH 建连、profile/session ownership 调用、远程浏览、错误映射和阻塞用例调度 IPC；不拥有 Git 规则、输出解析、文件读写、Submodule URL/OID、递归/force 开关、任意 object/index selector 或命令执行入口。
- `src-tauri/src/commands/profile.rs`、`commands/profile/{dto,import}.rs`：Profile CRUD façade、严格 IPC DTO 与 SSH Config parser/dialog/application coordinator 适配；不拥有导入选择、唯一命名、跨 repository commit 或 rollback 规则。
- `src-tauri/src/commands/credential.rs`、`commands/credential/{commands,dto,files,recovery}.rs`：Credential state façade、严格 secret DTO、Tauri command、授权私钥读取与恢复文件/对话框 adapter；不把私钥正文或恢复材料序列化到 WebView，也不拥有 SSH Config 跨 repository 事务规则。
- `src-tauri/src/infrastructure/git_cli/mod.rs`、`git_cli/{executor,process,repository,parsers,changes,conflict,branch,submodule}.rs`：稳定的系统 Git executor façade，以及按进程边界、快照解析、更改、冲突、分支同步和直接 Submodule 分组的内部 adapter；测试按 parser、process、lifecycle、diff、conflict、sync 与 Submodule 行为位于 `git_cli/tests/`。该目录不经 shell、不接收 WebView 命令片段、参数数组、Submodule URL/OID selector、recursive/update-remote/force 选项或持久化仓库状态。
- `src-tauri/src/domain/network.rs`、`ports/network_repository.rs`、`application/network_service.rs`：转发规则、不变量、profile 引用与配置用例边界；不包含 socket、SSH channel、运行状态或持久化格式。
- `src-tauri/src/commands/network.rs`：Network 严格 DTO、profile-bound session 建连和规则启停 IPC；不实现 SOCKS5 或 TCP 数据泵。
- `src-tauri/src/commands/clipboard.rs`：接收当前 SSH session ID/opaque task ID 或无参数本地准备请求，调用本地路径准备或远端暂存/取消用例，并桥接一次性最终本地粘贴文本及无敏感远端事件；不接收本机路径、文件字节、远端路径策略或权限参数。
- `src-tauri/src/commands/browser.rs`：Chrome/Edge 白名单 DTO、SOCKS5 规则类型复核与浏览器 adapter 调用；不接受可执行路径、命令参数或实现平台探测。
- `src-tauri/src/infrastructure/browser/`：共享 SOCKS5 greeting、固定 Chromium 参数和机器本地隔离 Profile，并以 Windows、macOS、Linux adapter 受限探测和无 Shell 启动 Chrome/Edge；不修改系统代理、支持沙箱化 Linux 浏览器、复用日常 Profile 或管理浏览器退出。
- `src-tauri/src/infrastructure/window_chrome.rs`：macOS 原生标题栏几何 adapter；按 AppKit 实际按钮尺寸把系统交通灯对齐到 40px 应用顶栏，并在原生窗口 relayout 后恢复位置；不拥有前端样式、Workspace 状态或跨平台窗口策略。
- `src-tauri/src/infrastructure/persistence/json_network_repository.rs`：`network-forwards.json` schema v1 的严格、无敏感字段、原子持久化适配器。
- `src-tauri/src/infrastructure/persistence/json_workspace_repository.rs`：`workspaces.json` schema v10 的严格、无敏感字段、原子持久化与受支持旧版本显式迁移适配器；不保存 session、Git snapshot、仓库内容或连接凭据。
- `src-tauri/src/ports/settings_repository.rs`、`src-tauri/src/infrastructure/persistence/json_{appearance,update,terminal}_settings_repository.rs`：设备外观/更新/终端集成偏好 ports 与独立 schema v1 适配器；只保存封闭预设或布尔偏好，不覆盖损坏/未来文件，也不修改 security settings。
- `src-tauri/src/infrastructure/persistence/json_remote_shell_cache.rs`：`cache/remote-shells.json` 的严格、原子、可丢弃适配器；只保存目标签名和 Shell 枚举，不保存探测输出、Hook、终端内容或凭据。
- `src-tauri/src/infrastructure/ssh/forwarding.rs`：本地 listener、SOCKS5 CONNECT、Remote target 路由、有界转发任务与 TCP/SSH 双向数据泵；第三方 channel 类型不得离开 infrastructure。
- `src-tauri/src/ports/profile_repository.rs`：应用层拥有的连接配置 repository 契约；不规定文件格式。
- `src-tauri/src/infrastructure/local/pty.rs`：本地 PTY 创建与进程 I/O owner；在 spawn 时解析一次性工作目录并对无效/失效路径回退到规范化 home，不解释远程 Shell 语法。
- `src-tauri/src/infrastructure/clipboard.rs`：在阻塞工作线程读取原生 file list/text/RGBA；现有文件路径只生成 Rust 内部一次性来源，RGBA 校验后流式编码到 Qterm cache root 下私有 clipboard 目录的 UUID PNG，并仅清理过期受管图片；不向 WebView 返回图片资源或字节。
- `src-tauri/src/infrastructure/ssh/client.rs`、`client/manager_{core,control,files,ports}.rs`：稳定 `SshSessionManager` façade 与按核心会话、控制、文件/传输和端口转发分组的 manager 实现；不向 commands/application 泄漏 russh 或 SFTP 类型。
- `src-tauri/src/infrastructure/ssh/client/session.rs`、`session/{terminal,files,git}.rs`：route 建连 façade 与 Terminal、Files、Git purpose-specific runner；Git runner 通过同一 profile-owned session 执行固定 conflict detail/side/delete/stage，并仅为有界结果写回复用内部 SFTP 原子写语义，各用途对外能力仍独立，取消、task drop 和关闭语义仍由共享 manager/session ownership 约束。
- `src-tauri/src/infrastructure/ssh/client/transfer.rs`、`transfer/{files,staging,upload}.rs`：传输 dispatch façade、远端文件操作、Terminal staging/download 与 upload/流式复制实现；路径边界、取消与失败清理不进入 command 或 application。
- `src-tauri/tauri.conf.json`、`tauri.macos.conf.json`：正式应用身份、通用无边框桌面窗口与 macOS 原生 Overlay 标题栏的分层配置，以及构建和打包入口；不承载 Workspace 或 SSH 规则。
- `src-tauri/capabilities/default.json`：主窗口最小 Tauri 权限清单。
- `package.json`、`src-tauri/Cargo.toml`：前端与 Rust 的直接依赖及质量命令入口。
- `.github/workflows/build-desktop.yml`：macOS ARM64、Windows x64 与 Linux x64 的版本标签/手动构建和 workflow artifact 上传入口；不发布 Release 或执行部署。

## Module Responsibilities

- `.agents/skills/`：负责把长期工程与界面规范转成可执行的 agent 决策流程；不替代 qb-spec change、测试、linter 或源码门禁。
- `src/app/`：负责顶层布局、feature 组合与应用级预设主题生命周期；不承载认证、连接或传输规则。
- `src/workspace/`：负责工作区结构模型、布局树变换、顶部 Workspace 导航、按连接的有界 Git 仓库历史和 block runtime 编排；不读取本地文件、验证仓库有效性或实现 SSH/SFTP。
- `src/terminal/`：负责 xterm 实例及终端 I/O 适配；不持久化 buffer 或拥有 Workspace 生命周期。
- `src/files/`：负责内部文件窗口展示、导航、下载反馈与瞬时预览编辑状态；不直接访问本地文件系统或 SSH infrastructure。
- `src/editor/`：负责跨 feature 的编辑器语言识别、解析器适配和异步加载生命周期；不读取文件、不计算 Git 差异，也不拥有 feature 编辑状态或后端能力。
- `src/network/`：负责网络规则配置 UI、共享刷新、运行状态展示、安全暴露提示和可复制访问地址派生；不实现 SSH/SOCKS5 协议、浏览器进程启动或持久化。
- `src/git/`：负责单仓库 Git Block 的稳定组合入口、Local/Remote action adapter、快照与刷新代次、提交检查缓存、状态驱动的单步主动作派生、分区展示、分支/同步/安全合并浮层、仅内存 attention 操作记录、最近仓库、受限目录浏览和提交图拓扑；presentation 不直接调用 Tauri IPC，feature 不拥有 Workspace 持久化、session 生命周期、Git 校验/命令/refspec/merge strategy 规则，也不直接启动 Git、自动串联 mutation、创建 SSH channel、读取文件内容、承接文件管理能力或实现 force/remote URL/高级历史改写。
- `src/components/`：负责跨 feature 的小型展示与交互原语；不吸收 feature 状态、业务编排或领域规则。
- `src/components/dialogs/`：负责连接、传输、设置、帮助与确认弹窗，以及共享 modal 的焦点栈和短时展示生命周期；不定义领域规则、决定关闭后的业务动作或直接操作 Rust infrastructure。
- `src/test/`：负责前端测试运行环境；不放置生产代码。
- `src/lib/tauri/`：负责类型安全的前端 IPC 调用；不持有领域规则或直接访问文件系统。
- `scripts/`：负责开发工具入口与参数路由；不承载运行时产品逻辑、用户数据迁移、任意外部命令或发布身份决策。
- `src-tauri/src/commands/`：负责 IPC DTO 校验、secret 包装、用例调用和错误映射；不实现领域决策或 SSH 协议。
- `src-tauri/src/application/`：负责 profile、credential、workspace、network、Git、host-key 信任、文件内容安全和剪贴板图片上传用例；不依赖 Tauri UI、原生剪贴板、process API 或具体 SSH 库类型。
- `src-tauri/src/domain/`：负责稳定领域模型、状态、输入边界和规则；不依赖 Tauri、russh、process API 或持久化格式。
- `src-tauri/src/ports/`：负责由应用层拥有的持久化、SSH、Git 等外部能力接口；不包含具体适配实现。
- `src-tauri/src/infrastructure/`：负责 persistence、系统 Git、russh、known-hosts、PTY、SFTP 和受限本机浏览器启动适配；不把第三方库、process 细节或 Win32 类型泄漏到 IPC 或 domain。
- `src-tauri/src/infrastructure/persistence/`：负责严格 JSON 读取、受支持 schema 的显式迁移、敏感字段拒绝、原子写入、可丢弃缓存，以及 credential vault 的 Argon2id + envelope AES-GCM 适配；不执行远程命令或拥有 UI 流程。
- `src-tauri/src/infrastructure/windows/`：负责 Windows WTS session-lock 注册、消息映射与窗口 hook 生命周期；Win32 类型不得越过该 adapter。
- `src-tauri/src/infrastructure/ssh/`：负责 `russh` 私钥凭证解析、SSH Config 有界解析、平台 SSH Agent 签名适配、纯 Rust 多跳连接生命周期、PTY、受限远程 Shell/Git exec、当前会话 Hook、SFTP 及有界 TCP forwarding；只执行固定集成命令或受限 Git action（含经 POSIX literal 编码的完整 commit OID 创建并切换分支）、读取系统选择器明确授权的配置入口及受限 Include，并仅在用户明确授权后读取候选私钥，不接受任意 revision，也不泄漏私钥正文、Git stdin 或第三方 channel 类型。
- `src-tauri/src/infrastructure/ssh/config_import.rs`：负责 SSH Config 的受限读取、Include 展开、Match 隔离、候选解析与私钥元数据检查；不执行 Match 或代理命令。

## Forbidden Contents By Directory

- `.agents/skills/`：禁止单次任务流水账、临时诊断结论、运行时业务实现，以及与 checker、schema 或测试重复且会漂移的事实源。
- `src/`：禁止私钥正文、后端文件读取、SSH/加密实现和直接密码/口令持久化；只允许短期 UI secret state 与窄 vault IPC。
- `commands/`：禁止业务状态机、持久化策略、任意外部命令/参数入口和原始敏感值日志。
- `application/` 与 `domain/`：禁止依赖 Tauri、russh、xterm.js 或具体 JSON model。
- `infrastructure/`：禁止定义前端契约或反向控制应用层规则。
- `docs/qb-spec/`：禁止密钥、密码、口令或其他真实凭据。
- `.github/`：禁止提交签名证书、访问令牌或其他真实凭据；敏感值只能来自 GitHub Actions Secrets。
- `scripts/`：禁止 shell 字符串拼接、用户数据读写和业务规则；只能调用仓库锁定的工具并保留参数边界。

- `scripts/tauri-dev-runner.mjs`：macOS 开发 bundle 构造、完整 ad-hoc 签名及进程启动；签名 identity 与 Info.dev.plist 一致，保证原生通知服务识别真实应用身份。
