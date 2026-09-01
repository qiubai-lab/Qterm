---
id: QB-20260823-large-file-modularization
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

Qterm 的大型生产文件按稳定职责拆分，使样式、React 状态编排、SSH 基础设施和 Tauri 用例边界各自拥有清晰的维护入口；当前暗色界面同时形成可扩展的主题边界，使后续增加主题切换时无需再次重构所有功能样式，同时保持现有 UI、IPC、持久化格式、安全约束和运行行为不变。

## Scope

- 将 `src/app/app.css` 从跨功能全局样式仓库收敛为有序样式入口，并把 Workspace、Terminal、Files、Network 和各 Dialog 的规则迁移到对应功能域。
- 建立 theme-ready 的语义 token 层：当前暗色值由独立 theme 文件拥有，功能 CSS 消费角色化变量；xterm 等不能直接继承 CSS 的渲染器通过窄主题适配器取得同一组语义值。
- 将 `ConnectionDialog`、`CredentialDialog`、`FileBrowserPane` 中可以独立描述和测试的视图、操作状态与纯计算逻辑拆到功能局部模块。
- 将 `WorkspaceProvider` 中 Terminal、Files、Network runtime 的异步编排拆到明确的内部控制器或 hooks，保持现有 `WorkspaceContextValue` 消费契约。
- 将 `infrastructure::ssh::client` 拆为会话门面、route/handler、network forwarding、SFTP 操作和 transfer 执行模块，保持 `SshSessionManager` 对上层的调用方式。
- 将 credential recovery/private-key draft 和 SSH Config import 的用例编排从 Tauri command 移到 application 层；command 只保留 DTO、系统对话框适配、用例调用和错误映射。
- 在每个阶段迁移或补齐相邻测试，并在结构落地后更新长期架构说明和 Directory Map。

## Constraints

- 这是行为保持型重构；不得借机修改界面信息架构、视觉语言、快捷键、焦点、滚动所有权或动效参数。
- 不引入 CSS Modules、CSS-in-JS、样式框架、新 UI 库或新的运行时依赖；继续使用现有全局 token、功能类名前缀和普通 CSS。
- token 以用途命名而不是主题或具体色值命名，例如 surface/text/accent/status/terminal ANSI 角色；不得创建 `dark-*`、`gray-300` 或按单个组件偶然色值命名的公共 token。
- 当前暗色主题必须是默认值，并保持 Tauri 原生窗口、透明材质、CSS `color-scheme`、xterm 和 CodeMirror 的视觉一致；主题选择的未来状态不得混入 Workspace 或 feature component。
- CSS 首次迁移必须保持原规则的相对顺序和选择器特异性；共享规则合并只能作为通过回归验证后的独立步骤。
- React 拆分不得改变父级 draft 生命周期、顶层弹窗 Escape/focus 规则、异步 epoch/intent 防竞态语义或 block runtime 隔离。
- `SshSessionManager`、Tauri command 名称、TypeScript IPC 类型、序列化字段和错误码保持兼容。
- 私钥正文、密码、data key 和 recovery material 不得进入 WebView、日志、DTO 或持久化明文字段；现有 zeroize 边界保持不弱化。
- Domain Model、IPC DTO 与 persistence record 保持分离；application/domain 不依赖 Tauri、russh 或 JSON record。
- 每个阶段必须在质量门通过后再开始下一阶段，并能单独回滚。

## Non-Goals

- 不新增产品功能，不修订产品文案，不重新设计界面。
- 不改变 profile、credential vault、network、workspace 或 known-hosts schema。
- 不改变认证、host-key 信任、SSH route、SFTP、转发、上传下载或恢复密钥规则。
- 本轮不拆分 `json_credential_vault.rs` 的密码学格式、KDF 或持久化 record；仅在后续独立安全任务中重新评估。
- 不因行数单独拆分测试文件、简单 DTO 文件或目前职责内聚的模块。
- 不设统一的文件行数上限；文件大小只作为发现职责混杂的信号，不作为完成标准。
- 不运行桌面 release bundle；本任务不改变原生依赖、Tauri 配置或打包方式。
- 不在本任务实现主题切换 UI、主题持久化、跟随系统模式或第二套 light/high-contrast 主题；只实现能承载这些能力的结构和当前 dark theme。

## Acceptance

1. `app.css` 只承担有序样式入口或应用级 foundations；连接、凭证、文件、网络、终端、Workspace、Settings/About 等功能规则分别由明确的功能样式文件拥有。
2. 拆分后的样式保持现有 token、选择器语义、级联结果、缩小窗口滚动契约、focus-visible、reduced-motion、reduced-transparency 和 increased-contrast 行为。
3. `ConnectionDialog`、`CredentialDialog` 与 `FileBrowserPane` 的入口组件只负责编排其页面级状态和组合子视图；列表、编辑器、反馈层、文件行/虚拟列表及纯计算行为有清晰的局部所有者。
4. `WorkspaceProvider` 的公开 context 契约和调用方不变，Terminal、Files、Network session 仍按 block 隔离，旧异步结果不能覆盖较新的目标或 session。
5. `infrastructure::ssh::client` 保留 `SshSessionManager` 稳定门面，但 route/session、network、SFTP 和 transfer 实现位于不同内部模块；russh/russh-sftp 类型不越过 infrastructure 边界。
6. credential recovery/private-key draft 与 SSH Config import 的决策和回滚编排归 application 层；commands 中只保留 transport/desktop adapter 职责，现有 IPC/API 不变。
7. 认证、host-key、route 清理、凭证锁定/恢复、私钥内存边界、文件路径安全、传输取消和网络转发清理均有自动化回归保护。
8. 每一阶段完成时相关聚焦测试通过；最终 `pnpm check`、Rust fmt、clippy 和全量测试通过。
9. `ARCHITECTURE_SPEC.md` 与 `DIRECTORY_MAP.md` 反映最终模块职责，不记录尚未落地的目标结构。
10. 当前颜色值由明确的 dark theme/token 定义拥有；功能 CSS、xterm theme 和 CodeMirror surface 不再各自形成互不关联的颜色来源，未来新增主题不需要修改各功能组件的结构或业务状态。

## Acceptance To Verification

- A1：检查样式入口与功能文件 import 顺序；样式所有权测试确认目标功能选择器不再集中在 `app.css`。
- A2：迁移后的相邻样式契约测试，加上正常/最小支持窗口的代表性视觉检查；验证各 accessibility media query。
- A3：对应 Testing Library 测试覆盖连接分组/拖拽/跃点、凭证 draft/反馈、文件导航/选择/预览/操作；TypeScript 与 ESLint 证明边界无循环或未使用桥接。
- A4：`WorkspaceProvider` 竞态、buffer、route progress、Terminal/Files/Network 独立 session 测试。
- A5：SSH manager、route、host-key、SFTP、transfer 和 forwarding 的 Rust 单元/异步测试；commands 与调用方编译保持兼容。
- A6：application service 正常、过期、取消、部分失败和回滚测试；command DTO 与 TypeScript bridge 现有测试。
- A7：先确认关键路径现有覆盖，缺口先补测试再迁移；最终运行 credential/session/files/transfer/network 相关测试。
- A8：阶段质量门与最终完整质量命令的成功结果。
- A9：文档 diff 与最终源码目录、公开门面和禁止依赖相互一致。
- A10：主题契约测试验证默认 dark 标识、语义 token 完整性、功能 CSS 的原始色值约束和 xterm token 映射；代码审查确认主题状态位于 app/theme 边界而非 Workspace/feature state。

## Open Questions

无。默认采用分阶段、行为保持、可独立回滚的职责拆分，不把视觉优化或功能调整混入本任务。

## Recommended Approach

推荐“按所有权分阶段迁移，并在样式阶段先建立主题边界”：先把现有暗色值归入角色化 token 与 dark theme，将 feature CSS、xterm 和 CodeMirror 接到统一语义来源，再拆 React 局部视图和 runtime 控制器，随后拆 SSH infrastructure，最后把 commands 中的用例编排迁入 application。每阶段先锁定关键行为、机械迁移、通过质量门，再考虑局部清理。

备选方案一是只按功能拆 CSS 文件并保留全部硬编码颜色，成本较低，但未来增加主题时仍需修改所有功能文件。备选方案二是本次直接交付 light/dark/system 完整切换，短期结果完整，但会把产品选择、持久化、原生窗口同步和视觉验收混入大型结构重构。推荐方案只建立语义 token、dark theme 和非 CSS 渲染器适配点，既消除未来主题改造的结构障碍，又不扩大当前产品行为。

## Next Skills

- `writing-qb-plans`：使用 Strict 计划管理大型、认证和安全敏感重构。
- `checking-architecture-boundaries`：确认 commands/application/infrastructure 以及 React 容器/局部模块的最终所有权。
- `protecting-critical-behavior`：迁移前锁定认证、竞态、回滚、路径和 secret 边界。
- `verifying-before-completion`：执行阶段质量门和最终完整验证。
- `maintaining-project-context`：实现完成后更新长期架构职责；产品目标与领域规则本身不变。
- `updating-directory-map`：实现产生新的样式、React 和 SSH 模块后刷新结构索引。
