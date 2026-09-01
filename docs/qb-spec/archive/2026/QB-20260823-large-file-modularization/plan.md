---
id: QB-20260823-large-file-modularization
status: archived
archived: 2026-09-02
legacy: true
---
## Background

> 实施状态（2026-08-23）：Phase 0–3 已落地；Phase 4 已迁移 credential/SSH Config 的 pending 生命周期与纯映射规则，完整 import rollback/coordinator 仍待迁移；Phase 5 文档与质量门已完成。SSH façade 保留为 `client.rs` 加邻接 `client/` 子模块，而非机械改名为 `client/mod.rs`，公开路径与计划边界不变。当前 theme contract 已覆盖 app root、xterm 与 CodeMirror 核心 surface，但 feature CSS 的剩余原始暗色值仍需在后续视觉基线任务中按语义归并，不能机械生成一色一 token。

当前大型文件的主要风险不是单一行数阈值，而是多个稳定职责共享同一个变更入口：`app.css` 约 133 KB，覆盖 470 个不同类名和多个功能域；`ConnectionDialog`、`FileBrowserPane`、`WorkspaceProvider` 分别集中大量局部状态和异步编排；Rust `infrastructure/ssh/client.rs` 含约 2,378 行生产代码，同时实现 route/session、network、SFTP 与 transfer；credential/profile commands 还承担部分用例决策和回滚。

这些路径覆盖 UI 级联、连接竞态、认证、host-key、凭证恢复、文件操作和转发清理，属于大型且安全敏感的结构重构，因此采用 Strict plan。当前颜色还分别存在于 CSS、xterm TypeScript theme 和 Tauri 原生窗口配置中；如果仅移动 CSS 文件，未来主题切换仍会再次横切全局。实施目标是改变代码所有权并建立主题扩展点，不改变当前可观察行为。

## Requirement

按功能所有权把目标大型文件拆为可独立理解、测试和回滚的模块；将当前暗色视觉值收敛到可扩展的主题边界；保留前端可观察行为、稳定 React/IPC 门面、Rust 依赖方向、序列化兼容性和安全边界。

## Non-Goals

- 不新增或删除产品能力，不进行视觉重设计。
- 不改变公开 IPC、DTO 字段、错误码或持久化 schema。
- 不修改 SSH、凭证、host-key、传输和网络转发规则。
- 不引入新的样式、状态管理或 SSH 依赖。
- 不实现主题选择 UI、持久化、系统模式解析或第二套主题；默认仍为当前 dark theme。
- 不拆 `json_credential_vault.rs` 的密码学实现。
- 不以统一行数阈值驱动无语义拆分。
- 不构建 release bundle。

## Architecture Impact

### Frontend style ownership

- 保留 `src/app/app.css` 作为唯一顶层样式入口，按明确顺序导入 application foundations 和功能样式。
- 预期新增 `src/app/styles/` 中的 theme contract、reset、共享控制、shell 和 accessibility 文件，以及 `src/app/styles/themes/dark.css` 当前主题定义。
- Workspace、Terminal、Files、Network 的样式分别放到对应功能目录；Connection、Credential、Settings/About 等 Dialog 样式放到 dialog 邻近位置。
- 首次迁移只移动原规则，保持相对顺序、特异性和 media query 内容。重复选择器合并是迁移验证后的独立提交。

### Theme boundary

- `document.documentElement` 是未来主题标识的唯一 DOM owner；当前显式使用 `data-theme="dark"` 或等价的单一 app theme root，feature component 不读取或持有 theme state。
- `themes/dark.css` 为现有视觉值的权威来源，并设置对应 `color-scheme`。token 使用 surface、text、border、accent、danger、focus、status、material 与 terminal ANSI 等语义角色，不使用带主题名或调色板序号的公共名称。
- feature CSS 原则上只消费语义变量、`currentColor`、`transparent` 和由变量组成的 `color-mix`/gradient。确需保留的第三方兼容或固定透明值进入小型、显式 allowlist；不能把每个旧十六进制值机械包装成无意义 token。
- xterm 的 foreground/cursor/selection/ANSI/scrollbar theme 从 CSS semantic tokens 生成，并提供对已缓存 terminal views 的统一刷新入口；`TerminalPanel` 不再拥有独立硬编码 palette。
- CodeMirror 继续由 feature CSS 控制，但 editor surface、syntax-neutral text、selection、gutter 和 diagnostic 状态消费相同语义 token。
- Tauri 配置继续以 Dark 作为无选择状态的启动默认值；未来 app theme service 通过 `src/lib/tauri/window.ts` 的窄 adapter 同步原生窗口主题，不能让 feature UI 直接调用 window theme API。本任务只保留该适配点，不增加新 command。

### React ownership

- 页面入口组件继续拥有跨区域协作状态和嵌套 dialog 生命周期。
- Connection/Credential 的列表、编辑区、反馈/tooltip、jump route 等纯展示或局部交互拆到 `src/components/dialogs/connection/` 与 `credential/`。
- Files 的排序、虚拟列表/行、预览编辑、命名/删除操作状态拆到 `src/files/` 的局部组件与纯函数模块。
- WorkspaceProvider 保留 context/provider 门面；Terminal、Files、Network runtime 的 epoch、intent、writer/buffer 和关闭编排放入独立内部控制器，且不引入第二份权威状态。

### Rust ownership

- 将 `src-tauri/src/infrastructure/ssh/client.rs` 迁为 `client/mod.rs` 稳定门面，并按 `session`、`handler`、`network`、`sftp`、`transfer` 拆分内部实现。
- `SshSessionManager` 继续是 commands 的唯一 SSH session 管理入口；内部第三方 channel/session 类型不公开到 application 或 commands。
- 新增 application 用例模块承载 SSH Config import selection/name allocation/rollback，以及 credential recovery/private-key draft 生命周期。
- commands 保留 Tauri `State`、DTO、系统文件对话框、事件发送和错误映射；不拥有可脱离 Tauri 测试的业务决策。

## Domain Model Impact

不修改稳定领域模型和业务规则。必要时新增 application 层 workflow input/result，不能复用 command DTO 或 persistence record 作为领域模型。现有 `ConnectionProfile`、credential material、session state machine、remote path 和 transfer event 语义保持不变。

## API Impact

- Tauri command 名称、参数 JSON、返回 DTO、事件 payload 与错误码不变。
- TypeScript `src/lib/tauri/*` 契约不变；仅允许因内部类型迁移调整 import。
- React 的 `WorkspaceContextValue` 保持兼容，现有调用方无需迁移到新的状态容器。
- `SshSessionManager` 对 commands 暴露的方法集合和行为保持兼容。
- 不新增公开主题 IPC。未来主题设置由独立 app/theme 状态和现有 window adapter 协调，不进入 Workspace context。

## Database Impact

无。所有 JSON/vault schema、版本号、文件名、路径、加密 envelope、KDF 参数和原子写入规则保持不变。不执行数据迁移、重写或删除。

## Implementation Tasks

### Phase 0 — Baseline and protection gate

1. 记录目标文件、公开门面和当前测试集合；确认 worktree 中用户已有改动并避免覆盖。
2. 运行前端与 Rust 基线质量门。若基线失败，记录为已有失败，不在结构重构中顺手修复无关问题。
3. 对关键路径做覆盖盘点：Connection drag/group/jump/draft、credential lock/reset/private key、Workspace epoch/intent/buffer、host-key/route cleanup、SFTP path safety、transfer cancel、forward cleanup、import rollback。
4. 只有发现上述关键行为没有稳定自动化保护时，先补行为测试；样式机械迁移不为普通声明逐条新增测试，但必须保留滚动、focus 和 accessibility 契约测试。

### Phase 1 — Style ownership

1. 先盘点 CSS、xterm、CodeMirror 和原生窗口的颜色来源，把现有值按 foundations、surface/material、content text、interaction state、status、terminal ANSI 分类；合并语义相同的值，不按每个十六进制机械生成 token。
2. 建立顶层样式 manifest、theme contract、`themes/dark.css` 与 feature-local 文件，按 `app.css` 当前出现顺序迁移规则并保持 dark theme 的计算值。
3. 将跨功能 reset、共享 button/dialog/focus 和全局 accessibility fallback 留在 application foundations；功能前缀规则归对应目录；reduced-transparency 和 increased-contrast 优先覆盖语义 token，只有布局/能力差异才保留组件选择器。
4. 将 xterm palette 提取为读取语义 token 的窄 adapter，并提供刷新已缓存 terminal views 的函数；CodeMirror 的颜色声明迁到 editor semantic tokens。当前调用仍只应用 dark theme。
5. 将 `appStyles.test.ts` 按 application/theme、workspace、terminal、files、network、dialogs 拆到相邻测试；测试直接读取拥有该规则的文件。
6. 增加静态主题契约测试：验证必需 token、默认 dark root、xterm 映射，并限制 feature CSS 新增原始色值；允许项必须说明第三方或透明材质原因。
7. 检查跨功能组合选择器，只有确属共享 surface/accessibility fallback 时留在 foundations；其余在功能文件中保留完整选择器，不改变特异性。
8. 运行聚焦样式/terminal/editor 测试、完整前端测试和 build；在普通与最小支持窗口检查 Workspace、Connection、Credential、Files、Network、Settings/About 的滚动、焦点和 dark theme 视觉一致性。

### Phase 2 — React component and runtime ownership

1. 先提取纯函数和无副作用展示组件，保持 props 由原入口组件提供；不得在第一步引入新的共享抽象。
2. 拆 Connection 列表/group/context/drag、editor tabs/jump picker/save feedback；父组件继续拥有 draft、selection 和 nested dialog。
3. 拆 Credential list/editor/private-key creation/feedback/security tooltip；父组件继续拥有 vault 状态和创建/删除流程编排。
4. 拆 File sort/virtual range/row/context menu 与 preview/mutation 状态；目录加载、选择锚点和 runtime 仍只有一个权威来源。
5. 将 Workspace Terminal/Files/Network runtime 协调迁到专用内部控制器；通过显式参数和返回动作连接 reducer/context，避免隐藏的跨-hook 可变单例。
6. 每完成一个入口组件即运行其相邻 Testing Library 测试、typecheck 和 lint；Phase 2 结束运行 `pnpm check`。

### Phase 3 — SSH infrastructure modules

1. 先移动无状态 path/copy/scan helpers 和其测试，再移动 SFTP/transfer 实现，保持错误类型与取消语义。
2. 移动 network runtime 和 forwarding control glue，保持 `forwarding.rs` 作为 socket/channel 数据泵所有者。
3. 移动 route handler、host-key decision 和 session runner；最后收敛 `client/mod.rs` 为 manager、公开请求/错误类型及内部模块装配。
4. 每次移动只调整可见性和 import，不重写异步控制流；禁止用 `pub` 扩大第三方类型的可见范围来绕过模块边界。
5. 分别运行 SSH/session/files/transfer/network 聚焦测试、fmt 和 clippy；Phase 3 结束运行全量 Rust tests。

### Phase 4 — Command/application workflows

1. 为 SSH Config import 建立 application workflow，迁移 preview 生命周期、selection、唯一命名、credential 创建协调与失败回滚；infrastructure parser 和 command dialog 适配保持原职责。
2. 为 credential recovery/private-key draft 建立 application workflow，迁移 pending state、过期/取消/commit 决策和输入验证；系统文件选择与 Tauri event 保留在 command adapter。
3. DTO 到 application input/result 的转换留在 commands；application tests 不依赖 Tauri mocks。
4. 先以现有 command 测试保护 IPC 兼容，再为 application workflow 增加正常、取消、过期、部分失败、回滚和 secret 不外泄测试。
5. 运行 credential/profile/import 聚焦测试、完整 Rust 质量门和前端 IPC bridge 测试。

### Phase 5 — Documentation and final gate

1. 根据实际落地文件更新 `ARCHITECTURE_SPEC.md` 与 `DIRECTORY_MAP.md`；不得把未实现的候选目录写成既有事实。
2. 更新本 spec/plan 的实施状态或记录偏差；若最终边界偏离计划，说明原因和残余风险。
3. 执行完整前端和 Rust 质量门，汇总自动化与代表性 UI 检查证据。

## Acceptance To Verification

- A1：样式 manifest/feature 文件审查；自动检查 `app.css` 不再直接拥有 feature selector 集合；相邻样式测试读取对应文件。
- A2：Workspace、dialog、file、network 样式契约测试；代表性窗口检查 focus、滚动、motion/transparency/contrast media query。
- A3：`ConnectionDialog.test.tsx`、`CredentialDialog.test.tsx`、`FileBrowserPane.test.tsx` 及拆出的纯函数测试保持可观察行为。
- A4：`WorkspaceProvider.test.tsx` 的 SSH/local 切换、late failure、writer replacement、buffer、Files/Network 独立 session 和 route failure 测试。
- A5：Rust SSH client/session/files/transfer/network tests；commands 编译和现有调用测试证明 façade 兼容。
- A6：application workflow tests 覆盖正常、过期、取消、部分失败和 rollback；command/TypeScript tests 证明 IPC 未变。
- A7：credential/session/host-key/path/transfer/forwarding 高价值测试在迁移前存在并在迁移后通过；安全审查确认 secret 类型未进入 DTO/log。
- A8：每阶段记录聚焦命令结果；最终执行全部质量门。
- A9：`ARCHITECTURE_SPEC.md`、`DIRECTORY_MAP.md` 与实际路径和依赖方向逐项核对。
- A10：theme contract tests 检查默认 dark root、semantic token 集合、feature raw-color allowlist、xterm palette 映射和 cached view refresh；CodeMirror 样式契约确认 editor 使用语义变量；审查确认 Workspace/feature state 不持有 theme。

## Test Plan

### Frontend focused

- `pnpm vitest run src/app/appStyles.test.ts src/components/dialogs/aboutUpdateStyles.test.ts`
- 迁移后改为运行拆出的 application/workspace/terminal/files/network/dialog style tests。
- `pnpm vitest run src/terminal/TerminalPanel.test.tsx src/files/FileBrowserPane.test.tsx`
- 运行新增的 theme contract、raw-color guard 和 terminal theme adapter tests。
- `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/components/dialogs/CredentialDialog.test.tsx`
- `pnpm vitest run src/files/FileBrowserPane.test.tsx src/workspace/WorkspaceProvider.test.tsx src/workspace/WorkspaceShell.test.tsx`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check`

### Rust focused

- `cargo test --manifest-path src-tauri/Cargo.toml infrastructure::ssh::client`
- `cargo test --manifest-path src-tauri/Cargo.toml session`
- `cargo test --manifest-path src-tauri/Cargo.toml files`
- `cargo test --manifest-path src-tauri/Cargo.toml transfer`
- `cargo test --manifest-path src-tauri/Cargo.toml network`
- `cargo test --manifest-path src-tauri/Cargo.toml credential`
- `cargo test --manifest-path src-tauri/Cargo.toml profile`

### Final gate

- `pnpm check`
- 在 `src-tauri/` 运行 `cargo fmt --check`
- 在 `src-tauri/` 运行 `cargo clippy --all-targets --all-features -- -D warnings`
- 在 `src-tauri/` 运行 `cargo test --all-targets --all-features`

### Manual representative checks

- 正常窗口和最小支持窗口检查 Workspace、Connection、Credential、Files、Network、Settings/About；确认只有指定区域滚动，核心动作无需 hover 可见。
- 键盘检查顶层/nested dialog 的 Tab、Escape、focus restoration。
- 系统 reduced-motion、reduced-transparency 和 increased-contrast 下检查不发生布局或可用性回归。
- 核对 dark theme 下 xterm、CodeMirror、窗口 chrome、dialogs 和工作区 surface 与迁移前一致；本任务不验收不存在的 light theme。
- 不要求 release bundle；若开发环境无法启动完整 Tauri UI，记录未覆盖的视觉项和残余风险。

## Rollback Plan

- 每个 Phase 使用独立、聚焦的 Conventional Commit；前一阶段质量门通过后才开始下一阶段。
- CSS 阶段可恢复原 `app.css` 和单文件样式测试，不涉及数据或 API 回滚。
- theme-ready 结构不保存用户选择；回滚 theme contract、dark theme 和 renderer adapter 后仍恢复原硬编码 dark 外观，不需要设置迁移。
- React 阶段保留入口组件/Context 的兼容门面，可按单个入口组件回滚。
- SSH 阶段保持 `infrastructure::ssh::client` 模块路径和 `SshSessionManager` 门面，可整体恢复单文件实现。
- command/application 阶段不改变 schema/API；可把 workflow 调用恢复到原 command 实现，不需要数据迁移。
- 任何阶段不得用删除用户数据、重写配置或降低安全校验作为回滚手段。

## Risks

- CSS 拆分可能因 import 顺序、组合选择器或 lazy chunk 注入顺序改变级联；首次迁移必须集中、显式排序并避免顺便重构声明。
- token 过度抽象可能产生一色一变量或把组件细节提升为全局 API；只提升跨组件语义角色，组件特有角色可以保持 feature-scoped custom property。
- xterm view 会跨 React 重挂载缓存；未来主题刷新若只作用于新实例会出现同屏多主题，必须由 terminal theme adapter 统一更新 registry 中全部存活 view。
- Tauri 原生材质和 WebView CSS 不属于同一渲染层；当前只保持 Dark 启动默认并预留 window adapter，未来真正切换时必须单独验证启动闪烁和平台能力差异。
- React hook/控制器拆分可能捕获过期闭包或复制权威状态，导致旧异步结果覆盖新 session；必须保留 epoch/intent 和 writer ownership 测试。
- SSH 模块拆分可能改变 task drop、channel 关闭和 cancellation 顺序；只机械移动异步控制流并保留 cleanup 测试。
- 为解决 Rust 可见性而扩大 `pub` 范围可能泄漏 russh 类型；优先 `pub(super)`/`pub(crate)` 且由 façade 暴露稳定类型。
- credential/profile workflow 迁移可能破坏 partial failure rollback 或延长 secret 生命周期；先补 application 级失败/回滚测试，继续使用 secret wrapper/zeroize。
- 大型计划跨多个提交，后续功能开发可能持续触碰目标文件；每个 Phase 开始前重新核对 worktree 和最新基线，避免覆盖用户改动。
- 文件变小不等于边界改善；代码评审以所有权、依赖方向和测试稳定性为准，不以最终行数作为唯一证据。

## Documentation Updates

- 本 task spec 与 Strict plan 是实施范围和阶段质量门的权威记录。
- 实现完成后更新 `docs/qb-spec/context/ARCHITECTURE_SPEC.md`，记录稳定的 style manifest、React runtime 门面、SSH client façade 和 application workflow 职责。
- 同一架构文档记录 app theme root、semantic token、renderer adapter 和 native window adapter 的所有权；第二套主题与选择持久化仍属于后续 task。
- 实现完成后更新 `docs/qb-spec/DIRECTORY_MAP.md`，登记实际新增、移动的文件与禁止依赖。
- 产品能力、领域规则和安全策略不变，不更新 `PRODUCT_SPEC.md`；仅当实现产生新的长期取舍时追加 `DECISIONS.md`。
