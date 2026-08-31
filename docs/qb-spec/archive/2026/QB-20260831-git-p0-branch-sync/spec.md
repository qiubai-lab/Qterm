---
id: QB-20260831-git-p0-branch-sync
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git P0 Branch Lifecycle And Safe Sync

## Goal

在现有本机与 SSH Git Block 中补齐高频分支生命周期和安全远程同步闭环，使用户无需离开 Qterm 即可从明确来源创建分支、重命名或安全删除本地分支，并执行可诊断的 Push、Publish、FF-only Pull 与 Sync。

## Approval

用户已在 2026-08-31 明确采纳此前的 P0 推荐方案并要求优先实现。

## Related Changes

- 本 change 明确修改已归档 `QB-20260830-remote-git-management` 中 REQ-014 对 Git origin sync 的首版排除边界，但不 supersede 该 change 的 SSH session ownership、窄 IPC 与禁止任意命令原则。

## Scope

- 基于现有本地或远程分支创建并切换到新本地分支。
- 重命名本地分支；安全删除非当前、已合并的本地分支。
- Push 已跟踪分支；为未发布分支选择已有 remote 并设置 upstream。
- 对已有 upstream 的当前分支执行 fast-forward-only Pull；Sync 固定先 Pull 再 Push。
- 在紧凑仓库操作菜单中提供上述入口，并维护有界、仅内存、脱敏的操作记录。
- 本机 Git 与复用既有 Git-purpose SSH session 的远程 Git 保持能力一致。

## Non-Goals

- Force Push、删除远程分支、强制删除未合并分支。
- 自动 merge、pull --rebase、rebase、cherry-pick 或自动 stash。
- Git 凭据录入、保存、代理或远程 URL 管理。
- Clone、Remote 增删、Stash、Tag、Worktree、Diff/三方冲突编辑器或自动 Fetch 设置。
- 持久化 Git snapshot、操作记录、remote 信息或运行时状态。

## Assumptions And Constraints

- Push/Pull 使用 Git 在实际执行主机上已经配置的 credential helper、SSH key/agent 或无交互凭据；Qterm 继续设置 `GIT_TERMINAL_PROMPT=0`，不会弹出或代理 Git 凭据输入。
- WebView 只能提交封闭 action DTO、仓库路径、经过校验的分支/ref 和已有 remote 名称；不得提交命令、参数数组、remote URL、环境变量或凭据。
- Publish 只向前端暴露 remote 名称，不暴露可能含 userinfo 的 URL。
- 所有命令保持固定结构、无 shell 的本机执行和仅由 adapter 组装/引用编码的 SSH 执行；保留有界超时与输出限制。
- UI 使用现有 Qterm 主题 token、Icon 与 Git 浮层，不新增依赖或全局色板。

## Requirements

- REQ-001: 用户可以从当前 HEAD、现有本地分支或现有远程分支创建并切换到新本地分支；来源必须以当前 snapshot 中存在的完整 ref 标识，原有“从当前 HEAD 创建”入口继续可用。
- REQ-002: 用户可以重命名任一本地分支；用户只能在明确确认后删除非当前本地分支，且默认删除必须拒绝未合并分支，不提供强制删除。
- REQ-003: 当前分支已有 upstream 时，用户可以 Push；没有 upstream 时，用户可以从当前仓库已有 remote 名称中选择目标并 Publish，成功后建立 upstream。任何路径都不得执行 force push。
- REQ-004: 当前分支已有 upstream 时，用户可以执行 FF-only Pull；分叉、会覆盖工作区、缺少 upstream 或 Git 拒绝时必须失败并保留可恢复状态。Sync 固定先完成 FF-only Pull，再执行 Push；第二步失败后界面必须重新反映 Pull 后的真实 snapshot。
- REQ-005: 仓库操作菜单必须以紧凑、可键盘访问的方式提供 Pull、Push/Publish、Sync 与操作记录；分支弹层提供基于来源创建、重命名和安全删除入口，删除使用独立确认表单。
- REQ-006: 用户发起的 P0 分支/同步操作必须产生最多 20 条、仅当前 GitPane 内存持有的记录，包含操作名称、running/success/error 状态、耗时和有界详情；错误详情必须移除 URL userinfo 等敏感片段，记录不得持久化或包含任意命令文本。
- REQ-007: 本机与 SSH Git 对 P0 action 使用同一领域校验和可观察语义；SSH 继续复用 profile/session ownership 校验后的 Git-purpose session，不建立通用命令通道或新持久会话。
- REQ-008: 现有 snapshot、Fetch、暂存、提交、分支切换/跟踪、滚动和主题行为保持兼容；不修改 Workspace persistence schema，不新增运行时依赖。

## Primary And Error Scenarios

1. 用户从分支列表选择一个来源 ref，输入新名称；Qterm 创建并切换分支，刷新 snapshot，并记录成功。
2. 用户选择本地分支并输入新名称；重命名成功后列表和当前 HEAD 同步更新。
3. 用户选择非当前本地分支进入删除确认；已合并分支删除成功，未合并分支由 Git 安全拒绝并保留列表。
4. 当前分支有 upstream 时 Push；没有 upstream 时显示 remote 名称选择，Publish 成功后 `upstream` 与 ahead/behind 更新。
5. Pull 仅允许 fast-forward；分叉或工作区冲突时失败，不自动创建 merge commit、rebase 或 stash。
6. Sync 的 Pull 成功而 Push 失败时，操作记录显示两步结果，界面刷新并保留 Pull 后状态。
7. Git credential helper 不可用、认证失败、超时或 SSH session 断开时，操作失败、最后 snapshot 保留或刷新为实际状态，详情经过脱敏。

## Acceptance Criteria

- AC-001 [REQ-001]: 本机和 SSH 集成测试证明从本地及远程完整 ref 创建新分支后 HEAD 指向新分支；不存在或非法来源被拒绝，既有从 HEAD 创建仍通过。
- AC-002 [REQ-002]: 自动化测试证明本地分支可重命名；当前分支不能删除；已合并非当前分支可删除；未合并分支在无 force 情况下失败且提交仍可达。
- AC-003 [REQ-003]: 真实本地 bare-origin 测试证明 tracked branch Push 更新远端，未跟踪分支可从已有 remote Publish 并建立 upstream；非法/未知 remote、detached/unborn HEAD 和所有 force 变体不可进入执行路径。
- AC-004 [REQ-004]: 真实仓库测试证明 Pull 只执行 fast-forward；分叉时不产生 merge commit且失败；Sync 严格 Pull 后 Push，Push 失败时后续 snapshot 可观察到已完成的 Pull。
- AC-005 [REQ-005]: Testing Library 覆盖仓库操作菜单、Push/Publish remote 选择、Sync、分支管理表单、删除确认、Escape/外部关闭和键盘可达入口；紧凑布局与主题状态有样式断言。
- AC-006 [REQ-006]: 前端测试覆盖 running/success/error/耗时、20 条上限和非持久记录；Rust/前端测试证明 URL userinfo 在进入可见错误详情前被脱敏，输出有界且不显示命令文本。
- AC-007 [REQ-007]: domain/command DTO 测试拒绝未知字段、任意命令/参数/URL/凭据；local 与 SSH adapter 测试断言固定 Push/Publish/Pull/rename/delete/create-from 结构及既有 session ownership。
- AC-008 [REQ-008]: 现有 Git 前端测试、Rust Git 测试、`pnpm check`、Rust fmt/clippy 与相关 Rust 全量测试通过；Workspace schema、依赖清单和非 Git 模块无变化。

## Behavior Delta

### ADDED

- REQ-001: 分支可从当前 snapshot 中明确选择的本地或远程来源创建。
- REQ-002: 本地分支支持重命名和非 force 的安全删除。
- REQ-003: 当前分支支持 Push 或选择已有 remote Publish。
- REQ-004: 当前分支支持 FF-only Pull 和顺序安全的 Sync。
- REQ-005: 仓库操作与分支管理获得紧凑、可访问入口。
- REQ-006: P0 Git 操作获得有界、脱敏、仅内存的状态记录。
- REQ-007: 新增能力在本机与 SSH Git action 边界保持一致。

### MODIFIED

- REQ-008: 现有 Git Block 从只读远程更新与本地提交/分支操作，扩展为安全同步闭环；原有行为、schema 与依赖保持兼容。

## Risks And Recovery

- 网络操作可能使用执行主机的外部 credential helper；失败时不接管凭据，只显示脱敏错误并允许重试。
- Sync 存在 Pull 成功、Push 失败的合法部分成功状态；实现必须重新读取 snapshot，而不是回滚已完成的 fast-forward。
- 分支删除不可静默恢复；仅使用 `git branch -d`、排除当前分支并要求确认，回滚为通过 reflog/终端人工恢复。
- 发布后会改变 upstream；失败时以重新读取 snapshot 为准，不缓存假定状态。

## Rollback

- 前端可移除新菜单与表单而不影响现有 snapshot/Fetch/Commit 流程。
- 后端可移除新增封闭 actions、ports 方法与 DTO；没有 persistence/schema 迁移需要回滚。
- 已成功 Push、Publish、Pull 或删除的 Git 仓库状态属于用户显式操作结果，不由应用自动反向修改。

## Open Issues

- 无阻塞项。完整 merge/rebase、Git 凭据管理和高级破坏性操作明确留待后续 change。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Findings：需求、验收、安全与恢复边界闭合；plan 需固定显式 refspec、create-from 不自动 tracking、输出/详情上限、WebView 前脱敏、mutation 后 best-effort snapshot 与 Sync 部分成功记录。
- Traceability：REQ-001 至 REQ-008 均由 AC-001 至 AC-008 覆盖；Behavior Delta 完整，strict TASK/VER 映射在实施 plan 中建立。
- Next Action：进入 strict planning 与测试先行实施。

## Verification Evidence

- VER-001 / AC-001 至 AC-004、AC-006、AC-007：domain/command 聚焦测试、`infrastructure::git_cli::tests` 与真实 bare-origin P0 测试通过；覆盖 local/remote 完整 ref create-from、无自动 tracking、rename/upstream 保留、当前/未合并分支删除拒绝、Publish、tracked Push、unknown remote、FF-only Pull、分叉无 merge、URL userinfo 脱敏和有界错误。
- 显式语义证据：真实仓库设置 `push.default=nothing` 与 `pull.rebase=true` 后测试仍通过；已发布分支重命名后 upstream 保持原远程目标，后续 Push 仍更新显式目标 ref。
- VER-002 / AC-007：Git-purpose session ownership 测试覆盖全部新增 action；显式运行 ignored OpenSSH smoke 通过，在同一真实 SSH Git session 内完成 create-from、rename、安全删除、Publish、tracked Push 与 FF-only Pull。
- VER-003 / AC-005、AC-006、AC-008：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts` 为 50 passed；覆盖菜单、Publish remote 选择、Sync 顺序/部分成功、分支管理、删除确认、running/success/error/耗时、20 条上限、脱敏、Escape/键盘和 compact theme styles。
- VER-004 / AC-001 至 AC-008：`pnpm check` 通过（68 files、625 tests、ESLint、TypeScript、Vite build）；Rust fmt/clippy 通过；`cargo test --all-targets --all-features` 只有既有 macOS/Windows 路径断言失败，排除该单一基线用例后 261 passed、0 failed、4 ignored；`git diff --check` 通过。
- 安全与兼容审计：生产 action/DTO 无 command、args、remote URL、credential 或 force 字段；Push 无 `--force`，删除只用 `branch -d`，Pull 固定 `--ff-only --no-rebase`；依赖与 Workspace schema 无变化，Directory Map 已更新。

## Completion

- REQ-001 至 REQ-008 与 AC-001 至 AC-008 均有直接实现和自动化证据；本机与 SSH 行为闭合，用户批准的 P0 范围完成。
- 操作记录只存在于当前 GitPane 内存并在 target 变化时清空；snapshot 只暴露 remote 名称，不暴露 URL。
- Close：验证完成并于 2026-08-31 无冲突归档。

## Residual Risk

- 第三方 credential helper、真实公网认证失败与网络抖动依赖用户执行环境；实现保持 non-interactive、120 秒超时、8 MiB 输出上限、1200 字符 WebView 错误与 480 字符可见记录限制。
- 仓库既有跨平台断言仍在 macOS 失败：`validate_paths` 使用当前平台 `Path::is_absolute`，未把 `C:/absolute.txt` 识别为绝对路径；该文件位置的旧行为不属于本 change，已隔离并准确报告。

## Next Action

本 P0 change 已完成；merge/rebase/stash、远程删除、force 与 credential 管理继续作为独立 change 评估。
