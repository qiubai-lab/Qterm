---
id: QB-20260901-git-commit-branch
tier: standard
status: completed
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
supersedes: []
---

# 从提交创建分支实施计划

## Requirement

执行 `QB-20260901-git-commit-branch` 的 REQ-001 至 REQ-006：为 commit 行增加可访问的上下文菜单，并通过本机/SSH 封闭 action 从完整 commit OID 创建并切换到新本地分支。

## Scope

包含 commit 菜单/表单状态、键盘与焦点生命周期、前端操作编排、TypeScript/Tauri DTO、domain/port/application、本机与 SSH 固定 Git action，以及相关行为、样式和真实仓库测试。不包含只创建不切换、高级历史操作、通用菜单框架或持久化变化。

## Affected Files

- `src/git/GitCommitGraph.tsx`
- `src/git/GitPane.tsx`
- `src/git/GitRepositoryOverlays.tsx`
- `src/git/gitPaneTypes.ts`
- `src/git/gitRepositoryClient.ts`
- `src/git/styles/gitGraph.css`
- `src/git/styles/gitBranchOverlays.css`
- `src/git/GitPane.graph.test.tsx`
- `src/git/GitPane.branches.test.tsx`
- `src/git/gitStyles.test.ts`
- `src/lib/tauri/git.ts`
- `src-tauri/src/domain/git.rs`
- `src-tauri/src/ports/git_executor.rs`
- `src-tauri/src/application/git_service.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/infrastructure/ssh/client/tests.rs`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Design

- `GitCommitGraph` 在现有 focusable commit button 上增加鼠标/键盘菜单事件，只向上报告 commit 与 client anchor；不调用 IPC。
- `GitPane` 新增 commit context-menu 和 create form 状态，负责视口适配、关闭/焦点恢复、tooltip 抑制、busy/merge gating，以及通过现有 `runRecordedOperation` 应用 mutation snapshot。
- feature-local overlay 复用现有 `.git-repository-popover` 结构、menu navigation、`RequiredFieldLabel` 和固定 feedback slot，不新增通用 primitive 或依赖。
- 新增 sibling `CreateBranchFromCommit` action；domain 分别调用 `validate_branch_name` 与 `validate_commit_oid`。现有 branch-ref create-from 与 merge validator 保持不变。
- 本机使用参数数组执行固定 `git switch --no-track -c <name> <oid>`；SSH 使用经过现有 POSIX literal 编码的同等固定命令。两者成功后返回 snapshot，失败由既有上层恢复。
- 只在用户可操作时启用 menu item；菜单仍可显示目标信息，禁用状态使用共享 menu theme roles，且所有 hover/focus 只命中 enabled item。

## Implementation Tasks

- [x] 先新增 Rust domain/真实 Git/remote action 失败测试，覆盖完整 OID、历史 commit 结果、拒绝输入和 local/SSH 等价。
- [x] 实现 domain、port/application、本机 adapter、SSH adapter、commands/registration 与 TypeScript client contract，使后端测试转绿。
- [x] 先新增 commit 上下文菜单和创建流程的前端失败测试，覆盖鼠标、键盘、目标绑定、焦点、失败保留与 busy/merge gating。
- [x] 实现 GitPane/Graph/overlay 状态与 semantic styles，使前端测试转绿，并保持现有 tooltip/展开/分支操作。
- [x] 更新 Directory Map 的 Git capability 边界，执行聚焦到标准完整验证并记录证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitPane.graph.test.tsx` 覆盖鼠标/键盘菜单、定位、导航、关闭和焦点恢复。 |
| AC-002 | `GitPane.graph.test.tsx` / `GitPane.branches.test.tsx` 覆盖 commit 信息、完整 OID 提交、成功/失败和 gating。 |
| AC-003 | `domain::git::tests` 与 `commands::git::tests` 覆盖严格 OID 和封闭 DTO，不扩大 branch/merge ref。 |
| AC-004 | `infrastructure::git_cli::tests` 真实仓库覆盖历史 commit 创建；SSH action/fixture 测试覆盖远程固定 action。 |
| AC-005 | `gitStyles.test.ts` 与现有 graph/branch 测试覆盖 semantic menu、稳定 feedback、reduced motion、tooltip/展开回归。 |
| AC-006 | `pnpm check`、Rust fmt/clippy/tests、`git diff --check` 和静态 diff 审计。 |

## Test / Verification

1. `cargo test real_git_creates_and_switches_branch_from_historical_commit --lib`
2. `cargo test domain::git::tests --lib` 与 `cargo test commands::git::tests --lib`
3. `pnpm exec vitest run src/git/GitPane.graph.test.tsx src/git/GitPane.branches.test.tsx src/git/gitStyles.test.ts`
4. `pnpm check`
5. `cargo fmt --check`
6. `cargo clippy --all-targets --all-features -- -D warnings`
7. `cargo test --all-targets --all-features`
8. `git diff --check`

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`，明确 commit context create-from、本机/SSH commit-OID action 与禁止任意 revision 的边界。
- 验证结果写回 spec/plan，完成后按 standard workflow 自动归档。
- 不更新长期项目 context；本次交互与编码风格均来自既有规范，没有新增持久偏好。

## Dependencies

- 无新增外部依赖或账号要求。
- SSH 真实 lifecycle 受本机 sshd 环境限制；固定 action、validation 和 escaping 测试为非环境门禁。

## Trigger Signals

- Architecture boundary：已触发；使用 sibling commit action，保持 branch/merge 输入域和 UI/IPC/domain/infrastructure owner 分离。
- Critical behavior：已触发；仓库 mutation 和 remote action 先补自动化保护。
- Directory Map：需要更新既有 Git capability 描述，但不发生目录或模块移动。
