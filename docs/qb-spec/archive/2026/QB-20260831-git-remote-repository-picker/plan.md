---
id: QB-20260831-git-remote-repository-picker
type: design
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 远程仓库混合式目录选择器实施计划

## Background

现有 Remote Git Block 已拥有独立、profile-bound 的 Git-purpose SSH session，但更换远程仓库只能在 GitPane 内输入路径。此次将入口上移到 Block 标题栏，并在不建立第二条 Files session 的前提下，为当前 Git session 开放严格受限的目录 listing，用 feature-local 弹窗提供浏览与手动输入并存的选择体验。

## Requirement

- 以同 ID spec 的 REQ-001 至 REQ-012、NFR-001 至 NFR-004 和 AC-001 至 AC-008 为事实源。
- 目录浏览是增强能力；SFTP 不可用时手动路径必须仍可提交。
- 只有确认动作改变 target；浏览、取消和错误恢复不得影响当前 Git session/snapshot。

## Non-Goals

- 不改变首次选择全新 remote profile 时的路径配置流程。
- 不增加仓库预探测、最近路径持久化、递归搜索、目录树、SSHFS 或完整 FileBrowser picker mode。
- 不增加任何文件读取、写入、mutation、transfer 或 Git 仓库 mutation 能力。
- 不改变 Workspace schema、Git action union、Git snapshot 数据或本机 native dialog bridge。

## Architecture Impact

- Frontend feature：新增 `GitRepositoryPickerDialog`，拥有路径草稿、目录 navigation/history、request epoch、虚拟范围和可见状态；不拥有 Workspace target 或 SSH lifecycle。
- Workspace composition：`GitBlock` 拥有标题栏入口、本机/远程分流、断线后的 open intent，以及确认后调用 `selectGitTarget` 的编排；`GitPane` 只请求上层更换仓库，不再编辑 target。
- Transport：`src/lib/tauri/git.ts` 增加目录-only DTO 和 `git_remote_list_directory` IPC wrapper；不复用 Files runtime 或 connect API。
- Session façade：`SshSessionManager` 增加 Git purpose + profile + connected 校验的 listing 方法，并让普通 listing façade 明确拒绝 Git purpose，避免 `files_list_remote` 绕过 ownership。
- SSH infrastructure：Git-purpose run loop 只为 `ListDirectory` 打开 SFTP subsystem；其他 file/transfer control 继续拒绝。
- Tauri command：Git command 负责严格 DTO、RemotePath 校验、目录-only DTO 映射和稳定错误；不实现 SFTP 或路径业务。

## Domain Model Impact

- 不修改 Git domain、GitTarget union 或 Workspace schema。
- 后端内部复用现有 `domain::files::DirectoryListing` 与 `domain::transfer::RemotePath`；前端新增的 Git directory DTO 只包含 path、name 和 symlink 元数据，不暴露文件内容或 mutation 输入。

## API Impact

- 新增内部 Tauri command `git_remote_list_directory`：输入 `sessionId/profileId/path`，输出当前规范路径和目录条目。
- command 输入启用 `deny_unknown_fields`；manager 必须在 control 入队前校验 purpose/profile/state。
- 现有 `files_list_remote` 输入输出保持兼容，但 manager 层明确拒绝 Git-purpose session。

## Database Impact

- 无 schema、repository 或 migration 变化。
- 不增加最近路径持久化；只有现有 GitTarget 在用户确认后保存路径。

## Affected Files

- `src/git/GitRepositoryPickerDialog.tsx`（新增）
- `src/git/GitRepositoryPickerDialog.test.tsx`（新增）
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/lib/tauri/git.ts`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/infrastructure/ssh/client.rs`
- `src-tauri/src/infrastructure/ssh/client/session.rs`
- `src-tauri/src/infrastructure/ssh/client/tests.rs`
- `src-tauri/src/lib.rs`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Implementation Tasks

- [x] TASK-001 [REQ-007, REQ-008, AC-005, AC-006] 先在 SSH manager 测试中建立失败保护：错误 purpose/profile/state 不发送 `ListDirectory`，匹配 Git owner 才发送；普通 listing façade 拒绝 Git session。
- [x] TASK-002 [depends: TASK-001] [REQ-007, REQ-008, AC-005, AC-006] 实现 Git 专用 listing façade、Git run-loop SFTP handler、严格 Tauri DTO/错误映射、前端 transport wrapper 与 command 注册；保持其他 controls 拒绝。
- [x] TASK-003 [REQ-003 至 REQ-006, REQ-010, AC-003, AC-004, AC-007] 先新增 picker 组件失败测试和样式契约，覆盖初始加载、目录过滤、导航/history、刷新、输入 fallback、request epoch、确认/取消、ARIA、scroll owner 和 reduced motion。
- [x] TASK-004 [depends: TASK-002, TASK-003] [REQ-003 至 REQ-006, REQ-010, NFR-001 至 NFR-004, AC-003, AC-004, AC-007] 实现 feature-local picker、目录-only 有界虚拟渲染、固定 toolbar/list/footer 布局和 SFTP 失败降级。
- [x] TASK-005 [depends: TASK-004] [REQ-001, REQ-002, REQ-009, REQ-011, AC-001, AC-002, AC-008] 先更新 LayoutView/GitPane 行为测试，再把入口和 target lifecycle 上移到 GitBlock：本机 native picker、远程 connected 弹窗、disconnected reconnect intent、确认后单次 `selectGitTarget`。
- [x] TASK-006 [depends: TASK-005] [REQ-001, REQ-003, REQ-006, REQ-012, AC-001, AC-008] 删除 GitPane repository “more”入口、已绑定远程 target 编辑状态和内联表单；保留首次 remote profile 配置、branch/create overlays 及全部 Git 内容行为。
- [x] TASK-007 [depends: TASK-001 至 TASK-006] [REQ-001 至 REQ-012, AC-001 至 AC-008] 更新 Directory Map，执行 strict 验证、记录证据并完成普通 conflict-free 归档。

## Dependencies And Parallel Work

- TASK-002 依赖 TASK-001 的 session ownership 保护；不能先开放 Git loop listing 再补越权测试。
- TASK-004 依赖 transport contract，但 picker 的纯 UI 测试可先用 mock 并与 Rust 测试顺序执行。
- TASK-005/006 共享 `GitPane.tsx`、`LayoutView.tsx` 与现有图表改动，必须顺序编辑以避免覆盖。
- 不引入外部依赖或新 session；SFTP availability 由当前远端服务器决定。

## Acceptance To Verification

- VER-001 [AC-005, AC-006]：`cargo test infrastructure::ssh::client::tests --lib` 加 Git directory owner/control 测试；Git command DTO 测试覆盖 unknown fields/invalid path；静态断言普通 listing façade 拒绝 Git purpose。
- VER-002 [AC-003, AC-004, AC-007]：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/git/gitStyles.test.ts`，覆盖 picker navigation、fallback、epoch、virtualization、confirm/cancel、ARIA 和 CSS scrolling/motion contract。
- VER-003 [AC-001, AC-002, AC-008]：`pnpm vitest run src/workspace/LayoutView.test.tsx src/git/GitPane.test.tsx`，覆盖 header action、native/remote 分流、reconnect intent、target commit、旧入口移除和既有 Git 行为。
- VER-004 [AC-001 至 AC-008]：`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、native dialog blocking audit 和 `git diff --check`。

## Test Plan

1. Red：先写 manager purpose/profile/state 与 Files bypass 测试；确认新 API 尚未实现时失败。
2. Red：先写 picker 与 LayoutView/GitPane 可观察行为测试；不使用完整 FileBrowser mocks 掩盖 target ownership。
3. Focused backend：实现后运行 SSH client 与 Git command 聚焦 Rust 测试。
4. Focused frontend：运行 picker、LayoutView、GitPane 和 gitStyles 聚焦 Vitest。
5. Broad：按 VER-004 从前端完整门禁到 Rust fmt/clippy/tests，再执行 native dialog audit 与 diff hygiene。

## Rollback Plan

- 移除 `git_remote_list_directory` command、前端 wrapper、manager Git listing façade和 Git run-loop `ListDirectory` handler。
- 移除 picker/header action，恢复 GitPane 内联远程路径表单和 repository menu item。
- Workspace schema、GitTarget、Git actions、repository 数据与 native local picker没有迁移，因此回滚不需数据转换。
- 若仅 SFTP 浏览在部分服务器不稳定，可临时保留标题栏入口和手动路径 dialog，关闭目录 listing，不影响 Git exec 能力。

## Risks

- 普通 Files command 通过 Git sessionId 绕过 profile ownership：TASK-001/002 必须在 manager 入队前分离 generic 与 Git listing。
- 用户切换 target/profile 后旧 reconnect intent 打开错误 dialog：intent 绑定当前 target profile，并在 target/profile/组件卸载时失效。
- SFTP unsupported 与连接断开混淆：UI统一保留输入，但反馈文本和 reconnect 行为必须区分当前 session status。
- 大目录渲染阻塞：后端沿用 5000 上限，前端只挂载 viewport + overscan 范围。
- 当前 Git graph/tooltip/files 行为已有大量回归保护；GitPane 清理必须保持其 DOM 和 state owner 不变。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`：记录 `GitRepositoryPickerDialog`、Git directory IPC 和 Git-purpose read-only SFTP listing boundary。
- 验证证据写回 spec/plan；由 strict completion 在验证通过且归档无冲突时归档。

## Architecture Boundary Check

- Boundary Decision：Git dialog 只持有浏览草稿；GitBlock/WorkspaceProvider 仍是 target/session 编排 owner；SshSessionManager 负责 capability/ownership；SSH client session runner 负责 SFTP channel；command 只做 DTO 和映射。
- Placement：feature-local picker 放在 `src/git`，不新增全局 universal picker，不让 `GitPane` 或 React 直接 connect Files session。
- Model Separation：Git directory transport DTO、domain Files listing、Workspace GitTarget 和 runtime session metadata保持独立。
- Tradeoff：不抽取 FileBrowser 的完整导航状态；当前两个场景的 selection、mutation 和 preview 语义不同，局部重复比 picker mode 条件扩散风险更低。

## Critical Behavior Protection

- Coverage Decision：session purpose/profile ownership、Files IPC bypass、过期异步响应和确认前 target 不变均是高价值回归边界，必须先建立自动化保护。
- Initial Tests：VER-001 覆盖后端授权/能力边界，VER-002 覆盖 picker 状态机，VER-003 覆盖 target owner 和 reconnect 编排。
- Gaps：真实服务器是否支持 SFTP 依赖环境；自动化通过模拟 `DirectoryUnavailable` 验证手动输入降级，真实 POSIX SSH/SFTP smoke 作为环境性补充而非完成阻塞项。

## Style Context

- 采用项目 `qterm-ui-spec.md`：核心 action 常驻 Block header；单一选择使用标准居中 DialogFrame；固定 header/toolbar/footer；只有 list scroll；mint/cyberpunk scrollbar；路径 monospace；focus/ARIA/reduced-* 完整。
- 沿用现有 `Icon name="files"`、Button/Dialog tokens 和短 opacity/transform 动画，不新增局部色彩系统。

## Trigger Signals

- Architecture boundary：已触发并通过，TASK-002、TASK-005 必须遵守上述 placement。
- Critical behavior：已触发，TASK-001 与 TASK-003 先测试后实现。
- Directory Map：新增 feature component 与 IPC/session capability，TASK-007 必须更新。

## Verification Result

- VER-001：Git directory session ownership 与严格 DTO 聚焦 Rust 测试通过；错误 profile、Files/Terminal/Network purpose、generic listing 绕过和 disconnected state 均在 control 入队前拒绝。
- VER-002：picker/style 聚焦测试通过；最终相关前端集合 4 个文件、77 项测试通过。
- VER-003：LayoutView/GitPane 2 个文件、59 项测试通过。
- VER-004：`pnpm check`、Rust fmt、Rust clippy、native dialog 审计和 `git diff --check` 通过。Rust 全量测试只有未修改基线文件中的 Windows 绝对路径跨平台断言失败；跳过该单一用例后 245 passed、0 failed、4 ignored。
- Documentation：Directory Map 已更新；spec 保存完整验收证据和残余风险。
- Completion：TASK-001 至 TASK-007 完成，change 于 2026-08-31 无冲突归档。

## Next Action

无需后续实施动作；如需修复既有 Windows 绝对路径跨平台校验或扩展首次 remote profile 浏览，应建立独立 change。
