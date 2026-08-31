---
id: QB-20260831-git-remote-repository-picker
type: design
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 远程仓库混合式目录选择器

## Goal

把“更换仓库目录”从仓库内容卡片的更多菜单移动到 Git Block 顶部标题栏，并为已绑定的远程 Git 目标提供一个居中的混合式目录选择器：用户既可通过只读目录列表浏览，也可直接输入路径；服务器不支持 SFTP 时仍能依靠手动路径完成选择。

## Change Shape

- Type：`design`。用户已选定的交互需要由 Git/Files session 能力边界、IPC ownership 和失败降级共同约束。
- Tier：`strict`。变更开放 Git-purpose SSH session 的只读 SFTP 列目录能力，并必须防止 profile/session 越权和文件读取、写入、变更或传输能力扩散。
- Approval：用户于 2026-08-31 明确“采纳方案，请落地 spec/plan 并开始修改”，本 spec 进入 `approved`。
- Related changes：延续 `QB-20260830-remote-git-management` 的独立 Git session 与窄 IPC 原则，不修改其 Git action allowlist。

## Current Behavior

- Git Block 顶部标题栏右侧只有关闭按钮；更换仓库入口位于仓库卡片的更多菜单中。
- 本机仓库通过系统原生目录选择器更换。
- 已绑定远程仓库通过占满 Git 内容区域的路径输入表单更换，无法浏览服务器目录。
- Git-purpose SSH session 明确拒绝 `ListDirectory`；Files-purpose session 可以通过 SFTP 列目录。

## Recommended Design

- 在 Git Block 标题栏关闭按钮之前增加常驻文件夹按钮；本机目标继续打开原生目录选择器，远程目标打开 feature-local 的 `GitRepositoryPickerDialog`。
- 远程选择器使用一个标准居中弹窗，而不是完整文件管理器或 manager dialog：固定标题、固定目录导航工具栏、唯一滚动的目录列表和固定操作页脚。
- 路径输入始终可编辑；SFTP 浏览是增强能力而非前置条件。浏览失败时保留输入和确认能力，并显示“可直接输入路径”的稳定反馈。
- 选择器只列出目录并允许向上、后退、前进、刷新、输入路径跳转和双击/Enter 进入目录；只有页脚“选择此路径”会提交目标变更。
- 远程目录查询复用当前 Git SSH transport，但必须经过 Git purpose、profile ownership 和 connected-state 校验；只开放 `ListDirectory`，继续拒绝 read/write/mutate/transfer。
- 不直接复用完整 `FileBrowserPane`。选择器使用 Git feature-local 状态和列表，复用现有 DialogFrame、Icon、主题 token、路径规则及低层目录 listing 数据结构。

## Assumptions And Constraints

- 本次重点是已绑定仓库的“更换目录”；选择一个全新的远程 profile 后首次输入路径的现有流程保持不变。
- 本机目录选择继续走现有异步 native dialog bridge，不用 WebView 模拟本机文件系统。
- 首期不持久化新的“最近仓库路径”历史；弹窗以当前 target path 为初始位置。
- 目录浏览不负责初始化仓库，也不在每次导航时加载完整 Git snapshot；确认后的既有 GitPane snapshot/error/initialize 流程仍是仓库有效性的事实源。
- 远程路径继续遵守现有 `RemotePath` 与 Git path 输入上限，不接受 NUL 或超长输入。

## Requirements

- REQ-001：Git Block 必须在顶部标题栏右侧、关闭按钮之前常驻一个带可访问名称的文件夹操作；仓库卡片更多菜单不得继续承担“更换本机/远程仓库”入口。
- REQ-002：本机目标触发标题栏文件夹操作时必须继续使用现有非阻塞原生目录选择器；取消选择不得修改 target。
- REQ-003：已绑定远程目标触发标题栏文件夹操作时必须打开居中的混合式目录选择器，并以当前远程路径作为初始浏览路径和路径草稿。
- REQ-004：远程选择器必须支持路径输入、转到输入路径、向上、后退、前进、刷新以及通过鼠标或键盘进入子目录；目录列表不得暴露文件预览、编辑、上传、下载、创建、改名、删除、拖放或上下文变更操作。
- REQ-005：SFTP 列目录失败、服务器不支持 SFTP 或路径不可浏览时，选择器必须保留手动路径输入和“选择此路径”能力，错误反馈不得改变弹窗基本尺寸或关闭当前 Git snapshot。
- REQ-006：浏览、刷新和输入路径跳转只能修改弹窗草稿；取消或 Escape 必须保留原 target/session/snapshot，只有明确确认才调用一次 target change。
- REQ-007：远程目录 IPC 必须同时校验 session purpose 为 Git、profile ownership 匹配且 session 已连接；其他 purpose、其他 profile、已断开或不存在的 session 必须在发送 SFTP control 前拒绝。
- REQ-008：Git session 的新增能力必须只处理 `ListDirectory`；`ReadFile`、`WriteTextFile`、`MutateEntry`、`StartTransfer` 和 Terminal/Network control 必须保持拒绝，现有 Files IPC 不得成为绕过 Git profile ownership 的入口。
- REQ-009：远程 target 尚未连接时，标题栏操作必须保留打开意图并请求既有 Git 认证/重连流程；连接成功后打开选择器，连接失败时保持可重试状态而不创建第二条 Files session。
- REQ-010：弹窗必须具有固定 header/toolbar/footer、唯一目录列表 scroller、`min-height: 0` 收缩链、青色主题滚动条、可见 focus、topmost Escape/focus restore 和 reduced-motion/reduced-transparency 兼容。
- REQ-011：确认远程路径后必须沿用 `WorkspaceProvider.selectGitTarget` 的关闭旧 session、持久化 target、epoch 失效和按既有规则重新连接行为；不得在 dialog、GitPane 或 transport adapter 中复制 Workspace 生命周期。
- REQ-012：现有 Git status、stage/unstage、commit、branch、graph、commit tooltip、文件展开、本机 native picker 和新远程 profile 初次配置行为不得回归。

## Non-Functional Requirements

- NFR-001：目录结果继续受后端现有 5000 entry 上限约束；前端必须对大目录使用有界渲染，避免一次挂载全部行。
- NFR-002：列目录请求必须有前端 request epoch；过期、关闭后的响应不得覆盖当前目录或重新打开已关闭弹窗。
- NFR-003：远程目录路径、sessionId 和 profileId 不得写入日志、错误正文或持久化到 Git target 以外的新位置；目录 API 不返回文件内容。
- NFR-004：不增加 UI、动画、文件树或虚拟列表依赖；沿用现有 React/CSS/Tauri/russh-sftp 能力。

## Observable Acceptance

- AC-001（REQ-001, REQ-002）：Local Git Block 的标题栏出现文件夹按钮并可通过键盘触发 native picker；仓库卡片更多菜单不再包含更换仓库，取消 native picker 不改变 target。
- AC-002（REQ-001, REQ-003, REQ-009）：Remote Git Block 的标题栏文件夹按钮在 connected 时打开以当前路径初始化的弹窗；disconnected 时请求既有重连并在 connected 后打开，不建立 Files session。
- AC-003（REQ-004, REQ-006, NFR-001, NFR-002）：目录浏览测试覆盖初始加载、目录过滤、输入跳转、向上、后退、前进、刷新、键盘 Enter 和过期响应；这些动作不触发 target change。
- AC-004（REQ-005, REQ-006）：列目录失败后路径输入和确认保持可用；取消/Escape 不修改 target，确认任意非空合法草稿只提交一次并关闭弹窗。
- AC-005（REQ-007, REQ-008, NFR-003）：Rust session 测试证明 Git purpose + matching profile + connected session 才能发送 `ListDirectory`，Files/Terminal/Network/错误 profile/断线均拒绝；Git loop 对其他 file/transfer controls 继续拒绝。
- AC-006（REQ-008）：已注册的普通 Files 目录 IPC 无法使用 Git session 绕过 profile ownership；Git 专用 IPC 使用严格 DTO，拒绝未知字段和无效路径。
- AC-007（REQ-010, NFR-004）：样式和组件测试确认只有目录列表滚动，toolbar/footer 固定，长路径省略且可读，focus/ARIA/disabled/loading/error 状态可辨，并包含 reduced-motion 规则。
- AC-008（REQ-011, REQ-012）：确认远程路径通过现有 `selectGitTarget` 触发目标切换和后续重连；既有 GitPane、graph、native dialog、Workspace runtime 与 Rust Git 测试继续通过。

## Behavior Delta

### ADDED

- REQ-003 至 REQ-010：Remote Git Block 新增混合式目录选择弹窗和 Git-purpose 只读目录浏览能力，并为 SFTP 不可用提供手动路径降级。

### MODIFIED

- REQ-001、REQ-002：更换仓库入口由仓库卡片更多菜单改为 Git Block 顶部常驻文件夹操作；本机选择行为本身保持 native picker。
- REQ-011：远程路径从 GitPane 内联表单提交改为 GitBlock 弹窗确认后交给既有 Workspace target 生命周期。

### REMOVED

- REQ-001、REQ-003、REQ-006：移除仓库卡片中的更换仓库菜单项和已绑定远程仓库的全内容区路径编辑表单；首次绑定新远程 profile 的路径配置表单不受影响。

## Architecture Boundary Decision

- Boundary Decision：选择器导航状态属于 `src/git` feature；目标切换和 reconnect intent 属于 `GitBlock`/`WorkspaceProvider`；session purpose/profile ownership 属于 `SshSessionManager`；SFTP channel/listing 属于 SSH infrastructure；Tauri command 只做严格 DTO、边界调用和错误映射。
- Placement：新增 feature-local `GitRepositoryPickerDialog`，不把 picker mode 塞入 `FileBrowserPane`；新增 Git 专用 remote-directory IPC，不让 React 直接调用 Files session connect 或任意 SFTP control。
- Model Separation：Git directory DTO 只表达路径和目录条目；既有 Files `DirectoryListing` domain model可在后端内部复用，但不把 Files UI runtime、GitTarget 或 russh channel 类型混用。
- Tradeoff：本次不抽取通用 DirectoryNavigator，也不新增最近路径 repository；两个消费者的交互需求尚不完全一致，先避免扩大 FileBrowserPane 重构范围。

## Non-Goals

- 不改变选择全新远程 profile 时的首次路径配置流程。
- 不新增递归服务器搜索、树形目录、Finder 多列浏览、SSHFS 挂载或最近路径持久化。
- 不在选择器中执行 Git init、stage、commit 或仓库 mutation。
- 不新增 GitHub/GitLab 托管平台发现、clone、fetch、pull、push 或 origin 管理。
- 不重构无关 Files、Terminal、Network session 或全局 DialogFrame。

## Strict Traceability Seed

- TASK-001（REQ-007, REQ-008, AC-005, AC-006）：建立 Git-purpose/profile-bound 只读目录 control 与严格 IPC，并先补 session ownership/绕过测试。
- TASK-002（REQ-003 至 REQ-006, REQ-010, AC-003, AC-004, AC-007）：实现 feature-local 混合式远程目录选择器、虚拟列表、错误降级和可访问布局，并先补组件/样式测试。
- TASK-003（REQ-001, REQ-002, REQ-009, REQ-011, AC-001, AC-002, AC-008）：把更换仓库编排上移到 GitBlock 标题栏，保留 native picker、重连意图和既有 Workspace target owner，移除 GitPane 旧入口。
- TASK-004（REQ-012, AC-008）：执行 Git/Workspace/Files/Rust 回归和完整门禁，记录证据并按需更新 Directory Map。
- VER-001（AC-005, AC-006）：Rust SSH manager/session/command 聚焦测试，验证 purpose、profile、connected、严格 DTO 和禁止能力扩散。
- VER-002（AC-003, AC-004, AC-007）：Testing Library 与样式契约测试，验证导航、request epoch、fallback、确认/取消、scroll owner、ARIA 和 reduced motion。
- VER-003（AC-001, AC-002, AC-008）：LayoutView/GitPane/Workspace 测试，验证标题栏位置、native/remote 分流、reconnect intent、单次 target commit 与旧入口移除。
- VER-004（AC-001 至 AC-008）：`pnpm check`、Rust fmt/clippy/tests、native-dialog audit 和 `git diff --check`。

## Risks And Rollback

- 风险：若 `files_list_remote` 仍可接受 Git sessionId，Git 专用 profile 校验可能被绕过；实现必须在 manager façade 先按 purpose 拒绝通用入口。
- 风险：远端 Git exec 可用但 SFTP subsystem 被禁用；这不是阻塞错误，必须保留手动输入降级。
- 风险：连接与 dialog intent 竞态可能在用户切换 target 后打开错误弹窗；intent 必须绑定当前 block/target profile 并在 target 变化时失效。
- 风险：大目录一次挂载过多按钮会阻塞 WebView；虚拟范围与后端上限是阻断性验收。
- Rollback：可垂直移除 Git directory IPC、Git session ListDirectory handler、picker 与 header action，并恢复 GitPane 旧表单；Workspace schema、Git domain action 和既有仓库数据无需回滚。

## Quality Check

- REQ-001 至 REQ-012 均由 AC-001 至 AC-008 覆盖；Behavior Delta 明确新增浏览能力、入口迁移和旧 UI 移除。
- 主路径、断线重连、SFTP 不可用、无效/不可浏览路径、取消、过期响应、purpose/profile 越权、大目录和兼容行为均有可观察验收。
- strict tier 的 architecture、critical behavior、rollback、compatibility 和 TASK/VER seed 均已建立；无阻塞产品语义缺口。

## Verification Evidence

- VER-001 / AC-005、AC-006：`cargo test git_directory_listing_requires_a_connected_git_session_owned_by_the_profile --lib` 与 `cargo test git_inputs_reject_arbitrary_process_fields --lib` 通过。测试证明 Git purpose、匹配 profile、connected state 才能入队 `ListDirectory`，普通 listing façade 和 Files/Terminal/Network purpose 均不能绕过；严格 command DTO 拒绝未知能力字段。
- VER-002 / AC-003、AC-004、AC-007：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/git/gitStyles.test.ts` 通过；同一最终工作树上的扩展聚焦集 `GitRepositoryPickerDialog/GitPane/gitStyles/LayoutView` 共 77 项通过。覆盖导航/history、刷新、SFTP fallback、request epoch、有界渲染、确认/取消、单一滚动 owner、ARIA 与 reduced motion。
- VER-003 / AC-001、AC-002、AC-008：`LayoutView.test.tsx` 和 `GitPane.test.tsx` 共 59 项通过，验证顶部文件夹入口顺序、本机 native picker、远程 connected picker、断线重连意图、单次 target commit、旧菜单移除和既有 Git 内容行为。
- VER-004 / AC-001 至 AC-008：`pnpm check` 通过（66 个测试文件、595 项测试、ESLint、TypeScript、Vite production build）；`cargo fmt --check` 和 `cargo clippy --all-targets --all-features -- -D warnings` 通过；native dialog 非阻塞审计测试通过；`git diff --check` 通过。
- Rust 全量门禁发现一个不属于本次差异的既有失败：macOS 下 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning` 期望 `C:/absolute.txt` 被识别为绝对路径，但现有 `Path::is_absolute` 遵循当前平台语义。`src-tauri/src/domain/git.rs` 与 `HEAD` 一致；跳过该单一基线用例后 `cargo test --all-targets --all-features` 为 245 passed、0 failed、4 ignored。

## Completion

- AC-001 至 AC-008 均有直接自动化证据；没有未覆盖或阻塞的本次 acceptance。
- `docs/qb-spec/DIRECTORY_MAP.md` 已同步 `GitRepositoryPickerDialog`、Git directory IPC、purpose/profile ownership 和 Git-purpose 只读 SFTP 边界。
- 实现保留既有 Workspace target/session owner，没有引入 Files session、文件内容能力、第三方 UI/虚拟列表依赖或持久化 schema。
- Close：验证完成并于 2026-08-31 无冲突归档。

## Residual Risk

- 当前环境未执行真实远端“Git exec 可用但 SFTP subsystem 被禁用”的桌面 smoke；组件测试已模拟 `DirectoryUnavailable` 并证明手动路径仍可确认。
- 仓库既有 Windows 绝对路径跨平台测试仍失败，已准确隔离且与本次文件差异无关；最小复验命令为 `cd src-tauri && cargo test domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning --lib`。

## Open Issues

- 无阻塞项。最近路径、仓库预探测和首次绑定远程 profile 的可视浏览可在本次稳定后独立评估。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Findings：目标、兼容范围、SFTP 降级、session/profile ownership、普通 Files IPC 绕过、大目录、竞态与回滚边界均明确；没有需要用户再次决定的产品语义。
- Traceability：REQ-001 至 REQ-012 均由 AC-001 至 AC-008 覆盖；Behavior Delta 的新增、入口迁移和旧 UI 移除均回连稳定 requirement；TASK-001 至 TASK-004 与 VER-001 至 VER-004 满足 strict tier。
- Non-blocking note：本轮不增加仓库预探测或最近路径持久化；确认后的既有 Git snapshot/initialize 状态继续负责判断目录是否为仓库。
- Next Action：进入 strict planning。

## Next Action

本 change 已完成实现、验证与归档；最近路径、仓库预探测或首次 remote profile 可视浏览应作为独立 change 评估。
