---
id: QB-20260831-git-repository-history
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# 按连接保存最近打开的 Git 仓库实施计划

## Background

现有 Git Block 已具备本机 native picker、远程混合式 picker、profile-bound Git session 和稳定的 `selectGitTarget` 生命周期，但 Workspace 只保存当前 target。此次在 Workspace schema v10 中增加低频 MRU 历史，并把顶部文件夹入口改成“最近仓库 + 浏览其他目录”的稳定弹层；GitPane 只在目标真正返回有效 snapshot 后报告成功打开。

## Requirement

- 同 ID spec 的 REQ-001 至 REQ-012、NFR-001 至 NFR-004 和 AC-001 至 AC-008 是实现与验收事实源。
- 本机是一个 scope；远程按稳定 `profileId` 精确隔离；每 scope 最近 8 条、全局最近 64 条。
- 选择/输入路径不是成功打开；只有 snapshot/initialize 成功才进入 MRU。
- 历史只属于 Workspace 文档，不进入连接 profile、runtime session 或独立 persistence repository。

## Non-Goals

- 不增加历史搜索、固定、删除、清空、时间戳、显示名称、仓库预探测或失效自动清理。
- 不改变 Git action allowlist、Git snapshot contract、Files session、remote directory IPC 或 native picker bridge。
- 不重构 `FileBrowserPane`，不增加通用 manager dialog、日期、状态或虚拟列表依赖。
- 不让 history popover 或 GitPane 直接拥有 Workspace 保存、连接认证或 session close/reconnect 生命周期。

## Architecture Impact

- Workspace frontend domain：新增专用 `GitRepositoryHistoryEntry` 和纯 MRU/scope 规则；reducer 是唯一历史 mutation owner。
- Git feature：GitPane 在首次成功 snapshot 时上报 resolved repository identity；feature-local popover 负责最近项展示、键盘/焦点与固定 browse action，不写持久层。
- Workspace composition：GitBlock 过滤当前 scope 历史，编排历史选择、native/remote browse、新 remote profile 快捷项与既有 target/reconnect lifecycle。
- Rust domain：Workspace domain enum 和 validation 保证路径、去重、per-scope/global bounds；command DTO 与 persistence record 保持显式分层映射。
- Persistence：`workspaces.json` schema 9 升级 10；受支持旧 schema 迁移链最终补空历史，加载过程继续只返回 migration 结果而不主动覆写磁盘。

## Domain Model Impact

- 前端新增 `GitRepositoryHistoryEntry = Local(path) | Remote(profileId, path)`；不复用包含 `Unbound` 的 `GitTarget`。
- Rust domain 新增对应 enum；Workspace document 新增有序 `recent_git_repositories`。
- MRU 规则从数组头部到尾部单次筛选：先移除 exact duplicate、将成功项前置，再按 scope 计数保留前 8 条，并在 64 条时停止；不得依赖 hash/map iteration 顺序。
- target identity 为 `local:path` 或 `remote:profileId:path`。同 identity 的自动刷新和 mutation snapshot 在一次连续打开生命周期中只上报一次；切换到其他 target 后重新打开原 target 可重新前置。

## API Impact

- Workspace Tauri DTO 增加 `recentGitRepositories` 严格字段和专用 tagged union；schema version 改为 10。
- 不增加新 Tauri command、Git IPC、SSH capability 或网络调用。
- React 内部 `GitPane` 增加可选 `onRepositoryOpened` callback；不改变 transport API。

## Database Impact

- `workspaces.json` schema v10 新增顶层 `recentGitRepositories` 数组。
- v9 → v10 显式迁移为空数组；现有 v5-v8 迁移链继续完成既有字段补齐后进入 v10。
- save 使用现有原子 repository；总 64 条和路径上限确保继续受 4 MiB document cap 保护。

## Affected Files

- `src/workspace/model.ts`
- `src/workspace/gitRepositoryHistory.ts`（新增）
- `src/workspace/gitRepositoryHistory.test.ts`（新增）
- `src/workspace/reducer.ts`
- `src/workspace/reducer.test.ts`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/workspace/WorkspaceProvider.test.tsx`
- `src/workspace/WorkspaceShell.test.tsx`
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/GitRepositoryHistoryPopover.tsx`（新增）
- `src/git/GitRepositoryHistoryPopover.test.tsx`（新增）
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `src-tauri/src/domain/workspace.rs`
- `src-tauri/src/commands/workspace.rs`
- `src-tauri/src/infrastructure/persistence/json_workspace_repository.rs`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Implementation Tasks

- [x] TASK-001 [REQ-001 至 REQ-003, REQ-010, AC-001, AC-002, AC-007] 先新增前端纯 MRU/reducer 失败测试和 Rust domain/command/persistence 失败测试，覆盖 local/remote model、exact dedupe、scope isolation、8/64 deterministic eviction、非法数据、v9 migration、v10 round-trip、future/corrupt no-overwrite。
- [x] TASK-002 [depends: TASK-001] [REQ-001 至 REQ-003, REQ-010, NFR-001 至 NFR-004, AC-001, AC-002, AC-007] 实现 frontend model/MRU/reducer 与 Rust domain/DTO/record/schema v10/migration，更新所有 typed fixtures，并证明历史不进入 connections contract。
- [x] TASK-003 [REQ-004, REQ-009, AC-003] 先新增 GitPane callback 失败测试，覆盖 refresh 成功、initialize 成功、失败不报告、连续 refresh/mutation 不重复、target 切换后可重新报告；再实现 resolved identity 的一次性 success callback。
- [x] TASK-004 [REQ-005, REQ-007, REQ-011, AC-004] 先新增 history popover 组件/样式失败测试，覆盖 scope rows、basename/path、current/empty、固定 browse、pointer/keyboard、outside/Escape、focus restore、单一 scroller、cyber scrollbar 和 reduced motion；再实现 feature-local 弹层。
- [x] TASK-005 [depends: TASK-002 至 TASK-004] [REQ-002, REQ-005 至 REQ-008, AC-005, AC-006] 先更新 LayoutView 集成测试，再在 GitBlock 接线：success dispatch、header history selection、local native browse、remote picker/reconnect、新 profile 专属历史与手动路径 fallback；保持同 target no-op 和既有 `selectGitTarget` owner。
- [x] TASK-006 [depends: TASK-001 至 TASK-005] [REQ-012, AC-008] 更新 Directory Map，运行聚焦/完整前端和 Rust 门禁、静态敏感数据/profile contract 审计、diff hygiene，回写 evidence 并完成 conflict-free 归档。

## Dependencies And Parallel Work

- TASK-002 依赖 TASK-001 的失败保护；schema 版本和 MRU 规则必须一次落地，避免前后端短暂接受不同上限。
- TASK-003 可以在 MRU domain 之后独立实现，但必须在 TASK-005 前完成，防止 UI 在路径选择阶段错误记录。
- TASK-004 的纯组件测试不需要真实 Git transport；TASK-005 才连接 Workspace target 和 remote reconnect intent。
- Rust command/persistence 文件共享 schema contract，应顺序编辑和聚焦验证；不引入外部依赖。

## Acceptance To Verification

- VER-001 [AC-001, AC-002, AC-007]：`pnpm vitest run src/workspace/gitRepositoryHistory.test.ts src/workspace/reducer.test.ts`；`cargo test domain::workspace --lib`、`cargo test commands::workspace --lib`、`cargo test infrastructure::persistence::json_workspace_repository --lib`，并审计 `connections.json` contract 不含 history。
- VER-002 [AC-003]：`pnpm vitest run src/git/GitPane.test.tsx`，验证 success-only 与 per-target-identity callback 时机。
- VER-003 [AC-004 至 AC-006]：`pnpm vitest run src/git/GitRepositoryHistoryPopover.test.tsx src/workspace/LayoutView.test.tsx src/git/gitStyles.test.ts`，验证弹层、browse/reconnect、pending profile isolation 和样式/可访问性。
- VER-004 [AC-001 至 AC-008]：`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、native dialog blocking audit、sensitive/profile persistence audit 和 `git diff --check`。

## Test Plan

1. Red：纯 TS MRU/reducer 与 Rust Workspace schema/domain/persistence tests 先失败，再实现 model 和 v10 migration。
2. Red：GitPane success callback tests 先失败，确保 selection/failure 不能被 reducer 或 LayoutView 误记。
3. Red：popover 与 LayoutView tests 先失败，覆盖 pointer/keyboard、current/empty、local/remote browse 和新 profile scope。
4. Focused：每个 TASK 完成后运行对应 VER-001 至 VER-003，及时隔离 contract 与 UI 失败。
5. Broad：按 VER-004 执行完整门禁；任何已知基线失败必须与 `HEAD` 对照并给出最小复验，不能掩盖本次新增失败。

## Rollback Plan

- 移除 frontend/Rust history model、reducer action、GitPane callback、popover 和 GitBlock 接线；header folder action恢复直接 browse。
- 保留 v10 reader 兼容或先发布能读取 v10 并忽略空历史的回滚版本；旧 v9 build 会正确拒绝未来 schema，不能让用户以旧构建覆盖 v10 文档。
- 不需要回滚 Git/SSH/session/native dialog，因为本次不修改这些 contract；历史是附加 Workspace 元数据，不影响仓库内容。

## Risks

- 在选择 target 时记录会持久化无效路径：只有 GitPane success callback 可 dispatch history action。
- focus refresh/stage/commit snapshot 反复调用 callback 会把活跃仓库持续顶到 MRU：连续 identity ref 必须去重。
- scope filter 错用 profile 名称或 endpoint 会跨连接泄漏：domain/UI 只使用 `profileId`。
- map iteration 或先全局后 scope 的错误限额会产生不稳定淘汰：使用 MRU 顺序单次筛选并覆盖混合 scope 测试。
- 新 popover 包裹现有 browse 入口会增加一步：browse 固定在 footer 且可键盘直接到达，recent item 则减少重复浏览成本。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`：Workspace schema v10、纯 MRU domain、Git history popover 和 GitPane success reporting boundary。
- 完成后把 TASK/VER 状态、命令输出摘要、基线差异和 residual risk 回写 spec/plan，再由 strict completion 归档。

## Architecture Boundary Check

- Boundary Decision：history 是 Workspace 低频持久状态；GitPane 是成功事实源；GitBlock 是 UI/session 编排 owner；Rust domain 是稳定数据约束 owner；adapter 只做 migration/serialization。
- Placement：纯规则放 `src/workspace/gitRepositoryHistory.ts`；弹层放 `src/git`；不把 history 写入 ConnectionProfile、transport adapter、Git snapshot 或 generic component。
- Model Separation：frontend model、Rust domain、IPC DTO 和 persistence record 使用独立类型及显式转换；`GitTarget` 只用于 runtime/当前目标，history 不允许 `Unbound`。
- Tradeoff：不新增 history repository。现阶段只有一个 bounded ordered list，沿用 Workspace atomic persistence 比跨文件事务和第二数据源更安全。

## Critical Behavior Protection

- Coverage Decision：schema migration/no-overwrite、scope isolation、deterministic eviction、成功后记录和 remote reconnect 是高价值回归边界，必须 tests-first。
- Initial Tests：VER-001 保护 persistence/domain；VER-002 保护 success semantics；VER-003 保护 UI scope 和 target lifecycle。
- Gaps：真实远端路径可能因服务器状态暂时失效；自动化验证错误状态不删除历史，真实 SSH smoke 是环境性补充而非完成阻塞项。

## Style Context

- 采用项目 `qterm-ui-spec.md`：Block header 核心 action 常驻；popover 紧凑、单一有界 scroller、basename 主信息与 monospace path 次信息；semantic tokens、cyan scrollbar、可见 focus、current 文本标记、topmost Escape/focus restore 和 reduced-motion。
- 沿用现有 `Icon name="files"`、Button tokens 与短 opacity/transform 过渡，不增加局部主题系统或 hover-only 核心动作。

## Trigger Signals

- Architecture boundary：已触发并通过，TASK-002/003/005 必须遵守 owner 分离。
- Critical behavior：已触发，TASK-001、TASK-003、TASK-004、TASK-005 均先测试后实现。
- Directory Map：新增 model/domain/component 并升级 schema，TASK-006 必须更新。

## Verification Result

- VER-001：前端 MRU/reducer 聚焦测试 16 项通过；Rust Workspace domain 6 项、command DTO 3 项、JSON persistence 8 项通过。v10 round-trip、v9 空历史迁移、旧文档 load no-overwrite、strict unknown/sensitive/future rejection、8/64 限额与 deterministic frontend order 均有直接覆盖。
- VER-002：`GitPane.test.tsx` 25 项通过；成功 local/remote snapshot 和 initialize 上报，失败不报告，同 identity refresh/mutation 不重复，切换后重开可重新报告。
- VER-003：history popover、LayoutView、GitPane、MRU/reducer 与 gitStyles 聚焦集合共 99 项通过；覆盖 local/remote scope、pending profile、native/remote browse、reconnect intent、pointer/keyboard/Escape/outside/focus restore、current/empty 与 themed bounded scroller。
- VER-004：最终 `pnpm check` 通过（68 个测试文件、612 项测试、ESLint、TypeScript、Vite production build）；`cargo fmt --check` 与 `cargo clippy --all-targets --all-features -- -D warnings` 通过；native dialog blocking audit、profile/sensitive-field 静态审计和 `git diff --check` 通过。
- Rust full gate：`cargo test --all-targets --all-features` 仅命中未修改基线 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning` 的 macOS/Windows 绝对路径平台断言；排除该单一用例后 248 passed、0 failed、4 ignored，`src-tauri/src/domain/git.rs` 与 HEAD 无差异。
- Documentation：Directory Map 已更新 Workspace schema v10、MRU domain、history popover、GitPane success reporting 与 JSON persistence boundary。
- Completion：AC-001 至 AC-008 均有直接证据；TASK-001 至 TASK-006 完成，change 于 2026-08-31 无冲突归档。

## Residual Risk

- 未执行真实远端仓库路径失效后的桌面 smoke；既有 Git error/initialize 状态和组件测试已证明失败不会记录或自动删除历史。
- 仓库既有 Windows 绝对路径跨平台断言仍失败，最小复验为 `cd src-tauri && cargo test domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning --lib`，与本次差异无关。

## Next Action

无需后续实施动作；历史删除、固定、搜索或失效清理如有明确需求，应建立独立 change。
