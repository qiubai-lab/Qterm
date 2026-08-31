---
id: QB-20260831-git-remote-branches-fetch
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 远程分支与主动获取

## Goal

让 Git Block 的分支列表同时、明确地展示本地分支和 Git 远程跟踪分支，并让用户通过仓库刷新按钮主动获取所有已配置 remote 的最新引用。该能力必须同时适用于本机仓库和 profile-bound SSH 仓库，不得把窗口聚焦等自动快照读取变成隐式网络操作。

## Change Shape

- Type：`feature`，新增远程跟踪分支展示、主动 fetch 和安全签出行为。
- Tier：`strict`，变更核心 Git 分支领域模型、前端 IPC 公共契约和 SSH 固定命令 allowlist，并涉及网络认证与失败恢复。
- Approval：用户于 2026-08-31 明确采纳推荐方案并要求落地 spec、plan 和实现；远程分支点击采用“切换已有跟踪分支，否则创建本地跟踪分支”的推荐语义。
- Related context：替换 `DIRECTORY_MAP.md` 中 Git feature“不提供 Git origin 同步”的旧边界，但不扩展到 pull、push 或 remote 管理。

## Current Behavior

- 本机与 SSH snapshot 都只查询 `refs/heads/`，`GitBranch` 没有稳定的本地/远程种类或完整 ref identity。
- `GitPane` 的刷新、首次加载与窗口聚焦都调用相同的 snapshot 读取；刷新不会运行 `git fetch`。
- 分支弹层只有一个“分支”列表，所有非当前项都会传给现有 `switchBranch`；远程跟踪引用如果直接加入列表会产生歧义或 detached HEAD 风险。
- 当前 `git log --all` 已能为已有引用提供 commit 作者、OID 和摘要元数据；本地分支的 upstream 名称不再作为行尾元数据显示。

## Requirements

- REQ-001：Git snapshot 必须返回稳定区分的本地分支和远程跟踪分支；每项必须包含无歧义的完整 ref identity、显示名称、种类、OID、当前状态和本地分支 upstream。远程符号引用（例如 `origin/HEAD`）不得作为可选分支返回。
- REQ-002：用户点击仓库刷新按钮时，应用必须在目标仓库执行一次有界、非交互式的所有 remote fetch 与 prune，然后基于更新后的 refs 返回同一份 snapshot；fetch 不得 merge、rebase、checkout、更新 submodule 或修改工作树文件。
- REQ-003：首次加载、target/可见性变化、窗口聚焦、重连后的自动刷新和普通 Git mutation 返回快照必须保持 snapshot-only，不得隐式访问 Git remote。手动刷新与自动快照必须使用不同的前端意图和后端 action。
- REQ-004：分支弹层必须在同一个搜索和有界滚动区域中按“本地分支”和“远程分支”分组，显示各组过滤后的数量；本地当前项显示“当前”，其他本地项显示“本地”，远程项显示“远程”。远程名称只作为远程分支行的主名称出现，不重新成为本地分支的行尾 upstream 元数据。
- REQ-005：选择远程分支时，如果已有本地分支跟踪该完整远程 ref，应用必须切换到该本地分支；否则创建并切换一个由 Git 推导名称的本地跟踪分支。现有本地名称冲突、工作区覆盖风险或 Git 拒绝操作时必须失败并保留仓库内容，不得覆盖、重置或进入 detached HEAD。
- REQ-006：本机仓库和 profile-bound SSH 仓库必须提供一致的 snapshot、fetch、分组和远程签出语义。SSH 仓库的 fetch 使用远程主机现有 Git 配置与凭据；凭据不可用、网络失败、超时、权限失败或 session 不可用时必须返回稳定错误，保留最近成功 snapshot，并允许重试。
- REQ-007：本地分支创建/切换、stage/unstage、commit、commit graph、ahead/behind、仓库历史上报、远程 Git session/profile ownership、严格 IPC 输入和现有紧凑元数据显示不得回归。

## Non-Functional Requirements

- NFR-001：本机和 SSH Git adapter 只能执行代码定义的固定 fetch/branch 命令；WebView 不得传入 executable、shell、子命令、参数数组、remote URL 或凭据。
- NFR-002：fetch 使用既有非交互环境、输出上限和专用网络超时；操作期间刷新按钮和分支 mutation 不可重复触发，失败后不得清空仍可用的 snapshot。
- NFR-003：分支弹层遵守 Qterm 紧凑工作台规范：复用 semantic tokens 与现有图标、单一 scroller、可见 focus、键盘导航、文本化种类状态、长名称/元数据截断，并保持核心动作常驻。
- NFR-004：不增加第三方依赖、持久化字段、额外 SSH session 或通用 Git 命令执行入口。

## Observable Acceptance

- AC-001（REQ-001, NFR-001）：领域、DTO 和 parser 测试证明本地/远程 ref 有稳定 kind/ref identity，同名短名称不会碰撞，local upstream 保留，`origin/HEAD` 等 symref 被过滤，严格输入不接受任意命令字段。
- AC-002（REQ-002, REQ-006, NFR-001, NFR-002）：本机真实 Git 测试使用临时 bare remote 证明手动 fetch 能发现新增远程分支、prune 已删除分支并返回更新后的 snapshot；SSH action 使用相同固定 fetch 语义和超时/输出边界。
- AC-003（REQ-002, REQ-003, REQ-006）：GitPane 测试证明首次加载和窗口聚焦只调用 snapshot，点击刷新对本机调用 fetch、对 SSH 调用 `fetch` action；成功应用新 snapshot，失败保留旧 snapshot、显示可重试反馈且不重复报告仓库历史。
- AC-004（REQ-001, REQ-004, NFR-003）：组件和样式测试证明本地/远程分组、过滤后计数、当前/本地/远程文本、搜索、空组处理、自然拼接的 commit 元数据、稳定 key、单一 scroller和键盘行为正确。
- AC-005（REQ-005, REQ-006, NFR-001）：领域/执行器与 GitPane 测试证明远程项选择会切换已有跟踪本地分支或创建跟踪分支；同名冲突和脏工作区失败不覆盖、不 reset、不 detached，SSH 只接收封闭的 track action。
- AC-006（REQ-006, REQ-007, NFR-004）：本机/SSH Git 回归、前端 Git 回归、TypeScript、lint、build、Rust fmt/clippy/tests 和固定命令审计无本次新增失败；ahead/behind 在 fetch snapshot 后更新。

## Behavior Delta

### ADDED

- REQ-001、REQ-004：分支快照和弹层新增远程跟踪分支及明确本地/远程分组。
- REQ-002、REQ-006：仓库刷新新增本机/SSH 主动 fetch-all/prune 能力。
- REQ-005：远程分支选择新增安全创建或复用本地跟踪分支的行为。

### MODIFIED

- REQ-003：刷新按钮由“只重新读取本地状态”改为“主动获取远程后返回快照”；首次加载、聚焦和重连仍保持原有 snapshot-only 行为。
- REQ-006：现有远程 Git action allowlist 增加固定 fetch 和 track-remote-branch action，但继续拒绝任意 shell/参数输入。

## Architecture Boundary Decision

- Boundary Decision：分支 kind/ref identity 和远程跟踪签出语义属于 Git domain；“手动 fetch 后返回 snapshot”属于 application use case；固定命令、Git 输出解析和 SSH channel 属于 infrastructure；手动/自动刷新意图和分组展示属于 Git feature UI。
- Placement：`domain/git.rs` 定义 branch kind/ref identity 和封闭 actions；`GitService`/ports 暴露 fetch 与 track remote branch；本机与 SSH adapter 实现固定命令；commands 只映射严格 DTO；`GitPane` 只编排 intent、busy/error 和展示。
- Model Separation：Rust domain、Tauri DTO 和 TypeScript IPC model 保持显式映射；不从 branch 显示名称反推 kind，不把 SSH target remote 与 Git remote-tracking branch 混为一个概念。
- Tradeoff：不引入独立 remote service、fetch progress stream 或后台调度。当前动作是单仓库、用户触发且返回现有 snapshot，扩展既有 Git port 比增加第二套生命周期更清晰。

## Non-Goals

- 不实现 pull、push、merge、rebase、tag fetch 设置、remote 增删改、认证配置或凭据保存。
- 不在窗口聚焦、启动、重连或定时器中自动 fetch，不增加后台轮询。
- 不提供远程分支删除、重命名、强制签出、强制清理或 detached HEAD 快捷入口。
- 不改变 Workspace schema、Git repository history persistence 或 ConnectionProfile。
- 不增加逐 remote 选择器、fetch 进度流、取消按钮或长期缓存。

## Strict Traceability Seed

- TASK-001（REQ-001, REQ-005, AC-001, AC-005）：先建立 branch kind/ref parser、symref、同名 identity 和远程签出规则失败测试。
- TASK-002（REQ-002, REQ-006, AC-002, AC-005）：建立本机临时 remote fetch/prune 集成测试和 SSH action/allowlist 测试，再实现 domain、ports、service 与两条 adapter。
- TASK-003（REQ-002, REQ-003, REQ-006, AC-003）：建立手动 fetch、自动 snapshot-only、失败保留快照和历史去重前端测试，再接通 IPC 与 GitPane intent。
- TASK-004（REQ-004, NFR-003, AC-004）：建立分组/过滤/计数/可访问性与样式测试，再实现紧凑列表分组和远程行状态。
- TASK-005（REQ-007, AC-006）：完成回归、文档边界更新、验证证据和 conflict-free 归档。
- VER-001（AC-001）：Rust domain/parser/command DTO 与 TypeScript contract tests。
- VER-002（AC-002, AC-005）：本机 Git executor remote fixture tests 与 SSH action/session tests。
- VER-003（AC-003, AC-004, AC-005）：`GitPane.test.tsx` 与 `gitStyles.test.ts` 聚焦前端测试。
- VER-004（AC-001 至 AC-006）：`pnpm check`、Rust fmt/clippy/相关全量 tests、固定命令与 IPC 静态审计、`git diff --check`。

## Risks And Rollback

- 风险：把 fetch 合并进现有 focus refresh 会制造隐式网络流量；必须保留 snapshot-only 自动路径并单独接线手动按钮。
- 风险：`refs/remotes/<remote>/HEAD` 被误列为分支；parser 必须依据完整 ref 和 symref 过滤。
- 风险：本地与远程同名短 ref 产生 React key 或操作歧义；identity 使用完整 ref name。
- 风险：SSH fetch 的 origin 认证发生在远程主机，Qterm Git-purpose SSH 凭据不能替代 origin 凭据；非交互失败必须可恢复并保留旧 snapshot。
- 风险：`fetch --all` 中某个 remote 失败时其他 ref 可能已部分更新；失败不应用新 snapshot，下一次成功 snapshot 以 Git 实际 refs 为事实源。
- 风险：远程签出错误可能创建错误本地分支；只允许完整 remote ref，已有 upstream 优先，Git 冲突即失败。
- Rollback：移除 fetch/track actions 和 branch kind/ref DTO 字段，恢复只查询 `refs/heads/` 与单组列表；不涉及持久化迁移。fetch 只更新标准 remote-tracking refs，代码回滚不需要恢复工作树文件。

## Quality Check

- REQ-001 至 REQ-007 均由 AC-001 至 AC-006 覆盖；主路径、自动/手动差异、失败恢复、SSH parity、symref、冲突、认证和回归均可观察。
- Behavior Delta 明确新增远程跟踪分支、fetch 与 tracking checkout，并说明刷新和 allowlist 的既有行为变化。
- 没有未批准的范围：用户已采纳完整推荐方案，pull/push、后台 fetch 和 remote 管理明确排除。

## Open Issues

- 无阻塞项。首期 fetch 所有 configured remotes；如未来需要按 remote 选择、进度或取消，应建立独立 change。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Completeness：本地/远程 ref 模型、fetch 主路径、自动 snapshot-only 备选路径、SSH origin 认证失败、超时、symref、同名冲突、tracking checkout、回滚与非目标均已定义。
- Consistency：REQ-001 至 REQ-007 均回连 AC-001 至 AC-006；ADDED/MODIFIED Delta 与刷新、allowlist 和分支列表的既有行为一致；strict TASK/VER seed 覆盖领域、adapter、IPC、UI 和完整回归。
- Architecture note：完整 ref identity 和跟踪签出规则必须由 domain/application owner，不允许 commands 或 React 从 `origin/name` 文本猜测；两条 infrastructure adapter 只实现固定命令。
- Critical note：手动 fetch 失败必须保留最近成功 snapshot；`fetch --all` 可能已经部分更新 refs，但失败时不应用新 snapshot，下一次成功读取以 Git 实际 refs 为事实源。
- Non-blocking note：首期不提供逐 remote 选择、进度、取消、pull/push 或后台 fetch，不影响当前验收闭合。
- Next Action：进入 strict plan，并从 branch parser、fetch/prune fixture 和刷新 intent 的失败测试开始。

## Verification Evidence

- VER-001 / AC-001：Rust branch parser/domain/command DTO 与 TypeScript contract 编译通过；完整 ref/kind/upstream ref、symref 过滤、同名 identity、remote ref validation、camelCase action 和 unknown-field rejection 均有直接测试。
- VER-002 / AC-002、AC-005：本机真实 bare origin fixture 覆盖 fetch add/prune、remote HEAD 过滤、behind 更新、tracking branch 复用/创建、同名冲突和工作树不变；SSH session ownership 测试通过，扩展后的真实本机 OpenSSH Git-purpose smoke 也实际运行通过。
- VER-003 / AC-003 至 AC-005：GitPane/style 42 项聚焦测试通过；mount/focus snapshot-only、manual local/SSH fetch、失败保留旧 snapshot、in-flight fetch 防抢占、双分组/过滤计数、remote tracking action、自然元数据和单 scroller 均被覆盖。
- VER-004 / AC-001 至 AC-006：最终 `pnpm check` 通过（68 个测试文件、616 项测试、ESLint、TypeScript、Vite production build）；Rust fmt、clippy、固定命令/严格 IPC 审计和 `git diff --check` 通过。
- Rust 全量门禁只发现既有 macOS/Windows 路径断言：`Path::is_absolute` 在 macOS 不把 `C:/absolute.txt` 视为绝对路径。排除该单一用例后为 258 passed、0 failed、4 ignored；新增 OpenSSH smoke 单独通过。

## Completion

- AC-001 至 AC-006 均由 VER-001 至 VER-004 覆盖；没有本次新增失败、未覆盖 acceptance 或阻塞性澄清。
- `docs/qb-spec/DIRECTORY_MAP.md` 已同步 Git feature、IPC、domain/port、本机 Git 和 Git-purpose SSH 的 fetch/ref/tracking owner，长期边界已从“无 origin sync”收窄为“只允许用户触发的固定 fetch，不提供 pull/push/remote 管理”。
- 实现没有新增依赖、持久化 schema、SSH session、origin 凭据传递、任意命令/参数入口或工作树写入型同步。
- Close：验证完成，change 可于 2026-08-31 无冲突归档。

## Residual Risk

- 未对需要真实第三方 origin 凭据的 HTTPS/SSH 服务做 smoke；稳定非交互失败、旧 snapshot 保留和本机 OpenSSH session 已有自动化证据。
- 多 remote 的 `fetch --all` 可能在整体失败前部分更新 refs；失败不应用新 snapshot，下一次成功读取以 Git refs 为事实源，不提供事务性 remote ref 回滚。
- 仓库既有 `C:/absolute.txt` 跨平台断言仍失败，最小复验为 `cd src-tauri && cargo test domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning --lib`；与本次差异无关。

## Next Action

本 change 已完成实现与验证；pull/push、逐 remote 选择、fetch 进度/取消、后台获取或 remote 管理需要独立评估。
