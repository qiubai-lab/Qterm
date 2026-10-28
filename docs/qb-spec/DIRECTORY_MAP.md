# Directory Map

## Root Directories

- `.agents/skills/`：负责 Qterm 项目级、可自动发现的 agent 工作流与稳定规范入口；不保存单次任务计划、运行时代码或重复的可执行配置。
- `src/`：负责 React 展示、用户交互和 Tauri IPC 客户端；不读取私钥、不实现 SSH 规则，也不持久化敏感凭据。
- `src-tauri/`：负责桌面运行时、应用用例、领域规则和基础设施适配器；不承载 React 页面状态。
- `scripts/`：负责仓库级可测试命令入口；当前只为 Tauri `dev` 注入开发 flavor 并把其他 CLI 参数原样转发，不承载应用业务、发布凭据或 shell 拼接。
- `docs/qb-spec/`：负责长期产品上下文、需求规格和实施计划；不作为运行时代码或配置来源。
- `.github/`：负责持续集成、依赖更新、桌面产物与静态产品站点构建发布自动化；不包含产品业务逻辑或发布凭据。

- `site/`：静态项目介绍、独立 demo HTML 与站点专用公开资源；构建产物为 `dist-site/`，不参与桌面 `dist/`。

## Important Files

- `Makefile`：开发命令的薄入口，聚合 pnpm/Cargo 检查并提供帮助与参数转发；底层命令以 `package.json`、`scripts/tauri.mjs` 和 Cargo 为准，不复制 SDK/开发身份策略或自动发布。
- `scripts/desktop-package.mjs`：标准包的宿主平台检查、格式选择、构建后本机安装编排；使用现有版本与 Tauri build，不生成特殊开发身份。`scripts/install-local.mjs`：macOS 应用标识/运行状态检查、签名校验、暂存替换与失败恢复；仅替换应用，不读取或修改 Qterm 用户配置。Windows/Linux 交由原生安装向导或系统包管理器。

- `src-tauri/src/infrastructure/external_links.rs`：应用和原生 smoke 共用的 opener 插件配置，关闭全 WebView 自动点击拦截，保留可信主界面的显式外部打开能力；原生网页链接继续交由 Web Block 接管，不扩大客体权限。`native_popup_click_tests.rs` 覆盖真实鼠标点击、默认行为未被取消和客体 opener 拒绝。

- `src-tauri/src/infrastructure/web/macos/`：Rust async C/JSON bridge 与稳定 WebKit store UUID；`native/Bridge.swift` 分派主线程命令，`Store.swift` 拥有环境/代理/分类清理，`Guest.swift` 拥有导航/事件/预览及普通页与弹出页共用的桌面 Edge UA，`NavigationGuard.swift` 限制重复主文档跳转并允许显式导航重试，`BrowserWebView.swift` 将标准编辑组合键与菜单所属的 Cmd+W 交回 AppKit，其他组合键保留 WebKit 分发；`Surface.swift` 拥有遮挡/输入/焦点，`Popups.swift` 拥有同步原生子页和异步接管。`Tunnel.swift` / `tunnel_script.mjs` 映射远程 HTTP/WS 回环地址并阻断未映射请求；`WebKitPolicy.m` 封装禁用远程 WebRTC 的受检 SPI；`domain/web_tunnel.rs` 定义固定别名规则，`macos/tunnel.rs` 仅改写 SOCKS 目标并继续经 SSH。`build_macos_web.rs` 编译链接 Swift/Objective-C 静态 adapter；`scripts/macos-web-smoke/` 用真实 WKWebView 验证路由/隔离/交互；`src-tauri/examples/macos_web_edit.rs` 在真实 Tauri 窗口中验证原生编辑快捷键及焦点边界，fixture 位于 `examples/support/web_edit_fixture.rs`；`scripts/macos-web-smoke/native-edit.mjs` 另接入真实 xterm 与生产剪贴板 adapter，验证终端原生粘贴和全选；客体无应用 IPC。
- `src/lib/tauri/webCapabilities.ts`：React 挂载前读取后端本地/远程能力与隧道映射模式；`webModel.ts` 按目标控制入口，`WebBlock` / `WebBrowserPane` 显示地址映射兼容范围，不根据 UA 推断原生授权。
- `src-tauri/src/infrastructure/web/macos/native/FileUpload.swift`：网页文件输入的原生选择窗口与一次性回调；随 guest 导航、隐藏、关闭或进程终止取消待选文件，不拥有网络上传或应用文件访问 IPC。
- `src-tauri/src/infrastructure/web/windows_popups.rs`、`windows_popup_pending.rs`、`popup_lifecycle.rs`：网页原生新窗口事件、仅限 UI 线程的 COM deferral 和有界一次性请求、来源 guest/环境继承与异步子 WebView 接管；保留 POST/opener 语义，来源导航/关闭及超时释放请求，不向客体开放 IPC。`src/lib/tauri/webPopups.ts` 是窄传输边界，`src/web/webPopupEvents.ts` 按 guest 代次订阅和去重，`WebTabs` 拥有同 Block 新标签容量，`useWebBrowser` 在导航监听就绪后接管请求；native popup tests 覆盖真实环境与代理继承。
- `src/workspace/WorkspaceTerminalLinkHost.tsx`、`useWebOpenController.ts`、`src/web/webLinkOrigin.ts`：终端链接来源快照、同工作区同目标浏览器复用与一次性新页命令；Provider 仅组合 controller，WebTabs 拥有标签和初始地址消费。普通 HTTP(S)/OSC 8 适配器报告实际来源 block，确认框提供内部/外部选择；内部跟随来源本地或 SSH 目标，外部委托共享系统浏览器边界，不持久化待打开 URL。
- `src-tauri/src/infrastructure/web/target.rs`、`local_storage.rs`：显式本地/远程原生目标及本地独立存储目录；本地无需 SSH gateway/watchdog，远程身份验证和断线阻断保持不变。`WebNode.profileId === null` 唯一表示本地，已删除的远程配置不能降级为本地；历史/收藏使用独立保留 scope `local`，既有远程 UUID 数据兼容。`native_local_tests.rs` 通过隔离 HTTP/WebView2 fixture 验证真实本地生命周期与存储边界。
- `src/web/WebBlock.tsx`、`WebBrowserPane.tsx`、`WebAddressBar.tsx`、`useWebTargetSwitch.ts`、`useWebBrowser.ts`、`webModel.ts`、`webSurfaceOcclusion.ts`、`webSurfaceFrame.ts`、`src/lib/tauri/web.ts`：Windows/macOS Web Block 复用终端头部与连接选择器，按 profile 挂载浏览状态、切换时卸载旧网页，按代次管理原生网页生命周期、原生焦点回传、地址/可见性、提示框裁剪及主题选中边框采样规则及 IPC façade；认证和目标切换复用独立 Network runtime，地址与浏览数据不进入 Workspace 持久化。`WebAddressBar` 管理地址草稿、回车/输入法提交、最近五条历史的键盘选择与固定槽位的加载/停止控件；`WebAddressHistory.tsx` 管理与地址栏对齐的浮层，明确标记其原生局部遮挡区域；`workspaceFocus` 在延迟激活时保留浏览器内部已取得的焦点。
- `src-tauri/src/domain/web.rs`、`commands/web.rs`、`infrastructure/web/`：网页协议边界、薄 IPC、Windows WebView2 独立环境/私有代理/原生视图生命周期，以及主界面专属应用命令授权；`windows_surface.rs` 负责原生焦点事件与提示框局部裁剪；`frame_raster.rs` 和 `windows_frame.rs` 负责透明边框像素与可穿透输入的原生覆盖层，移动边框不再裁剪网页。`windows-app.manifest` 通过 build.rs 链接到应用和原生测试，声明现代 Windows 子窗口合成兼容性。`windows_navigation.rs` 监听原生导航开始、SourceChanged 和完成并执行 Stop；`navigation_state.rs` 按导航 ID 管理加载状态与有效访问，覆盖单页路由、取消和过期完成事件。客体网页不拥有应用权限。
- `src-tauri/src/infrastructure/ssh/client/web_proxy.rs`：Web 专属临时 SOCKS5 listener 与 profile/session 绑定；复用转发 adapter 和 Network session 的连接与清理语义，不创建持久化规则。
- `src/web/WebLibraryDialog.tsx`、`WebLibraryDrawerFrame.tsx`、`useWebLibraryDrawer.ts`、`useWebLibrary.ts`、`webLibraryStore.ts`、`src/lib/tauri/webLibrary.ts`：按连接隔离的访问历史和收藏 UI（共享 OverlayScrollArea 滚动条）、当前 Block 右侧抽屉与可中断进出/焦点生命周期、串行请求/多 Block 共享快照及薄 IPC；抽屉只裁剪所属原生网页，删除确认仍使用独立模态框；完成加载的客体事件记录访问，连接切换后忽略旧事件。
- `src/web/WebFeedback.tsx`、`webFeedback.css`：网页底部固定高度状态栏，位于原生网页区域之外，显示加载状态、资源计数及加载耗时。`watchWebMetrics.ts` 拥有可见性/代次保护的串行采样；`infrastructure/web/metrics.rs` / `metrics_script.mjs` 只读取并校验文档级聚合统计，不保存资源地址或开放客体 IPC。`webScrollbarTheme.ts` 将终端色相转换为更深的不透明网页 palette。
- `src-tauri/src/infrastructure/web/scrollbars.rs`、`scrollbar_script.mjs`：组合客体脚本并维护每文档唯一的样式/主题和 pagehide/pageshow 生命周期；`scrollbar_overlay.mjs` / `.css` 只增强 document scrolling element 的双轴零占位悬浮层，内部容器保持网站原样；`scrollbar_visibility.mjs` 独立读取作者的 viewport 隐藏策略，`scrollbar_geometry.mjs` 计算 viewport/RTL 几何，`scrollbar_interaction.mjs` 拥有滚动显隐、12px 热区、3→9px 展开、拖动捕获和收尾。DOM tests 与 `native_scrollbar_tests.rs` / `native_scrollbar_drag_tests.rs` 保护动态修复及真实鼠标操作；不添加客体 IPC 或持久化。
- `src/web/webTabSessionStore.ts`、`src/workspace/workspaceSaveQueue.ts`、`useWorkspacePersistence.ts`、`src/lib/tauri/webTabs.ts`：按 block/连接校验的标签恢复投影、旧挂载写入失效、hydration 和工作区/标签串行保存及退出 flush；`WebTabs` 保留实时页面所有权，并按需挂载恢复的标签。`domain/web_tabs.rs`、`application/web_tab_service.rs`、`ports/web_tab_repository.rs`、`infrastructure/persistence/json_web_tabs.rs`、`commands/web_tabs.rs` 负责封闭恢复模型、有序用例、原子版本化 `cache/web-tabs/sessions.json` 与可信主界面 IPC。显式移除 block 清记录，普通组件卸载不清；连接环境站点数据独立保留。
- `src-tauri/src/domain/web_library.rs`、`application/web_library_service.rs`、`ports/web_library_repository.rs`、`infrastructure/persistence/json_web_library.rs`、`commands/web_library.rs`：历史去重/上限和收藏规则、串行事务、原子 JSON 存储及工作线程上的命令适配；文件由当前配置根注入为 `device/web-library.json`，不改变 Workspace schema 或客体网页权限。
- `src-tauri/src/infrastructure/persistence/json_workspace_repository/records.rs`：Workspace JSON records 与领域布局的转换，包含仅保存身份/profile 的 Web variant；原 repository 继续负责迁移、校验与原子读写。

- `src/components/dialogs/configurationMerge/`、`src/lib/tauri/configurationMerge.ts`：系统设置中的配置合并流程；独立步骤栏、来源目录卡片、确认列表和密码解锁子弹窗由 feature controller 编排，包含类别依赖、自动预览与即时刷新通知；不读取配置文件或持有私钥材料。
- `src-tauri/src/application/configuration_merge/`、`domain/configuration_merge.rs`、`ports/configuration_merge.rs`：连接/分组、网络规则、凭证的合并模型、去重命名、引用映射与用例边界；设备和 Workspace 数据不参与。
- `src-tauri/src/infrastructure/persistence/configuration_merge/`、`configuration_gate.rs`：受限文件快照、加密暂存、备份日志、提交回滚与启动恢复；三个核心 repository 共用进程内可重入事务锁，存在待恢复日志时禁止正常读写。`json_credential_vault/crypto.rs` 拥有既有凭证库的加密封装辅助函数，schema 不变。

- `vite.site.config.ts`、`.github/workflows/site.yml`、`scripts/check-site.mjs`、`docs/browser-demo.md`：站点多页构建、Pages 发布、子路径资源与 desktop/demo 产物隔离检查及操作说明；不改原 Tauri 打包入口。Pages 发布由仓库变量显式启用。
- `src/lib/runtime/environment.ts`、`@qterm/services/*`：显式 build-selected workspace/terminal service 边界，默认选择现有 Tauri adapters，仅 site 选择模拟服务；不伪造原生环境、不自动降级。
- `src/demo/`：DemoApp/DemoWorkbench 只拥有站点外壳、主题分段控件、刷新清理和虚构连接路由；通过相同 LayoutView 与 Files/Git/Network 产品面板消费 build-selected services。demoProject 拥有按目标隔离的文件/Git 模拟后端，demoGitAdapter 映射产品 Git 快照，terminalSession/sessionRegistry 拥有终端模拟任务，featureSessions 拥有按用途与目标隔离的非终端模拟连接；networkFixtures 提供开发服务器的三类网络种子，services 适配原 typed service 契约，未支持操作明确拒绝。WorkspaceProvider 仍唯一拥有 UI runtime，不另建 Demo 功能页面。
- `src/onboarding/`：两端共享首次展示记录、引导步骤、高亮定位和重看入口；工作区就绪后运行，遇到其他弹窗暂停。不发起连接、执行命令或修改项目数据，版本更新不触发。
- `site/index.html`、`src/site/site.css`：静态介绍页的文案与独立布局，复用产品主题 token，不导入应用运行时。`site/public/site-interactions.js` 仅增强功能页签、键盘导航和一次性显现；`site/public/site-scrollbar.js` 与 `src/site/siteScrollbar.css` 负责不占布局空间的页面悬浮滚动条、拖动/键盘操作与延时隐藏；`site/public/image-viewer.js` 与 `src/site/imageViewer.css` 负责独立的原图弹窗、尺寸切换与焦点返回，`src/site/imageViewer.test.ts` 保护其交互；`site/public/screenshots/` 保存 Demo 和桌面端展示截图及来源说明，`src/site/siteInteractions.test.ts` 保护渐进增强行为。

- `native/conpty/`：G0 隔离原型的上游版本锁、MIT 许可与原生输出边界补丁；`scripts/build-conpty-prototype.ps1` 构建未发布的测试 host，`scripts/conpty-ordered-probe-consumer.mjs` 只供真实 PTY 探针消费 QTR0 帧。尚未作为生产 runtime 或应用 IPC 协议接线。

- `src/components/ThemedTooltipButton.tsx`、`useThemedTooltip.tsx`、`ThemedTitleTooltipProvider.tsx`、`themedTooltip.css`：跨终端、Git、文件和网络窗口共享的主题提示触发、原生 DOM `title` 代理、溢出过滤、视口定位、退出生命周期与浮层样式；按钮和被截断的操作标识复用同一视觉契约，该层不拥有操作业务逻辑。`src/workspace/BlockHeaderClose.tsx` 组合窗口头部关闭入口。

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
- `src/web/useWebTabCloseShortcut.ts`：仅活动可见浏览器的 Ctrl+W 主界面/原生 guest 路由与门禁；WebTabs 继续拥有选中标签、关闭回退和恢复投影，快捷键层不维护第二份标签状态。
- `src/workspace/workspaceClose.ts`：Block 关闭资格和按类型确认文案的纯规则，供 reducer 与关闭编排共用；不操作会话或存储。`src/web/surface/nativeSurfaceCoordinator.ts` 同时从现有 surface 登记解析可见 guest 的 Block 归属；`web/windows_shortcuts.rs` 与 `web/macos/native/BlockCloseShortcut.swift` 转发可信原生关闭按键，不向客体页面开放 IPC。
- `src-tauri/src/infrastructure/macos_menu.rs`、`src/lib/tauri/blockClose.ts`：macOS 原生菜单与主窗口定向 block/tab-close 事件的 transport/订阅生命周期；不直接断开会话或修改布局，关闭规则委托工作区快捷键 controller。`macos_menu/select_all.rs` 将主 WebView 中的终端全选交给可取消 DOM 事件，其余焦点回落 AppKit 响应链。
- `src/workspace/useWorkspaceShortcuts.ts`：应用快捷键的捕获、弹窗/锁屏门禁和所有活动 Block 的关闭路由；复用 Shell 关闭确认与现有会话清理，不持有会话或持久化状态。
- `src/workspace/WorkspaceShell.tsx`：组合顶部 Workspace 导航、工具轨、Terminal/Files/Network/Git 认证路由、route 凭证库解锁、关闭编排、快捷键与一次性启动更新提示入口；不请求任意更新地址、解析跳板图、布局树或 SSH 协议。
- `src/workspace/model.ts`、`layout.ts`、`reducer.ts`、`gitRepositoryHistory.ts`：schema v10 可持久化工作区契约、Git `Unbound | Local | Remote` target、按本机或 profile 隔离的有界 Git 仓库 MRU、使用调用方提供稳定 ID 的纯布局树变换与低频结构状态；不持有 session、xterm、Git 快照、远程命令、一次性启动目录或凭据。
- `src/workspace/WorkspaceProvider.tsx`、`useWorkspacePersistence.ts`：兼容的单一 Workspace Context façade，以及 hydration、debounced save、close flush 和 profile refresh owner；Git target retarget 可在同 profile 的已连接 Git session 上只切换路径，Provider 不直接实现会话事件或连接生命周期，运行时状态不持久化。
- `src/workspace/useWorkspaceRuntimeState.ts`、`useWorkspaceRuntimeController.ts`、`use{Terminal,File,Network,Git}WorkspaceController.ts`：按 `blockId` 隔离的单一 runtime 状态内核、跨用途清理组合器，以及四类独立的事件/connect/disconnect/host-key controller；Git controller 还拥有未持久化 remote target 前的 profile intent 暂存、取消清理与确认复用；共享 epoch、intent、writer、buffer 和 session ownership，不引入第二套 store 或可变全局单例。
- `src/workspace/workspaceRuntime.ts`：Workspace runtime 类型、默认值、epoch/failure key、connection intent 与 route notice 纯规则；不持有 React state 或可变全局单例。
- `src/workspace/connectionProgress.ts`、`src/components/ConnectionRouteProgress.tsx`：Terminal/Files/Network/Git SSH Block 共用的 route 事件展示状态映射与悬浮进度组件；`src/components/HostIdentity.tsx` 统一直连/route 完成态的主机概要、视口浮层和地址复制；这些组件不管理 session、认证、凭证或持久化。
- `src/components/Button.tsx`、`button.css`：共享文本按钮、图标按钮与非交互状态标签的语义、尺寸、主题和可访问契约；不拥有 feature 事件、tabs、菜单项、列表行或选择卡片行为。
- `src/components/scrollbars/OverlayScrollArea.tsx`、`overlayScrollbar.css`：普通 DOM viewport 共用的双轴悬浮滚动条、指标同步、短暂显隐、边缘唤醒与 pointer-capture 拖拽 owner；feature 保留 viewport ref、scroll handler、语义、虚拟化与业务状态，xterm、CodeMirror 和 Git diff overview 继续使用专用实现。
- `src/components/dialogs/DialogFrame.tsx`、`dialogFrame.css`、`useDialogCloseTransition.ts`：共享 modal 的结构、焦点栈、进入/退出展示状态与 reduced-motion 生命周期；feature 继续拥有关闭后的业务动作和父级挂载状态，该层不执行保存、删除、连接或持久化。
- `src/workspace/fileWindow.ts`：终端快捷方式和右侧工具轨共用的文件窗口打开策略；不创建 session 或读取文件系统。
- `src/workspace/networkWindow.ts`：远程终端快捷方式和右侧工具轨共用的 Network Block 打开策略；不创建 session 或启动规则。
- `src/workspace/gitWindow.ts`：右侧工具轨共用的 Git Block 上下文打开策略；从本机或远程 Files 路径以及同 profile 的有效 Terminal OSC 7 目录派生显式 target，不解析仓库或执行 Git。
- `src/git/GitPane.tsx`、`gitRepositoryClient.ts`、`useGitCommitInspection.ts`、`gitPaneTypes.ts`、`gitPaneViewModel.ts`、`gitPrimaryAction.ts`、`gitSnapshot.ts`：Git Block 的稳定组合入口、本机/SSH action adapter、前台操作与单飞后台 snapshot epoch 编排、展示快照等价判断、提交检查缓存、浮层定位/丢弃影响等纯展示派生、共享局部模型，以及从 staged/worktree/upstream/ahead/behind 派生单步暂存/提交/Pull/Push/Publish 推荐动作的纯前端策略；同时编排专用冲突详情/解决 client 与最新活动 snapshot，不改变 IPC DTO、不生成 Git 命令、不自动串联 mutation，也不把 session、snapshot、活动子仓库、冲突正文、推荐动作或操作记录写入 Workspace persistence。
- `src/git/gitRepositoryContext.ts`、`useGitRepositoryContext.ts`、`useGitSubmoduleSnapshots.ts`、`useGitRepositoryRowActions.ts`、`GitRepositoryTree.tsx`、`GitPaneSections.tsx`、`GitChangeList.tsx`、`gitChangeListModel.ts`、`GitConflictResolver.tsx`、`GitPrimaryActionButton.tsx`、`GitCommitGraph.tsx`、`GitRepositoryOverlays.tsx`、`GitRepositoryHistoryPopover.tsx`、`GitRepositoryPickerDialog.tsx`、`GitRemoteTargetConfig.tsx`、`gitGraph.ts`：以持久化父仓库 target 为根的安全相对节点模型、仅内存活动仓库/逐层 snapshot cache、最多三个 worker 的直属已初始化子模块非递归预加载、epoch 隔离的父子刷新、逐仓库行操作意图与浮层锚点、可访问的同构仓库树，以及共享存储库/更改/提交图；Git 更改列表使用纯范围模型和共享滚动视口实现大列表有界 DOM 渲染，同时保持完整快照、全局索引和全部行操作；远程 target 配置 presentation 组合精确路径输入、最近仓库与现有受限目录选择器，只拥有草稿对应的 picker 可见性，不直接连接或持久化 target；其余模块负责状态驱动的单步聚合 Git 主按钮与选择性提交分割菜单、commit 鼠标/键盘上下文菜单、安全分支/同步/合并、冲突 manager 与仅内存脱敏操作记录；Submodule 单项初始化/检出记录版本保留在树节点，展示和浮层不直接调用 Tauri IPC、不拥有持久化/session 生命周期，也不递归预扫描孙级或更新 Submodule、不提供 URL/force/remote 配置入口。
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
- `src/terminal/TerminalPanel.tsx`、`terminalView.ts`、`terminalSessionReset.ts`、`TerminalStagingStatus.tsx`、`terminalTheme.ts`、`terminalOsc8Link.ts`、`terminalWebLinks.ts`、`terminalExternalLinkRequests.ts`、`TerminalExternalLinkConfirmation.tsx`：每个 Block 的 xterm 生命周期、与已排队输出有序执行的会话重置、直接输出 writer、本地剪贴板路径准备与远端暂存任务的有序粘贴、按动作挂载的右下角悬浮状态卡片、OSC 工作目录、OSC 8 激活及普通 HTTP/HTTPS 文本识别适配、终端外链请求边界与风险确认、PTY 尺寸适配与 semantic token palette registry；OSC 8 与 Web Links 继续由 xterm 解析和展示，实际 HTTP/HTTPS 目标经统一确认后才交给工作区内部浏览器或共享系统外链边界；悬浮卡片不占用 xterm 布局高度；该层只消费一次性最终粘贴文本，不读取本机文件内容/图片像素、选择缓存/远端临时目录、管理连接配置、布局树或 theme selection。
- `src/files/FileBrowserPane.tsx`、`FileList.tsx`、`FileUploadMenu.tsx`、`fileBrowserModel.ts`、`FilePreviewDocument.tsx`、`FileSearchBar.tsx`、`useFileSearchSession.ts`、`fileSearchModel.ts`、`codeEditorSearch.ts`、`markdownPreviewSearch.ts`、`CodeEditor.tsx`、`MarkdownPreview.tsx`、`FileTextContextMenu.tsx`、`fileTextContextMenuModel.ts`：内部文件窗口的目录导航、虚拟列表/排序纯规则、下载、viewport 级上传菜单、瞬时预览编辑状态与按需编辑/渲染组件；文件预览组合层拥有单文件搜索会话，纯模型负责文字匹配，CodeMirror 与 Markdown adapter 只负责各自表面的高亮和定位；文本预览与编辑共用 Files-owned 菜单生命周期，CodeMirror 独立拥有编辑历史/选区命令，Markdown 独立拥有受预览范围约束的 DOM 选区与链接目标；不依赖 TerminalRuntime，不直接读取本地文件或实现 SFTP。
- `src/lib/tauri/fileDrop.ts`：原生文件拖放订阅的平台入口；产品文件面板通过 `@qterm/services/fileDrop` 调用，浏览器选择无原生订阅的实现。
- `src/lib/tauri/profiles.ts`：连接配置、有序跃点候选/route 要求、不兼容存储清除与 SSH Config 导入 IPC 客户端契约；不包含配置路径、私钥路径、强制删除参数或领域校验。
- `src/lib/tauri/credentials.ts`：密码/私钥凭证库的窄 IPC 契约；不实现 KDF、加密或 JSON 访问。
- `src/lib/tauri/settings.ts`：配置根选择、当前构建模式默认根与派生存储布局快照，以及设备安全、外观、更新和远程终端集成偏好的窄 IPC 契约；不开放 locator 路径、构建模式、分区路径写入、Shell cache 或执行锁定/探测策略。
- `src/lib/updateCheck.ts`：固定 GitHub Latest Release 的超时请求、稳定 SemVer 比较、进程内启动单次去重与固定 Releases opener；不持久化偏好、自动安装或接受任意 URL。
- `src/lib/externalUrl.ts`：文件预览与终端 OSC 8 共用的绝对 HTTP/HTTPS URL 校验及 Tauri/浏览器外部打开适配；拒绝相对路径、文件、Shell、SSH、脚本和其他协议，不拥有链接展示、终端解析或页面导航。
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
- `src-tauri/src/lib.rs`：Tauri 组合根，注册 commands、装配 adapters，在 Windows/Linux 把主窗口标题同步为最终 productName、在 macOS 保留 Overlay 窗口创建时的静态隐藏标题，按 Rust debug/release 模式选择互不 fallback 的 home locator/default-root，再派生并初始化 root/data/device/cache 后构造全部 repositories；不写程序目录、不读取另一模式或旧 AppData 位置，也不在 repository 内重复计算全局路径。
- `src-tauri/src/domain/profile.rs`：连接配置、最多 4 个显式有序跃点、候选资格与引用完整性规则；不包含 IPC、凭证明文或 JSON 序列化模型。
- `src-tauri/src/domain/auth.rs`：短期凭据包装、可执行认证请求与稳定认证失败；不表达 profile 的 `manual` 策略，也不依赖 `russh` 或 Tauri。
- `src-tauri/src/domain/credential.rs`、`ports/credential_vault.rs`、`application/credential_service.rs`：vault 领域语义、外部存储端口与用例边界；不依赖具体密码学文件格式或 UI。
- `src-tauri/src/domain/settings.rs`、`ports/settings_repository.rs`、`application/settings_service.rs`：安全、外观、更新与终端集成设置的默认值、范围、注入配置根、存储端口与用例；domain 只展开/校验输入并使用组合根注入的默认目录，application snapshot 投影默认/配置/活动根，不依赖 JSON、Tauri、Cargo build mode、SSH 或 Windows API。
- `src-tauri/src/domain/shell_integration.rs`、`ports/remote_shell_cache.rs`：受支持远程 Shell、目标签名、固定探测输出解析、当前会话 OSC 7 Hook、Shell 专属初始目录字面量编码与可丢弃 cache 契约；不依赖 russh、JSON 或 Tauri。
- `src-tauri/src/domain/history_free_shell.rs`：实验性 Bash 历史禁用的 rc 启动脚本、用户配置加载、兼容 prompt 的可选 OSC 7 与目录字面量；`infrastructure/shell_startup.rs` 拥有有界、按会话隔离的初始化握手，`infrastructure/ssh/client/session/history_free.rs` 与 `infrastructure/local/history_free.rs` 分别适配 SSH exec 和本地 Unix PTY。高级设置偏好复用 TerminalSettings（OSC 7 布尔配置），仅在启动时取快照；配置冲突警告、实际启动失败不降级。边界与测试方法见 `docs/history-free-bash.md`。
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
- `src-tauri/src/infrastructure/git_execution.rs`、`git_cli/mod.rs`、`git_cli/{executor,process,repository,parsers,changes,conflict,branch,submodule}.rs`：本机与 SSH Git adapter 共用的 read/mutation/network 活动与总时长预算、稳定的系统 Git executor façade，以及按进程边界、快照解析、更改、冲突、分支同步和直接 Submodule 分组的内部 adapter；本机 runner 以 stdout/stderr 活动刷新 idle deadline，并在超时后 kill/wait；测试按 parser、process、lifecycle、diff、conflict、sync 与 Submodule 行为位于 `git_cli/tests/`。该目录不经 shell、不接收 WebView 命令片段、参数数组、Submodule URL/OID selector、recursive/update-remote/force 选项或持久化仓库状态。
- `src-tauri/src/domain/network.rs`、`ports/network_repository.rs`、`application/network_service.rs`：转发规则、不变量、profile 引用与配置用例边界；不包含 socket、SSH channel、运行状态或持久化格式。
- `src-tauri/src/commands/network.rs`：Network 严格 DTO、profile-bound session 建连和规则启停 IPC；不实现 SOCKS5 或 TCP 数据泵。
- `src-tauri/src/commands/clipboard.rs`：接收当前 SSH session ID/opaque task ID 或无参数本地准备请求，调用本地路径准备或远端暂存/取消用例，并桥接一次性最终本地粘贴文本及无敏感远端事件；不接收本机路径、文件字节、远端路径策略或权限参数。
- `src-tauri/src/commands/browser.rs`：Chrome/Edge 白名单 DTO、SOCKS5 规则类型复核与浏览器 adapter 调用；不接受可执行路径、命令参数或实现平台探测。
- `src-tauri/src/infrastructure/browser/`：共享 SOCKS5 greeting、固定 Chromium 参数和机器本地隔离 Profile，并以 Windows、macOS、Linux adapter 受限探测和无 Shell 启动 Chrome/Edge；不修改系统代理、支持沙箱化 Linux 浏览器、复用日常 Profile 或管理浏览器退出。
- `src-tauri/src/infrastructure/persistence/json_network_repository.rs`：`network-forwards.json` schema v1 的严格、无敏感字段、原子持久化适配器。
- `src-tauri/src/infrastructure/persistence/json_workspace_repository.rs`：`workspaces.json` schema v10 的严格、无敏感字段、原子持久化与受支持旧版本显式迁移适配器；不保存 session、Git snapshot、仓库内容或连接凭据。
- `src-tauri/src/ports/settings_repository.rs`、`src-tauri/src/infrastructure/persistence/json_{appearance,update,terminal}_settings_repository.rs`：设备外观/更新/终端集成偏好 ports 与独立 JSON 适配器；外观/更新使用 schema v1，终端兼容 v1–v5、保存 v6，保留目录跟踪、历史策略与旧 passive 字段，读取但不再写入旧 applicationTitleEnabled/commandMarkersEnabled 字段；只保存封闭预设或布尔偏好，不覆盖损坏/未来文件，也不修改 security settings。
- `src-tauri/src/infrastructure/persistence/json_remote_shell_cache.rs`：`cache/remote-shells.json` 的严格、原子、可丢弃适配器；只保存目标签名和 Shell 枚举，不保存探测输出、Hook、终端内容或凭据。
- `src-tauri/src/infrastructure/ssh/forwarding.rs`：本地 listener、SOCKS5 CONNECT、Remote target 路由、有界转发任务与 TCP/SSH 双向数据泵；第三方 channel 类型不得离开 infrastructure。
- `src-tauri/src/ports/profile_repository.rs`：应用层拥有的连接配置 repository 契约；不规定文件格式。
- `src-tauri/src/infrastructure/local/pty.rs`：本地 PTY 创建与进程 I/O owner；在 spawn 时解析一次性工作目录并对无效/失效路径回退到规范化 home，不解释远程 Shell 语法。普通 Shell 使用平台默认启动与原生 OSC 7 集成，不注入终端输入。
- `src-tauri/src/infrastructure/clipboard.rs`：在阻塞工作线程读取原生 file list/text/RGBA；现有文件路径只生成 Rust 内部一次性来源，RGBA 校验后流式编码到 Qterm cache root 下私有 clipboard 目录的 UUID PNG，并仅清理过期受管图片；不向 WebView 返回图片资源或字节。
- `src-tauri/src/infrastructure/ssh/client.rs`、`client/manager_{core,control,files,ports}.rs`：稳定 `SshSessionManager` façade 与按核心会话、控制、文件/传输和端口转发分组的 manager 实现；不向 commands/application 泄漏 russh 或 SFTP 类型。
- `src-tauri/src/infrastructure/ssh/client/session.rs`、`session/{terminal,files,git}.rs`：route 建连 façade 与 Terminal、Files、Git purpose-specific runner；Git runner 通过同一 profile-owned session 执行固定 conflict detail/side/delete/stage，并仅为有界结果写回复用内部 SFTP 原子写语义，各用途对外能力仍独立，取消、task drop 和关闭语义仍由共享 manager/session ownership 约束。
- `src-tauri/src/infrastructure/ssh/client/git.rs`、`client/git/command.rs`：受限远端 Git action façade 与 SSH exec command runner；runner 按共享预算用 channel 活动刷新 idle deadline，保留总时长上限和输出边界，超时后发送 TERM/KILL 并关闭 channel，不向上层泄漏 russh 类型或接受任意命令。
- `src-tauri/src/infrastructure/ssh/client/transfer.rs`、`transfer/{files,staging,upload}.rs`：传输 dispatch façade、远端文件操作、Terminal staging/download 与 upload/流式复制实现；路径边界、取消与失败清理不进入 command 或 application。
- `src-tauri/tauri.conf.json`、`tauri.macos.conf.json`：正式应用身份、通用无边框桌面窗口与 macOS 原生 Overlay 标题栏的分层配置，以及构建和打包入口；macOS 交通灯以逻辑坐标交由 Tauri/Tao/Wry 原生绘制生命周期唯一维护，不另设 AppKit 事件观察器或 frame 修正 adapter；不承载 Workspace 或 SSH 规则。
- `src-tauri/capabilities/default.json`：主窗口最小 Tauri 权限清单。
- `package.json`、`src-tauri/Cargo.toml`：前端与 Rust 的直接依赖及质量命令入口。
- `.github/workflows/build-desktop.yml`：macOS ARM64、Windows x64 与 Linux x64 的版本标签/手动构建和 workflow artifact 上传入口；不发布 Release 或执行部署。

## Module Responsibilities

- `.agents/skills/`：负责把长期工程与界面规范转成可执行的 agent 决策流程；不替代 qb-spec change、测试、linter 或源码门禁。
- `src/app/`：负责顶层布局、feature 组合与应用级预设主题生命周期；不承载认证、连接或传输规则。
- `src/workspace/`：负责工作区结构模型、布局树变换、顶部 Workspace 导航、按连接的有界 Git 仓库历史和 block runtime 编排；不读取本地文件、验证仓库有效性或实现 SSH/SFTP。
- `src/terminal/`：负责 xterm 实例及终端 I/O 适配；不持久化 buffer 或拥有 Workspace 生命周期。`terminalView.ts` 拥有可重挂载的 xterm 视图与 addon 生命周期；`terminalOsc52.ts` 拥有有界、只写的剪贴板协议适配；`terminalClipboardShortcuts.ts` 拥有复制/粘贴快捷键与原生编辑事件分流；`useTerminalInputBindings.ts` 拥有视图绑定生命周期、搜索与词导航接线。macOS/Windows 的原生 paste 在 xterm 处理前接入既有暂存/确认流程；Linux 保持 PRIMARY 选区粘贴语义。`TerminalInput.test.tsx` 保护输入和上传行为，`terminalPanelTestFixture.ts` 提供测试专用 xterm/IPC fixture。
- `src/terminal/imageExport/`：负责选中完整行的固定宽度快照、系统主题采样、终端外框与图片绘制、S/M/L（1×/2×/3×）尺寸档位与像素上限、预览及导出状态；不修改 live buffer、应用主题或会话。`TerminalContextMenu.tsx` 拥有终端菜单展示和菜单键盘导航，`TerminalPanel.tsx` 只组合导出入口。
- `src/lib/tauri/terminalImage.ts`、`src-tauri/src/commands/terminal_image.rs`、`src-tauri/src/infrastructure/terminal_image.rs`：分别负责 PNG 原始字节 IPC、原生保存路径选择与错误映射、PNG 有界校验及原子落盘；不接受前端指定的任意保存路径，不接管文件传输或终端会话。
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

- `src/workspace/WorkspaceUtilityRail.tsx`：共享桌面与 Demo 的工具项名称、图标、顺序及布局；桌面注入操作和状态，Demo 仅为文件、网络、Git 和终端传入 controls，其余禁用并提示尚未开放。该组件不拥有工具业务逻辑。
- `src/workspace/WorkspaceToolRail.tsx`：桌面工具栏的 Block 打开入口，组合文件、网络、Git、终端和本地浏览器操作及浏览器能力判断；复用 Workspace action，不拥有弹窗、锁定、会话或持久化状态。

- `src-tauri/src/infrastructure/ssh/client/tests/connect_fixture.rs`：SSH 测试共用的终端/辅助会话请求 fixture，默认不启用任一 Shell 注入协议。

- `src/web/webSurfacePanels.ts`、`webSurfaceOcclusion.ts` 与 `src-tauri/src/infrastructure/web/surface_raster.rs`：消费公共弹层测量，生成局部裁剪与圆角、reveal、父级裁切、主题描边；复用 windows_frame 的鼠标穿透窗口合成抗锯齿边缘，不拥有导航或 guest 权限。超过 64 个区域或 8 个边缘面板时由协调器完整覆盖，禁止截断部分弹层。
- `navigation_state.rs` / `windows_navigation.rs` 同步成功页面的原生 title；`domain/web_library.rs` 负责有界标题文本与不改变访问顺序的元数据更新，旧历史/收藏在再次访问时补正标题。

- `src/web/WebTabs.tsx`：浏览器页面挂载/选中/关闭与每个 block 最多 10 个标签；`WebTabStrip.tsx`、`WebTabButton.tsx`、`webTabs.css` 负责紧凑 header 与溢出标题提示，`webTabDeck.ts` / `useWebTabDeck.ts` / `webTabDeck.css` 负责窄宽度叠放、预览弹簧和滚动；标签列表不进入 Workspace 持久化。`WebDataPopover.tsx` / `webDataPopover.css` 负责地址框内的连接级选择性清理入口和反馈，原生页只接收聚合状态。
- `domain/web_storage.rs`、`infrastructure/web/profile_storage.rs` / `profile_gateway.rs` / `lifecycle.rs`：连接与认证路由身份、原生保护模式扩展点、cache/web-profiles 持久目录、稳定 loopback 代理入口和 SSH 所有者引用；跨 block 共享环境，页面独立生命周期，不持久化浏览器令牌到配置。`clear_data.rs` / `windows_data.rs` 负责串行暂停/恢复同环境页面及 WebView2 分类清理。未来主密码迁移边界见 `docs/browser-storage.md`。

- `src/components/tabDeck.ts`：主工作区与网页标签共用的纯叠放几何与临界阻尼弹簧步进；各自 feature 拥有测量、预览意图和 DOM 绘制，页面/工作区生命周期不进入共享模型。

- `src/components/TabActionMenu.tsx` / `tabActionMenu.css`：工作区与网页标签共享的操作菜单、视口约束与键盘/外部关闭交互，原生兼容外观委派公共 overlays 层；`src/web/useWebTabMenu.ts` 负责右键意图、折叠锚点与原生页面聚焦关闭；`webTabClose.ts` 负责当前 block 的关闭范围和活动页回退，不操作 SSH 会话、缓存或其他 block。

- `src/components/useNativeWebDismiss.ts`：保留标签菜单、主机概要和连接选择器的原生聚焦关闭兼容订阅，不拥有绘制策略、不夺回网页焦点。`src/workspace/terminalTargetModel.ts` 负责连接选择器的最近连接、分组与搜索列表派生。
- `src/components/overlays/overlayRegistry.ts` / `nativeOverlay.css`：全应用浮层的声明式绘制契约 `data-app-overlay="floating|modal|transition"`、DOM 生命周期登记、实际绘制测量及公共不透明外壳；ARIA role 不决定原生可见性。`nativeInteraction.ts` 将原生交互定位到所属 DOM surface，复用业务外部 pointerdown 关闭逻辑；`overlayContract.test.ts` 检查 JSX menu/dialog/tooltip 入口没有漏接公共契约。
- `src/components/hoverTooltip.css`：统一所有 hover 气泡的 `data-overlay-motion="hover"` 契约，按连接状态节点参照执行 130ms/3px 入场、移出立即卸载与减少动态效果。按钮/文本/协议等组件只拥有内容、定位和 hover/focus 生命周期；移除各业务自己的缩放动画和退场计时器，源码接入检查要求所有 tooltip 使用公共动效。
- `src/web/surface/nativeSurfaceCoordinator.ts`：唯一原生表面帧循环，共享弹层、选中边框和主题测量，按交集选择局部裁剪或完整覆盖；`surfaceSync.ts` 拥有串行 IPC、最新意图合并、文档/尺寸代次与取消，`surfaceCover.ts` 拥有短期预览 DOM 和解码/绘制时序。`useWebBrowser.ts` 只接入 guest 生命周期、页面事件和表面注册；锁屏/隐藏/卸载清除预览，不新增持久化状态。
- `src-tauri/src/infrastructure/web/snapshot.rs` / `windows_snapshot.rs`：验证 guest/连接可见性，执行 1.5 秒、16 Mi 像素/16 MiB PNG 上限的内存预览；`windows_surface.rs` 负责原生输入阻断、焦点交还与空 region 覆盖，保留可见的 WebView2 compositor；`windows_interaction.rs` 只转发已聚焦且可交互 guest 的固定交互通知，不增加客体 IPC 权限。`native_modal_tests.rs` 在隔离 WebView2 fixture 中验证覆盖/恢复、快照和输入状态。

- `src/workspace/useLayoutInteractions.ts`：工作区 Block 拖放与分隔线指针捕获、几何命中、取消和实时比例 owner；不依赖原生网页上的 DOM hit-test。`LayoutDragOverlay.tsx` 统一所有 leaf 的落点预览与拖拽标签，声明 transition 交给现有 native surface 快照桥接；不把拖拽转换为页面不可见。`LayoutView.tsx` 只组合稳定 block 实例。
- `src/web/WebBlock.tsx` 的左右/上下分屏入口通过 `openWeb.direction` 创建同连接空白浏览器；`reducer.ts` 保持既有默认水平方向和旧 leaf 身份。网页标签按钮独立处理输入，标签栏空白处允许发起整个 Block 的拖动；不跨 Block 移交单个网页实例。
