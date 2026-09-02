---
id: QB-20260902-git-submodule-management
type: feature
tier: strict
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git Submodule 首期管理

## Approval

用户于 2026-09-02 明确确认“子仓库”指正式 Git Submodule，并在审阅 draft 后要求继续落地 plan 与开始修改；本规格据此批准并进入实施。

## Goal

让使用本机或 SSH 工作区 Git Block 的用户能够识别父仓库直接登记的 Git Submodule，理解父仓库记录提交、当前检出提交和子仓库内部修改之间的差异，并通过显式、安全的动作初始化、恢复到父仓库记录版本或进入子仓库继续管理，而无需依赖终端辨认含糊的普通文件更改。

## Change Shape

- Type：`feature`，新增用户可见的 Submodule 状态与管理能力，并修正现有 gitlink 被当作普通文件更改的交互语义。
- Tier：`strict`，涉及 Git 核心状态模型、本机与 SSH 固定命令边界、repository-relative pathspec、安全失败与远端网络操作；不涉及 Workspace schema 迁移。
- Affected users：在单仓库或 monorepo 工作区中使用正式 Git Submodule，并希望在 Qterm 内完成日常识别、初始化、回到父仓库记录版本和逐层进入管理的用户。

## Current Evidence

- 本机与 SSH snapshot 都使用 `git status --porcelain=v2 -z --branch --untracked-files=all`，但当前 parser 只解释 `XY`，忽略 ordinary changed entry 的 `<sub>` 字段；因此 `S<c><m><u>` 中的提交变化、已跟踪内容修改和未跟踪内容会被压缩为普通 `M`。
- 当前 Fetch 与 FF-only Pull 显式使用 `--no-recurse-submodules`，不会自动获取或改写 Submodule；本 change 保留该安全边界。
- `GitTarget` 已能表达本机路径或 `profileId + POSIX path`，最近仓库历史也能保存父、子仓库路径；进入子仓库无需扩展 Workspace persistence schema。
- 现有 change diff 与 conflict 规格已将 submodule/gitlink 作为非文本对象处理；本 change 不把它伪装为可编辑正文或文本冲突。

## Scope

- 发现和展示当前父仓库直接登记的一级 Git Submodule，不递归展开后代。
- 区分有效、配置不完整、未初始化、已同步、检出提交不一致、内部已跟踪内容修改、包含未跟踪内容、冲突和状态不可读取。
- 展示 Submodule 名称或路径、父仓库记录提交和当前检出提交；Git OID 只作为短格式次级元数据。
- 允许用户打开某个已初始化 Submodule，并在当前 Git Block 中将它作为独立仓库使用现有更改、提交、分支、同步、图谱与冲突能力。
- 允许用户对单个有效 Submodule 显式执行非递归初始化，以及在安全前提下检出父仓库记录的提交。
- 修正父仓库更改列表中 gitlink 的状态、预览、暂存、取消暂存和丢弃语义。
- 本机与现有 POSIX SSH Git target 保持一致的领域状态、错误和用户可见行为。
- 覆盖状态解析、路径安全、真实本机仓库、固定远端命令、SSH session ownership、界面状态和父子仓库导航的自动化验证。

## Non-Goals

- 不发现或管理未通过 Git Submodule 登记的普通嵌套 `.git` 仓库。
- 不在父仓库视图中递归展示完整 Submodule 树；后代通过打开直接子仓库后逐层查看。
- 不提供 `submodule add`、删除、`deinit`、URL/branch 配置编辑、`absorbgitdirs` 或 `.gitmodules` 表单编辑。
- 不提供 `submodule update --remote`、自动跟踪上游分支、批量 Update All 或递归初始化/更新。
- 父仓库 Fetch、Pull、Sync、分支切换或后台刷新不自动初始化、fetch、checkout 或递归更新 Submodule。
- 不提供 force checkout、自动 stash、自动清理、覆盖子仓库本地修改或自动解决 gitlink 冲突。
- 不向 WebView 暴露 Submodule URL、credential helper 输出、任意 Git command/args、任意 object selector 或远端 shell 内容。
- 不新增 Git 凭据管理；需要网络的初始化沿用执行主机现有的非交互 Git 凭据环境。
- 不修改 Workspace schema，不持久化 Submodule snapshot、busy 状态或操作结果。

## Assumptions And Constraints

- “子仓库”已由用户明确确认为正式 Git Submodule，而非任意嵌套仓库。
- 首期只管理当前仓库的直接 Submodule；逐层 drill-down 是嵌套 Submodule 的唯一首期入口。
- 父仓库 index 中的 `160000` gitlink 与 `.gitmodules` 配置共同构成发现依据；缺少任一侧、重复 path/name、非法 path 或无法解析时必须作为明确的配置问题展示，不能静默忽略或执行 mutation。
- 状态查询必须是只读、非交互、非网络操作，并沿用既有 Git query timeout 与 stdout/stderr 上限。
- 初始化或检出记录版本可以在记录对象缺失时触发 clone/fetch；它必须由用户对单个 Submodule 显式发起，使用既有网络操作 timeout、`GIT_TERMINAL_PROMPT=0` 和脱敏错误边界。
- 所有 Submodule path 都来自当前仓库的受信 snapshot/config 组合，但仍须经过本机或 POSIX repository-relative、无父目录、无 NUL、长度/数量有界的领域校验；Git 必须按 literal pathspec 解释。
- 初始化和检出记录版本都不得使用 `--recursive`、`--remote` 或 `--force`。即使 UI 已判断可执行，底层 Git 仍是防止竞态覆盖本地修改的最终保护。
- 父仓库与子仓库 snapshot 彼此独立；Qterm 不推断两者事务一致，也不把检出提交不同描述为 ahead/behind，除非未来有独立的提交关系查询。
- UI 复用现有 `GitSection`、Icon、操作记录和 file/path row 交互；不引入 manager dialog、新 UI 库、全局 token 或新动画依赖。

## Options Evaluated

### Option A：父仓库一级摘要 + 逐层打开管理（推荐）

- 成本：中等；扩展现有 snapshot/domain/action，并增加一个紧凑 section。
- 复杂度：状态边界清楚，子仓库内部 Git 能力直接复用现有 Git Block。
- 风险：不递归执行 mutation；用户始终知道当前管理的是父仓库还是具体子仓库。
- 维护性：最好；不会复制提交、分支、diff 和冲突工作台。

### Option B：父仓库内递归树 + 批量更新

- 成本：高；需要递归查询、虚拟化、多级选择、部分成功和批量恢复协议。
- 复杂度：远程大仓库的时间、输出、认证与取消边界显著扩大。
- 风险：一次操作可能访问多个不可信 URL、修改大量工作树，并产生难以解释的部分成功。
- 维护性：较差；树状态容易和逐仓库 Git snapshot 重复或漂移。

### Option C：完整 Submodule 配置 CRUD

- 成本：最高；需要安全处理 URL、`.gitmodules` 与 local config 差异、add/remove/deinit 以及跨平台文件系统结果。
- 复杂度：配置修改、index 修改和工作树修改形成多步非事务流程。
- 风险：凭据泄露、删除数据、错误 URL 和失败恢复均超出日常管理首期目标。
- 维护性：适合作为后续独立 change，不应阻塞状态识别与安全 drill-down。

## Recommendation

采用 Option A。把 Submodule 作为父仓库 snapshot 中独立于普通文件的领域对象，同时保留对应 gitlink 在“更改”区的父仓库提交语义。用户需要处理子仓库内部文件时打开该仓库；用户需要让父仓库引用新的子仓库提交时暂存 gitlink；用户需要回到父仓库记录提交时使用独立的“检出记录版本”动作。

## Requirements

- REQ-001：snapshot 必须发现当前仓库直接层级的 Git Submodule，并返回稳定、顺序确定且有界的领域状态；发现过程不得访问网络、修改 config/index/worktree 或递归读取后代。
- REQ-002：每个 Submodule 必须区分父仓库记录 OID、当前检出 OID、是否初始化、提交是否一致，以及内部 tracked modification、untracked content、gitlink conflict 和 unreadable/configuration error；未知状态不得退化为“干净”。
- REQ-003：`.gitmodules` 与 index gitlink 不一致、重复、缺失或 path 非法时必须显示明确的不可操作配置问题；这些记录不得进入初始化、检出或打开动作，且错误详情不得包含 Submodule URL 或执行环境秘密。
- REQ-004：Git Block 必须在“存储库”和“更改”之间提供可折叠的“子仓库 N”区；紧凑行必须显示路径、文本状态、必要的短 OID 和常驻核心动作，并具有明确的 empty/loading/busy/success/error/disabled/focus 状态以及独立滚动边界。
- REQ-005：用户打开已初始化 Submodule 时，当前 Git Block 必须切换到该子仓库的规范根路径，并把父仓库保留在最近仓库历史；本机直接切换，SSH target 在 profile 不变时复用既有 Git-purpose session，不重新请求认证或创建通用 shell channel。
- REQ-006：用户可以对单个有效且未初始化的 Submodule 执行显式初始化；动作必须固定为非递归、非 remote、非 force，并在需要网络时保持非交互、超时、输出有界、错误脱敏和 session ownership 校验。
- REQ-007：用户可以对单个有效 Submodule 显式检出父仓库记录提交；存在内部 tracked/untracked 修改、gitlink conflict、无有效记录 OID 或配置错误时 UI 必须禁用该动作并说明原因，底层命令仍必须使用非 force 语义拒绝竞态覆盖。
- REQ-008：父仓库“更改”区必须将 gitlink 标识为子仓库引用而非普通文本文件，并表达提交不一致、内部修改与未跟踪内容；gitlink diff 只展示元数据，不请求或渲染文件正文。
- REQ-009：只有当前检出 OID 相对父仓库 index 发生变化时，父仓库暂存 gitlink 才能记录新的 Submodule 引用；只有内部未提交修改时，暂存入口必须禁用或引导打开子仓库，不能伪报已暂存。
- REQ-010：gitlink 取消暂存只恢复父仓库 index 引用，不改写子仓库工作树；普通“丢弃更改”不得用于 gitlink，必须由独立“检出记录版本”动作承担，并准确说明它会改变子仓库检出提交但不会删除父仓库。
- REQ-011：父仓库后台刷新、Fetch、FF-only Pull、Sync 和分支操作必须继续保持 `--no-recurse-submodules` 等价行为；任何自动触发路径都不得初始化、fetch、checkout、清理或递归更新 Submodule。
- REQ-012：本机与 POSIX SSH 必须使用相同 Submodule 领域状态与封闭 action DTO；commands 只校验/映射 DTO，application 拥有允许条件，local/SSH adapter 只执行固定命令与解析输出，不得把 shell、process 或第三方类型泄漏到上层。
- REQ-013：每个 Git Block 同时只允许一个前台 Submodule mutation；后台迟到结果不得覆盖 mutation 后 snapshot。超时、断线、目标切换或结果不确定时必须丢弃旧 epoch，尽力重新读取父仓库和 Submodule 状态；无法确认时保留最后快照并标记 stale/失败。
- REQ-014：Submodule snapshot、busy/error 状态和操作结果只存在于当前 Git Block runtime；Workspace 继续只持久化既有 Git target，不升级 schema、不保存 URL、OID 列表、子仓库内容或 session 信息。
- REQ-015：新增界面必须遵守现有 Qterm 紧凑 workbench、主题 token、file/path selection、键盘焦点和 reduced-motion 规则；最短支持窗口中只有 Submodule 列表区域滚动，section header 与核心动作保持可见。

## Primary, Alternate And Recovery Scenarios

1. 父仓库包含一个已初始化且同步的 Submodule：用户看到“已同步”、相同短 OID 和“打开”动作；父仓库更改计数不增加。
2. Submodule 未初始化：用户看到父仓库记录 OID 和“未初始化”，点击初始化后 Qterm 非递归获取并检出记录提交，再刷新父仓库与子仓库状态。
3. 子仓库提交与父仓库 index 不同且内部干净：用户可打开并继续管理，也可暂存 gitlink 记录新引用，或显式检出父仓库记录版本。
4. 子仓库只有未提交 tracked/untracked 内容：父仓库行清楚说明内部修改；暂存 gitlink和检出记录版本不可用，用户通过“打开”进入子仓库处理。
5. gitlink 已暂存后用户取消暂存：父仓库 index 恢复，但子仓库当前检出提交不变，因此对应未暂存 gitlink 状态继续可见。
6. `.gitmodules`/index 不匹配或 path 非法：列表展示配置错误和安全说明，所有 mutation/open 动作禁用；父仓库其他 Git 能力保持可用。
7. 初始化需要凭据但执行主机没有可用的 non-interactive helper：动作失败并显示脱敏错误，不弹出 Qterm Git 凭据输入，不修改其他 Submodule。
8. SSH 初始化期间断线或超时：Qterm 不假定成功或失败；重连后刷新真实状态，旧请求不得覆盖新 target 或后续 mutation。
9. 一级 Submodule 自身还有 Submodule：父仓库不递归展开；用户打开一级仓库后，在新的当前仓库视图看到它的直接子仓库。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002, REQ-003]：parser/domain fixture 覆盖 clean、uninitialized、different commit、tracked modified、untracked、组合状态、conflict、缺失/重复配置和含空格、Unicode、前导短横线的合法路径；状态顺序稳定，非法/超限输入明确失败且查询无网络或 mutation。
- AC-002 [REQ-001, REQ-002, REQ-011]：真实本机父/子仓库测试证明 snapshot 能发现直接 Submodule，但不会列出后代；初始 snapshot、后台刷新、Fetch 与 Pull 均不初始化、fetch 或改变任何 Submodule HEAD/worktree。
- AC-003 [REQ-004, REQ-015]：Testing Library 与样式断言覆盖零项、一项、长列表、长路径、loading/busy/error/disabled/success、折叠、键盘焦点和 reduced-motion；最短窗口中只有列表滚动，核心动作不依赖 hover。
- AC-004 [REQ-005, REQ-014]：本机打开 Submodule 后 Git target 指向其规范仓库根且父仓库进入历史；同 profile SSH 打开 Submodule 时保留 sessionId、不触发新认证，切回父仓库可恢复，Workspace round-trip 仍使用既有 target schema。
- AC-005 [REQ-006, REQ-012]：真实本机 fixture 与 SSH 固定协议测试证明初始化只作用于选中 path，命令不含 `--recursive`、`--remote`、`--force` 或任意用户 command/args；远端继续校验 profile/session ownership、POSIX relative path 和非交互网络边界。
- AC-006 [REQ-007, REQ-013]：干净且提交不一致的 Submodule 可非 force 检出父仓库记录 OID；tracked/untracked dirty、conflict、invalid config 和竞态变脏均不会被覆盖。失败或未知结果后重新查询真实状态，迟到结果不会覆盖更新状态。
- AC-007 [REQ-008, REQ-009, REQ-010]：前端与真实 Git 测试证明 gitlink 行展示 Submodule 语义；提交改变可 stage/unstage，内部 dirty-only 不伪装为可 stage，预览不读取正文，普通 discard 不作用于 gitlink，unstage 不改变子仓库 HEAD。
- AC-008 [REQ-003, REQ-006, REQ-012, REQ-014]：domain/IPC 测试拒绝绝对/父目录/NUL/超限 path、未知字段、URL、command、args、recursive/remote/force 开关和任意 OID；可见错误与操作记录不含 URL userinfo、credential、shell command 或环境输出。
- AC-009 [REQ-011, REQ-013]：并发测试证明后台 snapshot 与 Submodule mutation 保持现有单飞/epoch 规则；前台操作期间相关动作禁用，目标切换、窗口隐藏、断线与重连不会应用旧结果。
- AC-010 [REQ-001 至 REQ-015]：`pnpm check`、Rust fmt、Clippy、完整 Rust 测试和 `git diff --check` 通过；真实本机 Submodule fixture 为常规门禁，POSIX OpenSSH 生命周期 fixture 可按环境保持 ignored 但必须记录运行方式与固定协议替代证据。

## Behavior Delta

### ADDED

- REQ-001 至 REQ-007：Git Block 新增直接 Submodule 发现、状态、紧凑展示、逐层打开、单项初始化和非 force 检出记录版本。
- REQ-012 至 REQ-015：新增本机/SSH 一致的封闭 action、安全恢复、runtime-only 状态与可访问界面约束。

### MODIFIED

- REQ-008：现有普通 `M` gitlink 展示改为可解释的 Submodule 引用状态，继续排除文本正文预览。
- REQ-009：现有逐项 stage 对 gitlink 从无条件普通文件动作改为仅在检出 OID 可形成新父仓库引用时可用；dirty-only Submodule 改为引导进入子仓库。
- REQ-010：现有 unstage/discard 对 gitlink 的含糊行为改为 index-only unstage 与独立、非 force 的“检出记录版本”。
- REQ-011：现有 Fetch/Pull 不递归边界扩展为所有自动刷新、同步和分支路径都不得隐式更新 Submodule。

## Architecture Boundary Decision

- Boundary Decision：Submodule 状态组合、动作允许条件、local/POSIX path 语义和禁止 recursive/remote/force 属于 `domain/git` 与 `application/git_service`；这些规则不得散落在 React、commands 或 executor。
- Placement：local `GitExecutor` 与 `RemoteGitExecutor` 扩展 purpose-specific list/initialize/checkout-recorded 能力；local process 和 SSH fixed command/output parsing 留在各自 infrastructure adapter。Frontend client 只暴露语义方法，`GitPane` 编排 snapshot/epoch，feature-local section 只展示并发出动作。
- Model Separation：Domain `GitSubmodule`、IPC DTO、frontend presentation model、Workspace `GitTarget`、local process args 和 SSH command/channel 保持独立；不以 `.gitmodules` raw config 或 Git CLI output 作为跨层模型。
- Ownership：父仓库拥有 gitlink/index 与 Submodule 摘要；打开后的子仓库拥有其文件、分支和提交操作。Workspace 只拥有当前 target/history，Git-purpose session 继续按 block/profile 拥有连接生命周期。
- Tradeoff：不抽象通用 nested repository/SCM tree，也不重构现有全部 Git action；只增加当前 Submodule 语义所需的窄接口和 feature-local UI。

## Strict Traceability Seed

- TASK-001 [REQ-001, REQ-002, REQ-003, REQ-008]：定义 Submodule domain 状态，扩展 Porcelain v2 `<sub>`、gitlink 与 `.gitmodules`/status 解析，建立有界、确定顺序和配置错误模型。
- TASK-002 [REQ-006, REQ-007, REQ-011, REQ-012, REQ-013]：扩展 application、local/remote ports 与固定 executor 动作，落实 path safety、non-interactive network、no recursive/remote/force、超时和真实状态恢复。
- TASK-003 [REQ-012, REQ-014]：增加严格 local/remote IPC DTO 与 TypeScript client 类型，不改变 Workspace schema 或暴露 URL/command/args/OID selector。
- TASK-004 [REQ-004, REQ-005, REQ-008, REQ-009, REQ-010, REQ-015]：实现紧凑 Submodule section、父仓库 gitlink 语义和父子仓库导航；同 profile remote path 切换复用 Git session。
- TASK-005 [REQ-001 至 REQ-015]：补齐 domain、真实 Git、fixed SSH protocol、frontend、session ownership、race 与全量门禁，完成结构变化后的 Directory Map 更新。
- VER-001 [AC-001, AC-008]：运行 parser/domain/DTO/path 和恶意输入聚焦测试，审计生产 DTO 与命令面不存在 URL、command、args、recursive/remote/force 入口。
- VER-002 [AC-002, AC-005, AC-006, AC-007]：运行真实本机父/子/嵌套 Submodule fixture，验证 read-only snapshot、单项初始化、非 force checkout 与 gitlink 三棵树语义。
- VER-003 [AC-004, AC-005, AC-006, AC-008, AC-009]：运行 SSH fixed protocol/session ownership 测试及可用环境下的 ignored POSIX OpenSSH fixture，验证同 profile session 复用、断线与未知结果恢复。
- VER-004 [AC-003, AC-004, AC-007, AC-009]：运行 Git frontend Testing Library、样式、导航、busy/epoch 和可访问性测试。
- VER-005 [AC-010]：运行 `pnpm check`、Rust fmt、Clippy、完整 Rust tests、`git diff --check`，记录环境型 ignored fixture 与替代证据。

## Risks And Recovery

- Git 状态风险：Porcelain v2 `XY` 与 `<sub>` 表达不同层级，错误合并会让用户误以为内部修改可被父仓库暂存。Domain 必须保留正交字段，UI 不能只显示单个 `M`。
- 配置风险：`.gitmodules` 可损坏、重复或与 index 漂移。发现应展示 union/configuration error，但 mutation 只允许权威匹配且验证通过的 path。
- 路径安全：Submodule path 可能包含空格、Unicode、前导短横线或 pathspec magic。必须使用目标平台语义验证和 literal pathspec，禁止字符串拼接扩大目标。
- 网络风险：初始化可能访问第三方 URL 并出现凭据失败、超时或部分 clone。Qterm 不代理凭据、不显示 URL，并在失败后以 Git 重新查询结果为准。
- 工作树风险：检出记录版本会改变子仓库 HEAD。只允许显式单项、无 dirty/conflict 的非 force 动作；竞态由 Git 最终拒绝，不做自动 stash/clean。
- 性能风险：大型父仓库可能登记大量 Submodule。查询必须使用有界输出和确定性上限，不允许每 15 秒递归 N+1 网络/内容扫描；超限必须显式失败或降级，而非静默漏项。
- 远端风险：POSIX SSH action 经过 shell fixed template。只有 adapter 可进行 POSIX literal encoding，动态 path 不得进入任意 command surface。
- 恢复：mutation 成功状态不能依赖命令返回假设；成功、失败、超时和断线后都尽力读取实际父仓库/Submodule 状态。无法读取时保留最后 snapshot、标记 stale 并允许刷新或重连。

## Compatibility And Rollback

- 普通非 Submodule 仓库、现有 Git target、Workspace schema、最近仓库、分支、同步、diff、冲突和提交图行为保持兼容。
- 已有 parent Fetch/Pull 的 `--no-recurse-submodules` 行为保持不变并获得更广的回归保护。
- 前端可移除 Submodule section 与语义动作而不需要迁移持久化数据；后端可移除新增 DTO/port 方法，既有 GitSnapshot 字段调用方需同步回退。
- 已成功初始化或检出的 Submodule 是用户明确发起的仓库工作树结果，回滚应用代码不自动 deinit、删除或反向 checkout 用户仓库。

## Open Issues

- 无阻塞语义问题。
- 非阻塞后续项：批量/递归 update、`update --remote`、add/remove/deinit、URL/branch 配置与普通嵌套仓库发现均需要独立 change 和新的破坏性/凭据边界评估。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Findings：首期能力、非目标、父/子仓库所有权、gitlink 三棵树语义、本机/SSH 安全边界、失败恢复和 UI 状态均已闭合。逐层 drill-down 与单项非 force mutation 能满足日常管理，同时避免递归和完整 CRUD 的高风险面。
- Traceability：REQ-001 至 REQ-015 均由 AC-001 至 AC-010 覆盖；ADDED/MODIFIED Behavior Delta 与 requirement 一致；TASK-001 至 TASK-005、VER-001 至 VER-005 覆盖 strict 架构、安全、测试、兼容与回滚门禁。
- Notes：具体 Submodule 数量/输出常量沿用并在 plan 中引用 executable limits，不在 spec 复制易漂移数值；真实 POSIX SSH lifecycle 仍允许按环境 ignored，但 fixed protocol 和 session ownership 测试是非环境阻断门禁。
- Next Action：规格已批准并进入实施；按 strict plan 从 Submodule 状态模型、解析与关键行为测试开始。

## Verification Outcome

- Result：`PASS`。REQ-001 至 REQ-015、AC-001 至 AC-010 已完成并由 plan 中 VER-001 至 VER-005 的自动化证据覆盖。
- Implementation：本机与 POSIX SSH 共用直接 Submodule 领域模型；提供单项 initialize 与 checkout-recorded，保持 no recursive/remote/force；GitPane 增加紧凑子仓库区并修正 gitlink 的 stage/unstage/discard/preview 语义；同 profile SSH drill-down 复用既有 Git-purpose session。
- Compatibility：Workspace schema 与持久化格式未改变，普通仓库及既有 Fetch/Pull 的 no-recurse 行为由全量回归继续保护。
- Residual：真实外部 SSH Submodule 凭据生命周期仍依赖可用 OpenSSH 环境；当前使用 fixed-command、session ownership、local real-Git 和敏感错误降级测试作为常规门禁。
