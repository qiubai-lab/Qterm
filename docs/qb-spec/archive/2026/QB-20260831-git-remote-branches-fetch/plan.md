---
id: QB-20260831-git-remote-branches-fetch
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 远程分支与主动获取实施计划

## Background

现有 Git Block 已有本机/SSH snapshot、固定 mutation action、profile/session ownership、紧凑分支弹层和请求 epoch，但 branch snapshot 只读取 `refs/heads/`，刷新也只是 snapshot。此次扩展现有 Git domain/port，而不建立第二套 remote 生命周期：手动刷新固定执行 fetch-all/prune 后返回 snapshot；自动刷新继续只读；分支弹层用稳定 ref identity 分组，并提供安全的 remote tracking checkout。

## Requirement

- 同 ID spec 的 REQ-001 至 REQ-007、NFR-001 至 NFR-004 和 AC-001 至 AC-006 是实现与验收事实源。
- “远程仓库 target”与“Git 远程跟踪分支”是两个独立维度：本机和 SSH target 内部都可拥有 local/remote refs。
- fetch、track remote branch 都是封闭 Git action；WebView 不能提供命令、参数数组、remote URL 或凭据。
- 用户批准的 remote row 语义是：复用已有 upstream-matching local branch，否则由 Git 创建 tracking branch；任何冲突安全失败。

## Non-Goals

- 不实现 pull/push/merge/rebase、remote CRUD、后台 fetch、逐 remote 选择、进度/取消、远程分支删除或 detached checkout。
- 不改变 Workspace schema、Git repository history、ConnectionProfile、SSH session ownership 或凭据存储。
- 不增加第三方依赖、通用 shell/command IPC、第二条 SSH session 或远程缓存。

## Architecture Impact

- Domain：`GitBranchKind`、完整 `ref_name`/`upstream_ref` 和纯 matching rule 是稳定语义；`RemoteGitAction` 增加封闭 `Fetch`/`TrackRemoteBranch`。
- Application/ports：本机 `GitService` 暴露 fetch 和 track remote branch；`GitExecutor` 定义对应 capability。profile-bound remote 继续通过 `RemoteGitExecutor` 的封闭 action 进入既有 Git-purpose session。
- Infrastructure：本机和 SSH adapter 共用 branch parser/model，固定查询 heads/remotes 并过滤 symref；各自执行固定 fetch 和 track 命令，复用 domain matching rule，命令失败仍走稳定 GitError。
- Commands/IPC：新增本机 fetch/track commands，扩展 remote tagged action 和 branch DTO；只做严格输入与显式 model 映射。
- Frontend：`GitPane` 分离 snapshot-only 与 manual fetch intent，保留 snapshot on fetch failure；单一 listbox 内按 kind 分组，remote row 触发 track action。

## Domain Model Impact

- `GitBranch` 增加 `ref_name`、`kind` 和 `upstream_ref`；`name` 保持用于紧凑显示，`upstream` 保持短名称兼容搜索与既有语义。
- branch parser 读取 full ref、short ref、OID、HEAD、short/full upstream 和 symref；只接受 `refs/heads/` 与 `refs/remotes/`，过滤非空 symref。
- tracking lookup 只匹配 `kind=Local && upstream_ref == requested remote ref_name`；不存在时只允许 snapshot 中确实存在的 remote ref 进入 `git switch --track <short-remote-name>`。
- React key、action identity 和 local/remote collision 都使用 `refName`，不使用 display `name`。

## API Impact

- TypeScript `GitBranch` 增加 `refName`、`kind`、`upstreamRef`。
- 本机 IPC 增加 `git_fetch`、`git_track_remote_branch`；输入只含 repository/refName。
- remote tagged union 增加 `{ type: "fetch", repository }` 与 `{ type: "trackRemoteBranch", repository, refName }`。
- `GitSnapshot` 其余字段和现有 action 保持兼容；branch DTO 新字段由 Rust 显式映射。

## Database Impact

- 无持久化、schema 或迁移影响。fetch 只更新 Git 自身标准 remote-tracking refs；Qterm 不保存 branch snapshot。

## Affected Files

- `src/lib/tauri/git.ts`
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `src-tauri/src/domain/git.rs`
- `src-tauri/src/ports/git_executor.rs`
- `src-tauri/src/application/git_service.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/infrastructure/ssh/client/tests.rs`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-005, AC-001, AC-005] 先更新 Rust parser/domain 与前端 typed fixtures 的失败测试，覆盖 local/remote kind、full ref、upstream ref、symref 过滤、同名 identity 和 matching existing tracking local branch。
- [x] TASK-002 [depends: TASK-001] [REQ-002, REQ-006, AC-002, AC-005] 先建立临时 bare remote 的 fetch/add/prune 集成测试和 SSH action/session allowlist 测试，再实现 domain actions、GitExecutor/GitService、本机/SSH adapter 固定 fetch 与 track remote branch。
- [x] TASK-003 [depends: TASK-001, TASK-002] [REQ-002, REQ-003, REQ-006, AC-003] 先更新 GitPane 测试，证明 mount/focus snapshot-only、manual local/SSH fetch、失败保留 snapshot、busy 竞态保护和 repository history 不重复，再实现 commands/TypeScript IPC 与分离的 refresh intent。
- [x] TASK-004 [depends: TASK-001, TASK-003] [REQ-004, NFR-003, AC-004, AC-005] 先更新 GitPane/style 测试，覆盖双分组/计数、搜索/空组、文本 kind、remote row action、稳定 ref key、自然元数据和单一 scroller，再实现紧凑 UI/CSS。
- [x] TASK-005 [depends: TASK-001 至 TASK-004] [REQ-007, AC-006] 更新 Directory Map，执行聚焦与完整门禁、固定命令/IPC 审计和 diff hygiene，回写 evidence 并完成无冲突归档。

## Dependencies And Parallel Work

- TASK-002 依赖 TASK-001 的 ref/upstream identity，否则 tracking reuse 会退化为字符串猜测。
- commands/TypeScript IPC 必须在 Rust action/model稳定后同步修改，避免前后端 branch fixture 短暂遗漏必填字段。
- TASK-003 和 TASK-004 都修改 `GitPane`/tests，按顺序执行以保留现有未提交 UI 基线并减少冲突。
- 不引入外部服务或依赖；真实 remote fixture 使用本机临时 bare repository，SSH smoke 沿用现有 ignored OpenSSH harness。

## Acceptance To Verification

- VER-001 [AC-001]：`cargo test domain::git --lib`、`cargo test infrastructure::git_cli --lib`、`cargo test commands::git --lib`，并运行 TypeScript Git contract/fixture compilation。
- VER-002 [AC-002, AC-005]：`cargo test infrastructure::git_cli::tests --lib`、`cargo test infrastructure::ssh::client::tests::git_actions_require_a_connected_git_purpose_session_owned_by_the_profile --lib`；可用环境下运行扩展后的 ignored OpenSSH Git smoke。
- VER-003 [AC-003, AC-004, AC-005]：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts`。
- VER-004 [AC-001 至 AC-006]：`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、`rg` 固定命令/任意参数/旧 branch query 审计和 `git diff --check`。

## Test Plan

1. Red：parser/domain tests 先引用新 kind/ref 字段并覆盖 symref/matching，确认旧模型失败。
2. Red：临时 bare remote test 先调用 fetch 并断言 add/prune，确认旧 port 无此能力。
3. Red：GitPane tests 先断言手动 fetch 与自动 snapshot intent、失败保留和 remote group/action，确认旧 UI/IPC 失败。
4. Green：按 domain → port/service → adapters → commands/IPC → GitPane/CSS 顺序实现，每层运行对应聚焦测试。
5. Broad：运行 VER-004；本次引入失败必须修复，环境或已知基线失败需与差异范围对照并记录最小复验。

## Rollback Plan

- 移除 fetch/track actions、commands 和 TypeScript functions，恢复刷新按钮调用 snapshot-only。
- 恢复 `GitBranch` 旧字段和只查询 `refs/heads/`，分支弹层恢复单组 local rows。
- fetch 不修改工作树或本地提交，只更新 remote-tracking refs；无需数据迁移或仓库文件回滚。已由 fetch prune 移除的 stale remote refs 可在下一次普通 Git fetch 中重新取得（若服务端仍存在）。

## Risks

- focus event 覆盖正在运行的 manual fetch：使用同步 busy ref 阻止自动 snapshot 抢占用户 action，同时保留 request epoch 防 stale apply。
- fetch auth 失败清空 UI：manual fetch error path 保留 snapshot，仅更新 error/busy；初始 snapshot 失败仍使用现有 empty/error state。
- remote HEAD 或同名短 ref 误操作：parser 过滤 symref，key/action 使用 full ref，track action验证 requested ref 必须存在于当前 snapshot。
- upstream 是 local branch 而非 remote：matching 使用 full `upstream_ref`，不对 short upstream 机械添加 `refs/remotes/`。
- fetch all 部分成功：整体错误不应用返回快照；后续 snapshot 读取 Git 实际 refs，界面明确可重试。
- SSH origin 凭据与 Qterm host 凭据不同：保持 `GIT_TERMINAL_PROMPT=0`，不尝试传递或保存 origin secret。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`：GitPane 拥有 manual fetch intent/branch grouping；git domain/ports/application 拥有 ref/track/fetch 语义；local/SSH infrastructure 执行固定 fetch/track 命令。
- 将“不提供 Git origin sync”收窄为“不提供 pull/push/remote 管理或任意 origin 命令”；记录用户批准的主动 fetch 边界。
- 完成后回写 TASK/VER、命令摘要、环境性 SSH smoke 状态和 residual risk，再由 strict completion 归档。

## Architecture Boundary Check

- Boundary Decision：branch identity/matching 属于 domain；fetch-after-user-intent 属于 application/feature orchestration；固定进程/SSH 命令属于 adapter；DTO 和 React 不拥有 Git 规则。
- Placement：共享纯 matching helper 放 `domain/git.rs`；本机/SSH adapter 均调用它并执行同一 port contract，不在 commands 或 UI 复制 upstream 决策。
- Model Separation：domain `GitBranchKind`、DTO enum 和 TS string union 显式转换；`GitTarget::Remote` 不复用为 Git branch kind。
- Tradeoff：remote executor 继续使用封闭 action union而非拆成每操作一个异步 port 方法；现有 Git-purpose session runner 已是 action owner，扩展两项固定 action 比重构全部 SSH Git dispatch 更小且保持 ownership 校验。

## Critical Behavior Protection

- Coverage Decision：ref 解析、symref 过滤、fetch/prune、tracking reuse、SSH action allowlist、manual/auto intent 和失败保留 snapshot 都是高价值边界，必须 tests-first。
- Initial Tests：VER-001 保护 model/parser/DTO，VER-002 保护真实 Git refs 与 session ownership，VER-003 保护 UI intent、分组和安全 action。
- Gaps：真实第三方 origin 的凭据/网络错误文本依赖服务器和 Git transport；自动化覆盖稳定错误映射与旧 snapshot 保留，真实外部服务 smoke 不作为完成前提。

## Style Context

- 遵守 `qterm-ui-spec.md`：沿用现有 branch popover、semantic tokens、单一有界 scroller、常驻搜索/创建入口、文本化 current/local/remote 状态、可见 focus 和紧凑 3/5/7px rhythm。
- remote row 复用现有 `network` 图标，不新增图标族或强调色；元数据继续自然拼接并只在整体溢出时截断。

## Trigger Signals

- Architecture boundary：已触发并通过，TASK-001/002/003 必须维持 domain/adapter/DTO/UI 单向职责。
- Critical behavior：已触发，TASK-001 至 TASK-004 先补失败保护再实现。
- Directory Map：公共 Git contract 和 feature responsibility 变化，TASK-005 必须更新。

## Verification Result

- VER-001：branch parser/domain/command DTO 聚焦测试通过；覆盖 full ref/kind/upstream ref、symref 过滤、同 short name 不同 identity、remote ref validation、camelCase tagged action 和任意字段拒绝。
- VER-002：本机 Git executor 8 项通过；临时 bare origin 证明新增分支 fetch、remote HEAD 过滤、tracking local 复用/创建、同名冲突安全失败、prune、behind 更新和工作树不变。Git-purpose session ownership 测试通过；扩展后的 ignored OpenSSH init/stage/commit/fetch/track/branch/snapshot smoke 在本机实际运行通过。
- VER-003：`GitPane.test.tsx` 与 `gitStyles.test.ts` 共 42 项通过；覆盖 local/remote group/count/search、remote action、manual local/SSH fetch、focus snapshot-only、in-flight fetch 防抢占、失败保留 snapshot、自然元数据和紧凑单 scroller。
- VER-004：`pnpm check` 通过（68 个测试文件、616 项测试、ESLint、TypeScript、Vite production build）；`cargo fmt --check` 与 `cargo clippy --all-targets --all-features -- -D warnings` 通过；固定 fetch/track 命令、严格 IPC 和 `git diff --check` 审计通过。
- Rust full gate：`cargo test --all-targets --all-features` 只命中既有 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning` 在 macOS 上对 `C:/absolute.txt` 的平台断言；排除该单一基线后为 258 passed、0 failed、4 ignored，且新增 OpenSSH smoke 单独通过。
- Documentation：Directory Map 已同步 Git feature、domain/port、本机 adapter 和 SSH adapter 的 fetch/ref/tracking ownership，并继续禁止任意 Git 命令、pull/push 和 remote 管理。

## Residual Risk

- 未对需要真实第三方 origin 凭据的 HTTPS/SSH 服务做 smoke；非交互环境、错误映射、旧 snapshot 保留和本机 OpenSSH session 已有自动化证据。
- `fetch --all` 多 remote 场景可能在整体失败前部分更新 Git refs；界面失败时保留旧 snapshot，下一次成功 snapshot 读取 Git 实际 refs，未增加事务性回滚。
- 仓库既有跨平台路径断言仍失败，最小复验为 `cd src-tauri && cargo test domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning --lib`，与本次新增分支/fetch 差异无关。

## Next Action

TASK-001 至 TASK-005 和 AC-001 至 AC-006 已完成；由 strict completion 执行无冲突归档。pull/push、逐 remote fetch、进度/取消或 remote 管理应作为独立 change。
