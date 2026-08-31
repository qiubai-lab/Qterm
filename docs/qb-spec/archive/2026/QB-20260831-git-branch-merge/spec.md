---
id: QB-20260831-git-branch-merge
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 分支安全合并

## Goal

在现有本机与 SSH Git Block 中提供可恢复的分支合并闭环，使用户可以把明确选择的本地或远程跟踪分支合并到当前本地分支，并在发生冲突时继续解决或安全中止，而无需离开 Qterm。

## Approval

用户已在 2026-08-31 明确采纳“安全闭环”推荐方案，并要求落地 spec、plan 后开始实现。

## Related Changes

- 本 change 扩展已归档 `QB-20260831-git-p0-branch-sync` 明确排除的 merge 能力，但保留其封闭 action、无 force、非交互执行、本机/SSH 等价和操作记录边界。
- 本 change 修改 `DIRECTORY_MAP.md` 中 Git feature 与 adapters 当前“不提供 merge”的能力说明，不改变 Workspace 持久化或 Git-purpose SSH session ownership。

## Scope

- 从仓库操作入口选择一个当前 snapshot 中存在的本地或远程跟踪分支，并将它合并到当前本地分支。
- 合并前显示不可歧义的 `源分支 → 当前分支` 方向并要求用户明确确认。
- 在干净工作区、正常本地 HEAD 且没有其他合并进行中的前提下执行非交互式默认 Git merge。
- snapshot 暴露可跨刷新恢复的“合并进行中”状态；冲突文件继续复用现有更改列表。
- 冲突解决完成并暂存后继续合并；用户确认后可中止合并。
- 本机与 profile-bound SSH 仓库提供一致语义，并写入现有有界、仅内存操作记录。

## Non-Goals

- Rebase、cherry-pick、squash merge、octopus merge、strategy/strategy-option、自定义 merge driver UI。
- `--no-ff`、`--ff-only` 等策略选择；首版遵循仓库现有 Git 默认 merge 策略。
- 自动 Fetch、自动 Stash、自动提交普通工作区改动或自动解决冲突。
- 三方冲突编辑器、逐块冲突选择、远程分支创建/删除或强制改写历史。
- 持久化 Git snapshot、merge 状态、操作记录或新增 Workspace schema 字段。

## Assumptions And Constraints

- “合并分支”固定表示把所选 source ref 合并进当前本地分支；不会切换当前分支，也不会反向修改 source ref。
- source 必须使用 snapshot 中存在的完整 `refs/heads/*` 或 `refs/remotes/*` identity；当前分支自身不可作为 source。
- 合并开始前工作区必须完全干净，包括 staged、unstaged、untracked 和 unresolved changes；该规则由后端再次校验，不能只依赖前端禁用状态。
- 合并不隐式访问网络。远程跟踪分支使用最近一次 Fetch 后的本地 remote-tracking ref。
- 本机和 SSH adapters 只执行代码定义的固定 Git 操作；WebView 不得传递 executable、shell、参数数组、策略选项、remote URL、环境变量或凭据。
- Qterm 继续设置非交互式 Git 环境，合并提交和继续合并不得打开编辑器或凭据提示。
- UI 复用现有 Git popover、semantic theme tokens、Icon、焦点恢复和操作记录，不新增依赖或 feature-local 色板。

## Requirements

- REQ-001：用户必须能够从当前 snapshot 中选择一个非当前的本地或远程跟踪 source ref，并在确认 `source → 当前本地分支` 后发起合并；非法、不存在、当前自身、detached HEAD 或 unborn HEAD 必须在修改仓库前被拒绝。
- REQ-002：开始合并必须要求工作区完全干净且仓库不处于合并进行中；不得自动 stash、丢弃、提交或覆盖用户现有更改，也不得隐式 Fetch。
- REQ-003：合并必须使用非交互式 Git 默认语义，正确支持 already-up-to-date、fast-forward 和产生 merge commit 的成功结果；首版不得暴露 force、strategy、squash、no-ff 或 ff-only 参数。
- REQ-004：当 Git 进入冲突状态时，操作必须返回并显示最新 snapshot，而不是只保留合并前快照或把仓库状态隐藏在普通错误中；现有冲突文件列表必须可用于解决和暂存。
- REQ-005：snapshot 必须暴露可从仓库真实状态重建的 `mergeInProgress`，使窗口聚焦、手动刷新、远程重连或前端重新挂载后仍能显示合并未完成状态；该状态不得依赖仅内存 UI 标志。
- REQ-006：合并进行中时，用户必须能在所有冲突已解决后继续合并，并能在明确确认后中止合并；继续或中止后必须返回真实 snapshot。普通分支切换、Pull、Push、Sync、Fetch 和新合并入口在合并完成或中止前必须不可用。
- REQ-007：GitPane 必须提供紧凑、可键盘访问的合并选择/确认界面和稳定的合并状态条；方向、冲突数量、继续可用性和中止风险不能只通过颜色表达。中止确认关闭后必须恢复触发控件焦点。
- REQ-008：合并操作必须进入最多 20 条的现有内存操作记录；状态至少区分 running、success、attention 和 error，冲突等待解决不得伪装成成功或普通失败，详情继续执行有界与脱敏规则。
- REQ-009：本机和 SSH Git 必须使用同一 ref 校验、前置条件与可观察状态；SSH 继续复用已授权的 Git-purpose session，并保持超时、输出上限、POSIX literal 编码和 session/profile ownership。
- REQ-010：现有 snapshot、Fetch、stage/unstage、commit、分支管理、同步、commit graph、主题、滚动与仓库历史行为必须保持兼容；不新增运行时依赖、持久化字段或通用 Git 执行入口。

## Primary, Alternate And Recovery Scenarios

1. 用户在干净的 `main` 上选择 `feature/a`，确认 `feature/a → main`；Git 完成 fast-forward 或 merge commit，snapshot 和 commit graph 更新，操作记录为 success。
2. 用户选择的 source 已被当前分支完全包含；Git 返回正常 snapshot，操作记录显示合并完成，不创建多余提交。
3. source 与当前分支产生内容冲突；Qterm 应用冲突后的 snapshot，展开更改区并显示 attention 状态、冲突数量、继续与中止入口。
4. 用户逐项解决并暂存全部冲突；“继续合并”变为可用，Git 使用既有 MERGE_MSG 非交互完成提交并清除 `mergeInProgress`。
5. 用户在冲突解决过程中选择“中止合并”，阅读影响并确认；Git 执行 merge abort，返回非合并状态 snapshot。用户在冲突期间新增的解决编辑可能被放弃，因此中止必须确认。
6. snapshot 发现仓库已经由终端或先前 Qterm 操作进入 merge 状态；界面直接恢复状态条，不要求存在当前进程内操作记录。
7. 工作区非空、source 无效、当前 HEAD 不可合并、已有 merge 进行中、continue 尚有冲突或 Git 拒绝 abort 时，操作失败并重新读取真实 snapshot，不隐藏或伪造恢复结果。
8. SSH session 断开、超时或权限失败时，显示稳定错误并保留或恢复最近可读取 snapshot；不会建立额外 session 或回退为任意 shell 执行。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002]：domain/adapter 自动化测试证明只有 snapshot 中存在的非当前完整 local/remote ref 可合并；dirty、detached、unborn、self-merge、missing ref 和已有 merge 状态均在执行前拒绝且 HEAD/工作区保持不变。
- AC-002 [REQ-003]：真实本地 Git fixture 分别证明 already-up-to-date、fast-forward 和双边提交生成 merge commit；提交图父节点正确，未出现 squash/rebase/force 或隐藏网络访问。
- AC-003 [REQ-004, REQ-005, NFR-002]：真实冲突 fixture 证明 merge 命令冲突后返回 `mergeInProgress=true` 的最新 snapshot 和 conflict changes；重新 snapshot 仍能恢复相同状态。
- AC-004 [REQ-006]：真实 Git fixture 证明未解决冲突时 continue 被拒绝；解决并暂存后 continue 完成 merge；abort 清除 merge 状态并恢复合并前 HEAD。失败路径返回或可重新读取实际状态。
- AC-005 [REQ-007, NFR-003]：Testing Library 覆盖仓库菜单入口、local/remote source 选择、方向确认、脏工作区禁用说明、合并状态条、冲突数量、continue gating、abort 确认、Escape、键盘和焦点恢复。
- AC-006 [REQ-008]：前端测试覆盖 merge running/success/attention/error、耗时、20 条上限与 target 变化清空；冲突记录显示等待解决而非成功/错误，详情不包含命令、URL userinfo 或无限文本。
- AC-007 [REQ-009, NFR-001, NFR-004]：domain/DTO/SSH action 测试证明本机和 SSH 使用相同封闭 merge/continue/abort action 与校验；unknown fields、命令、args、策略、URL、credential 和 force 输入无法进入 IPC，Git-purpose ownership 仍受保护。
- AC-008 [REQ-010, NFR-004]：现有 Git frontend/Rust 回归、`pnpm check`、Rust fmt/clippy/tests 和固定命令静态审计无本次新增失败；依赖清单、Workspace schema 与非 Git persistence 无变化。

## Non-Functional Requirements

- NFR-001：merge/continue/abort 使用既有 mutation timeout 和 8 MiB 输出上限；任何失败详情在进入 WebView 前保持脱敏和有界。
- NFR-002：合并状态来自仓库真实元数据，刷新读取不得修改工作区或访问网络。
- NFR-003：合并 UI 遵守 Qterm compact workbench 规范：单一浮层滚动 owner、可见 focus、持久核心动作、semantic tokens、稳定 feedback slot、reduced-motion/transparency 与短窗口可用性。
- NFR-004：不得新增第三方依赖、通用 shell/命令 API、额外 SSH session 或持久化迁移。

## Behavior Delta

### ADDED

- REQ-001：用户可以把明确选择的本地或远程跟踪分支合并到当前本地分支。
- REQ-003：Git Block 新增 already-up-to-date、fast-forward 与默认 merge commit 的安全合并能力。
- REQ-004：冲突成为可观察、可操作的仓库状态，而不是不可恢复的普通错误。
- REQ-005：snapshot 新增可跨刷新恢复的合并进行中状态。
- REQ-006：用户可以继续或确认中止未完成合并。
- REQ-007：GitPane 新增合并确认和合并状态条。
- REQ-008：操作记录新增 attention 状态以表达等待用户解决冲突。
- REQ-009：本机与 SSH action allowlist 新增固定 merge/continue/abort 能力。

### MODIFIED

- REQ-002：现有 Git mutation 前置约束扩展为在安全合并开始前要求完全干净工作区，并在 merge 进行中限制不兼容操作；原有 stage/unstage 仍用于冲突解决。
- REQ-010：Git Block 从明确不提供 merge 扩展为安全合并闭环，同时保留既有同步、分支、图表、主题和持久化边界。

## Architecture Boundary Check

- Boundary Decision：完整 ref 与 merge 前置条件属于 Git domain/封闭 action 规则；合并状态属于 repository snapshot；固定命令、失败后识别 MERGE_HEAD 和输出解析属于 local/SSH infrastructure；commands 只映射严格 DTO；GitPane 只编排确认、busy、attention 和冲突恢复展示。
- Placement：`GitSnapshot` 新增仓库派生的 `mergeInProgress`；`GitExecutor`/`GitService` 增加 merge/continue/abort 用例；`RemoteGitAction` 增加同名封闭 variants；两类 adapters 在命令失败后检测真实 merge 状态，冲突视为“进入需要处理的仓库状态”并返回 snapshot。
- Model Separation：Rust domain、Tauri DTO 与 TypeScript model 显式映射；仅内存 operation record 不进入 domain/Workspace/persistence；source 显示名不替代完整 ref identity。
- Tradeoff：不引入通用 `GitActionResult` 或全局 operation framework。首版以 snapshot 的真实 merge state 表达冲突后的稳定状态，前端根据该状态记录 attention，避免扩大所有 Git action 的 transport 契约。

## Critical Behavior Protection

- Coverage Decision：分支方向、干净工作区、冲突后的真实状态、continue/abort 恢复和 SSH 固定 action 都会修改用户仓库，必须先补聚焦失败测试与真实 Git fixture。
- Required Coverage：domain validation、local real-repository lifecycle、SSH action/session ownership、strict DTO、GitPane interaction 和 style contract。
- Gaps：真实第三方 merge driver、credential helper 和平台特定 filesystem 冲突不作为首版自动化 fixture；保留 Git 固定错误、真实 snapshot 恢复和手工 smoke 作为补充证据。

## Risks And Recovery

- 冲突是预期仓库状态而非原子失败；若 UI 未应用最新 snapshot，用户可能误判仓库状态。实现必须在冲突后返回或重读 snapshot。
- `merge --abort` 可能放弃用户在冲突期间新增的解决编辑，因此必须确认；如果 Git 拒绝 abort，保持当前 snapshot 并显示错误，不尝试 reset。
- 用户可在外部终端改变 merge 状态；Qterm 每次 snapshot 都以仓库真实状态为准，不依赖内存记录。
- SSH 网络中断可能发生在 Git 已修改仓库之后；失败恢复优先重新 snapshot，无法读取时保留 stale 状态并要求重连后刷新。

## Rollback

- 前端可移除合并入口、状态条和 attention 展示而不影响既有 Git snapshot/commit/branch/sync 流程。
- 后端可移除 merge/continue/abort actions 与 `mergeInProgress` DTO；没有数据库、Workspace schema 或依赖迁移需要回滚。
- 已成功的 fast-forward/merge commit 属于用户明确操作结果，不由应用自动反向修改；进行中的冲突可在回滚前通过现有 Git 或本 change 的 abort 完成处理。

## Open Issues

- 无阻塞产品决策。默认策略、干净工作区、不自动 Fetch/Stash、完整 local/remote source 与 continue/abort 语义均已包含在用户采纳的推荐方案中。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Findings：目标、范围、主路径、冲突恢复、SSH 等价、安全边界和回滚均闭合；非阻塞 note 是外部终端可在 Qterm 之外继续或中止 merge，因此所有 UI 状态必须始终由 snapshot 重建，不能把内存 operation record 当成权威。
- Traceability：REQ-001 至 REQ-010 均由 AC-001 至 AC-008 覆盖；NFR-001 至 NFR-004 已进入 AC-003、AC-005、AC-007、AC-008；Behavior Delta 的 ADDED/MODIFIED 均回连稳定 REQ。
- Next Action：进入 strict planning；计划必须建立 TASK/VER 映射，并先补真实 Git lifecycle 与前端状态测试。

## Verification And Completion

- Verification：VER-001 至 VER-004 的聚焦 domain、真实 Git、strict DTO、SSH ownership 与 GitPane/style 检查全部通过；VER-005 的 `pnpm check`、Rust fmt/clippy 和 `git diff --check` 通过，Rust 全量仅出现未被本 change 修改的既有跨平台路径断言；VER-006 安全/依赖/schema 静态审计通过。
- Acceptance Coverage：AC-001 至 AC-007 verified；AC-008 verified with baseline qualification，未发现本次新增失败、依赖变更、Workspace/persistence 迁移或通用 Git 执行入口。
- Manual Checks：聚焦代码审阅确认 merge 固定为 source ref → 当前 local branch，冲突以真实 `MERGE_HEAD` snapshot 返回；continue/abort 不含 reset fallback，SSH 参数只由 adapter 使用 POSIX literal 组装。
- Directory Map：已更新 `docs/qb-spec/DIRECTORY_MAP.md`，记录 snapshot/merge contract 与 frontend/domain/command/local/SSH ownership；未改变目录结构或入口位置。
- Context：没有自动修改长期 context；用户批准的是本 change 推荐方案，未另行批准 Behavior Delta 提升。完整语义、边界与残余风险保留在本归档 spec。
- Residual Risk：真实 OpenSSH merge lifecycle 未作为非环境门禁执行；第三方 merge driver、credential helper 与平台特定文件系统冲突未进入首版 fixture。现有 local real-Git lifecycle、SSH fixed-action/session tests 和错误后 snapshot 恢复覆盖主要仓库安全风险。
- Completion：实现和 strict 验收完成，满足 conflict-free 自动归档条件。
