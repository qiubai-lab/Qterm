---
id: QB-20260831-git-branch-merge
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 分支安全合并实施计划

## Background

现有 Git Block 已具备完整 local/remote ref、冲突文件识别、stage/unstage、提交、分支管理、安全同步、仅内存操作记录，以及本机/SSH 封闭 action 通路；但 snapshot 不表达 merge state，adapters 没有 merge/continue/abort，GitPane 也不能在冲突后恢复闭环。

## Requirement

- 本计划执行 `QB-20260831-git-branch-merge` 的 REQ-001 至 REQ-010。
- 固定方向为所选完整 source ref 合并进当前本地分支。
- 合并开始前后端要求完全干净工作区、正常 local HEAD、无进行中 merge；不自动 Fetch/Stash，不开放策略与 force 输入。
- 冲突进入 snapshot 权威的 `mergeInProgress` 状态；解决并暂存后继续，明确确认后中止。

## Non-Goals

- 不实现 rebase、squash、no-ff/ff-only picker、strategy、自动 stash/fetch、三方编辑器或通用 Git command API。
- 不重构整个 GitPane 或建立全局 operation framework。
- 不改变 Workspace schema、persistence、依赖清单、SSH session 生命周期或 Git credential 管理。

## Fixed Semantics

- Merge source 只能是当前 snapshot 中存在且非当前的 `refs/heads/*` 或 `refs/remotes/*`。
- Local/SSH adapters 在运行固定 merge 命令前各自基于 snapshot 执行同一领域前置校验，避免 WebView 绕过和远程竞态。
- 固定命令使用 Git 默认 merge 策略与非交互 editor 环境；成功后返回 snapshot。命令非零但仓库真实进入 MERGE_HEAD 状态时返回冲突后的 snapshot，由 UI 记录 attention；其他失败保持 error。
- `mergeInProgress` 由固定只读 Git 查询派生，不持久化。continue 固定使用非交互 `git merge --continue`；abort 固定使用 `git merge --abort`，不执行 reset fallback。
- Merge 期间只保留 snapshot、stage/unstage、冲突查看、continue 和 abort；branch switch/management、fetch、pull、push、sync、普通 commit 和新 merge 均禁用。
- Operation log 增加 `attention`，只表达“仓库等待用户解决冲突”，不改变 20 条、有界、脱敏、target 变化清空规则。

## Architecture Impact

- Domain：`GitSnapshot` 增加 `merge_in_progress`；`RemoteGitAction` 增加 MergeBranch/ContinueMerge/AbortMerge；增加基于 snapshot 和完整 source ref 的纯前置校验函数。
- Ports/Application：`GitExecutor` 与 `GitService` 增加三个封闭用例；application 继续负责输入 ref 校验，不接收命令或策略。
- Local adapter：固定 MERGE_HEAD 查询、merge/continue/abort 命令、冲突后 snapshot 恢复和真实仓库生命周期测试。
- SSH adapter：同等 action、固定 POSIX-safe 命令与 merge state 查询；复用现有 Git-purpose session、timeout 和 output bounds。
- Commands/Transport：增加 deny-unknown-fields input/action variants 与 `mergeInProgress` DTO；无 command/args/URL/credential 字段。
- Frontend：仓库操作菜单增加 merge picker/confirmation；更改区增加 merge state bar 和 abort confirmation；operation record 增加 attention。

## Domain Model Impact

- `GitSnapshot.merge_in_progress: bool` 表达仓库是否存在可继续/中止的 merge，不表达 UI 临时状态。
- `validate_merge_source(snapshot, source_ref)` 集中保证 local HEAD、clean worktree、无进行中 merge、source 存在且不是 current ref。
- Continue/abort 的可执行性由真实 merge state 和 conflict changes决定；adapters 在 mutation 前再次读取 snapshot 以防竞态。

## API Impact

- 本机新增窄 Tauri commands：`git_merge_branch`、`git_continue_merge`、`git_abort_merge`。
- Remote `GitRemoteActionDto` / TypeScript `RemoteGitAction` 增加 `mergeBranch { repository, sourceRef }`、`continueMerge { repository }`、`abortMerge { repository }`。
- `GitSnapshotDto` / TypeScript `GitSnapshot` 增加非可选 `mergeInProgress: boolean`。
- 该 IPC 是内部桌面契约；所有 Rust/TS 映射与测试在同一 change 原子更新。

## Database Impact

- 无。merge state 来自 `.git` 真实元数据，不进入 Workspace、settings 或任何 JSON repository。

## Affected Files

- `src-tauri/src/domain/git.rs`
- `src-tauri/src/ports/git_executor.rs`
- `src-tauri/src/application/git_service.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/infrastructure/ssh/client/tests.rs`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/git.ts`
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Implementation Tasks

- [x] TASK-001 [P0] [REQ-001 至 REQ-006, REQ-009, AC-001 至 AC-004, AC-007] 先新增 domain 与真实本地 Git 失败测试，覆盖 source/HEAD/dirty/in-progress 前置条件、already-up-to-date、fast-forward、merge commit、冲突 snapshot、重新 snapshot、continue gating 和 abort 恢复。
- [x] TASK-002 [P0] [depends: TASK-001] [REQ-001 至 REQ-006, REQ-009, AC-001 至 AC-004, AC-007] 实现 domain snapshot state、ports/application、本机固定 merge/continue/abort、冲突后 snapshot 恢复与错误边界，使 TASK-001 转绿。
- [x] TASK-003 [P0] [depends: TASK-002] [REQ-005, REQ-009, REQ-010, AC-003, AC-004, AC-007, AC-008] 扩展 strict Tauri DTO、command registration、TypeScript contract 和 SSH action/adapter/session ownership 测试与实现，保持 local/remote 等价及无任意命令输入。
- [x] TASK-004 [P0] [REQ-007, REQ-008, REQ-010, AC-005, AC-006, AC-008] 先新增 GitPane 与 style 失败测试，覆盖 merge 菜单、source 分组/方向、dirty gating、attention、状态恢复、continue、abort confirmation、操作禁用、focus/Escape 与主题布局。
- [x] TASK-005 [P0] [depends: TASK-003, TASK-004] [REQ-007, REQ-008, REQ-010, AC-005, AC-006, AC-008] 实现 GitPane merge picker、状态条、continue/abort 编排、attention operation record 与 semantic theme styles，使 TASK-004 转绿并保持现有分支/同步/图表行为。
- [x] TASK-006 [P0] [depends: TASK-001 至 TASK-005] [REQ-001 至 REQ-010, AC-001 至 AC-008] 更新 Directory Map，执行聚焦到完整验证、固定命令/安全输入审计和 diff 检查；将证据写回 spec/plan 后由 completion workflow 冲突安全归档。

## Dependencies And Parallel Work

- TASK-001/002 建立 snapshot 与 action contract，TASK-003 和 TASK-005 依赖该契约，不并行修改共享模型。
- TASK-004 的前端测试结构可在后端实现期间独立形成，但当前执行不使用多 Agent；避免与 GitPane 现有未提交修改产生并发冲突。
- 无新增外部依赖、服务或用户凭据要求。真实 SSH smoke 仅作为环境允许时的补充，不阻塞可重复的 local/unit coverage。

## Acceptance To Verification

- VER-001 [AC-001]：`cargo test domain::git::tests` 与 merge precondition 聚焦测试，证明合法 source 和所有拒绝路径不修改仓库。
- VER-002 [AC-002, AC-003, AC-004]：`cargo test infrastructure::git_cli::tests` 的真实临时仓库 lifecycle，覆盖 up-to-date、FF、merge commit、conflict、refresh recovery、continue、abort 和 HEAD/父节点结果。
- VER-003 [AC-003, AC-004, AC-007]：commands/SSH Git action/session tests，断言 `mergeInProgress` 映射、deny-unknown-fields、固定 action、POSIX literal、ownership 和无 command/args/strategy/force/URL 输入。
- VER-004 [AC-005, AC-006]：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts`，覆盖用户流程、attention、确认/禁用、滚动/焦点/键盘和主题状态。
- VER-005 [AC-008]：`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` 与 `git diff --check`。
- VER-006 [AC-007, AC-008]：静态审计新增 DTO/action 不含 command/args/strategy/force/remote URL/credential，merge 不含自动 fetch/stash/reset fallback，依赖与 Workspace/persistence schema 未变化。

## Test Plan

1. Red backend：先让 domain/real-Git lifecycle 测试因缺少 merge state/actions 失败。
2. Green local：按 domain → port/application → local adapter 顺序实现，运行 VER-001/VER-002。
3. Green remote/transport：补 strict DTO 与 SSH adapter，运行 VER-003。
4. Red frontend：新增 observable behavior 和 style contract 测试，确认 merge UI/state 尚不存在。
5. Green frontend：实现 picker、state bar、continue/abort/attention，运行 VER-004。
6. Broad：便宜到昂贵执行 VER-005/VER-006；失败只修本 change 引入的问题并准确报告基线。

## Rollback Plan

- 未发布前可整体移除新增 actions、snapshot field、commands 与 UI；无数据/schema migration。
- 如果前端需要临时回滚，先确保测试仓库不存在 merge 进行中，再移除入口；不自动 reset 用户仓库。
- 已完成 merge 是用户显式 Git 结果，不自动回滚；未完成 merge 通过固定 abort 或用户终端处理。

## Risks

- Git merge 冲突命令返回非零但仓库已合法进入 merge state；adapter 必须检查真实 MERGE_HEAD 后再决定 snapshot attention 或 error。
- SSH 在 mutation 后断线可能无法立即确认结果；UI 保留 stale snapshot，重连后 snapshot 恢复，不猜测成功或自动重试 mutation。
- 外部终端可能在 UI 打开期间改变 merge 状态；所有按钮状态从最新 snapshot 派生，mutation 前后端再次校验。
- Abort 可能丢弃冲突解决编辑；必须确认且不得用 reset fallback 扩大影响。

## UI Style Context

- 复用 Qterm compact workbench 规范与已有 Git popover：核心动作常驻、semantic surface/text/accent/danger tokens、方向和状态有文字/图标、可见 focus、Escape 和焦点恢复。
- Merge 状态条位于更改区的稳定位置，不用大面积 accent 选中样式；attention 使用 caution 语义，abort 使用 danger 但不在确认前填充为主操作。
- 浮层只有来源列表/表单拥有滚动；所有 shrink ancestors 保持 `min-width/min-height: 0`；支持 reduced motion/transparency 和短窗口。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 中 GitPane、TypeScript IPC、domain/application、commands、local adapter 与 SSH adapter 的 merge capability/non-goal 边界。
- 验证后把 VER 证据回写 spec/plan；普通 conflict-free completion 由验证流程归档。

## Trigger Signals

- Architecture boundary：已触发；domain/snapshot/adapter/command/UI ownership 固定如上，不进行无关重构。
- Critical behavior：已触发；TASK-001 与 TASK-004 先测试后实现。
- Directory Map：新增公开 feature capability、snapshot field 和 adapter action，TASK-006 必须更新。

## Independent Review

- Result：spec `PASS WITH NOTES`，可执行 strict plan。
- Resolution：外部终端改变 merge state 的 note 已通过 snapshot-derived state、mutation 前后端复核与 VER-003/VER-004 固化。

## Next Action

本 change 已完成实现与 strict 验收，进入 conflict-free 自动归档；后续 rebase、squash、策略选择或三方冲突编辑器必须建立独立 change。

## Verification Result

- VER-001：`cargo test merge --no-default-features` 3 passed；domain 覆盖 local/remote 完整 ref、dirty、detached、unborn、self、missing 与 merge-in-progress 拒绝，真实仓库覆盖拒绝后 HEAD 不变。
- VER-002：同一真实 Git lifecycle 覆盖 already-up-to-date、fast-forward、双亲 merge commit、冲突后的 `MERGE_HEAD`/snapshot 恢复、未解决 continue 拒绝、resolution continue 与 abort 恢复。
- VER-003：`cargo test commands::git::tests --no-default-features` 4 passed，Git-purpose SSH ownership 聚焦测试 1 passed；strict DTO/action 拒绝 unknown command/args/strategy/force 输入，local/SSH 复用同一 domain 校验与封闭 action。
- VER-004：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts` 54 passed；覆盖 local/remote source、方向确认、dirty gating、attention、状态条、continue、abort confirmation、Escape/focus、操作禁用与 semantic style。
- VER-005：`pnpm check` 通过（68 files、629 tests、ESLint、TypeScript 与 Vite build）；Rust fmt 与 clippy 通过；Rust 全量为 263 passed、4 ignored、1 个既有 macOS/Windows 路径断言失败，`HEAD` 与当前文件中的失败断言相同且不在本 change diff；`git diff --check` 通过。
- VER-006：新增 diff 静态审计确认无通用 command/args、merge strategy/force、remote URL/credential 输入，无自动 fetch/stash/reset fallback，无 dependency、Workspace schema 或 persistence 变化。
- Acceptance Coverage：AC-001 至 AC-007 已直接验证；AC-008 的本 change 回归、构建、格式、clippy、diff 与静态边界已验证，Rust 全量仅保留上述可复现既有基线失败。
- Documentation：Directory Map 已同步 GitPane、TypeScript IPC、domain/application、commands、本机与 SSH adapters 的安全 merge owner 与禁止边界；长期 context 未自动提升，本次产品语义保留在归档 change 中。
- Residual Risk：真实 OpenSSH Git lifecycle 仍是环境性 ignored smoke；本次以真实本地 Git 全生命周期、SSH 固定 action/POSIX literal 与 session ownership 自动化覆盖。第三方 merge driver 与平台特定文件系统冲突仍属已声明 gap。
