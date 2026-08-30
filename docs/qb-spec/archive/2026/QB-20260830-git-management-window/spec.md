---
id: QB-20260830-git-management-window
type: feature
tier: strict
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

# Git Management Window

## Approval

用户于 2026-08-30 明确采纳推荐方案，并要求落地 plan 后开始实现。批准范围包含本机单仓库 MVP、基础 stage/unstage/commit、本地分支创建/切换、提交图，以及 v7 -> v8 Workspace 无损迁移例外。

## Goal

在 Qterm Workspace 中新增一等 `Git` Block，让用户以接近 VS Code 源代码管理视图的三段式信息结构管理一个本机 Git 仓库：顶部识别仓库与当前分支，中部查看和提交工作区更改，底部查看分支/提交图。第一版提供显式仓库初始化和基础本地分支管理，但不提供文件改动 diff。

## Change Shape

- Type：`feature`。它新增用户可见的 Workspace Block、Git 操作与持久化行为。
- Tier：`strict`。变更跨 React Workspace 布局、Tauri IPC、Rust application/domain/infrastructure 边界，并扩展 `workspaces.json` schema；Git mutation、外部进程和既有 Workspace 兼容性需要专项保护。
- Affected users：在 Qterm 内使用本机终端或文件窗口进行项目开发，并希望不切换到外部 Git 客户端完成基础版本管理的用户。

## Current Behavior And Constraints

- Workspace 目前只持久化 `Terminal | Files | Network` 三种 leaf，当前前端文档版本为 schema v7。
- 右侧工具轨的 Files、Network、Terminal 入口会在活动 Block 旁创建新的 Workspace leaf；Git 应沿用此工作台模型，而不是成为遮挡终端的长期 manager dialog。
- Rust 后端遵守 `Frontend -> Tauri Commands -> Application -> Domain / Ports <- Infrastructure`，command 只负责 DTO、稳定错误映射和用例调用。
- Qterm 支持 Windows、macOS 与 Linux；Git 功能不能依赖 shell 文本拼接或某一平台的命令行转义规则。
- 参考图只定义信息层级和密度，不要求复制 VS Code 的颜色、尺寸、图标或扩展架构。Qterm 的主题 token、Block header、按钮、菜单、焦点和滚动规则仍是视觉规范。

## Recommended Scope

### Repository

- 右侧工具轨新增常驻“Git 管理”入口，在活动 Block 旁创建一个 Git Block。
- 一个 Git Block 只绑定一个本机目录/仓库；多个仓库通过多个 Git Block 表达，不在单个 Block 内实现多仓库 manager。
- 活动本机 Files Block 的路径或已连接本机 Terminal 的有效 OSC 7 目录可以作为初始候选；远程 Terminal/Files/Network 不继承为远程 Git 仓库。
- 没有可用本机目录时创建未绑定 Block，用户通过明确的“选择文件夹”动作调用非阻塞系统目录选择器。
- 选定仓库内任意子目录时解析并保存规范化仓库根；目录不是仓库时只显示初始化入口，不自动执行 `git init`。

### Changes

- 以 `Staged Changes`、`Changes` 和冲突状态分组展示 staged、unstaged、untracked、renamed、deleted 与 unmerged 条目。
- 支持单项/全部暂存、单项/全部取消暂存，以及提交已暂存更改。
- 提交要求非空消息；Git user.name/user.email、hook、索引锁或其他失败以稳定错误显示，不能清空消息或伪报成功。
- 文件行不打开 diff；第一版也不提供 discard、amend、stash、冲突编辑器或文件内容预览。

### Graph And Branches

- 图表区域显示最近 100 条本地可达提交的拓扑线、短 hash、subject、author、时间和 branch/tag decoration；无提交时显示稳定空状态。
- 存储库区的分支控件显示当前分支、detached/unborn 状态、upstream 与 ahead/behind 摘要。
- 第一版支持列出本地分支、从当前 HEAD/unborn 分支创建分支、切换本地分支。
- 第一版不支持删除/重命名分支、merge、rebase、cherry-pick、worktree、remote branch、fetch/pull/push 或托管平台集成。

## Non-Goals

- 不查看工作区文件、暂存区文件或历史提交的 diff。
- 不管理远程 SSH 主机上的仓库，也不复用 Terminal session 执行 Git。
- 不克隆仓库、不发布仓库、不配置 remote、credential helper、签名或 Git 用户身份。
- 不替代终端中的完整 Git CLI，不承诺覆盖 VS Code Source Control 的全部能力。
- 不引入通用 SCM provider 插件层；第一版只支持 Git。
- 不持续递归监听整个仓库文件树；第一版在打开/重新聚焦、操作成功和用户刷新时更新。

## Assumptions And Local Exceptions

- “图标”按附件语义解释为底部“图表 / Source Control Graph”。
- “分支管理”在 MVP 中定义为查看、创建和切换本地分支；危险或历史改写操作不在本期范围。
- “参考 VS Code”包含使用用户机器上的 Git 安装这一运行模型；Qterm 不内嵌另一套 Git 语义。
- Git Block 应像其他 Block 一样随 Workspace 恢复。为避免现有 Workspace 数据失效，推荐将 schema 升级为 v8，并对 v7 做一次严格、只添加缺省字段的 v7 -> v8 迁移；这是对长期 context 中“reader 只接受当前 schema”规则的局部兼容性例外，只有用户批准本 spec 后才成立。
- 本机 Git 不可用时保持 Git Block 可用并显示安装/配置提示；不能回退为 shell 字符串执行或前端执行。

## Requirements

- REQ-001：工具轨必须能在活动 Block 旁创建一等 Git Block；只允许继承有效本机 Files 路径或本机 Terminal OSC 7 目录，其他上下文创建未绑定 Block，并允许用户通过非阻塞系统目录选择器绑定本机目录。
- REQ-002：绑定目录后必须识别仓库根；非仓库目录只能在用户明确触发后初始化，初始化不得覆盖文件、自动创建提交或强制指定与用户 Git 配置冲突的默认分支。
- REQ-003：每个 Git Block 必须只拥有一个仓库根并独立刷新；绑定根必须随 Workspace 持久化。根目录缺失、移动、权限不足或不再是仓库时，Block 必须进入可恢复状态并允许重新选择目录。
- REQ-004：存储库区必须展示仓库名/路径、当前 branch 或 detached/unborn 状态、upstream、ahead/behind，并提供常驻刷新、分支选择和更多操作入口。
- REQ-005：分支管理必须支持列出、创建和切换本地分支；切换前后不得自动 discard、stash 或 commit。Git 拒绝切换时保留原分支与工作区，并展示可行动错误。
- REQ-006：更改区必须可靠区分 staged、unstaged、untracked、rename/delete 和 unmerged 状态，支持单项/全部 stage、unstage，以及用非空消息提交已 staged 更改；失败不得丢失提交消息或显示成功状态。
- REQ-007：图表区必须显示最多 100 条本地提交及可辨认的父子拓扑、ref decoration、摘要、作者与时间；空仓库显示空状态，提交行不进入 diff 或提交操作菜单。
- REQ-008：Git Block 必须在首次绑定/恢复、窗口重新聚焦、成功 mutation 和手动刷新时获取新快照；同一 Block 同时最多一个读请求，较旧响应不得覆盖较新 mutation 结果，隐藏 Block 不持续轮询。
- REQ-009：所有 Git 查询和 mutation 必须由 Rust application use case 编排，经窄化 `GitExecutor` port 调用 infrastructure 中的系统 Git CLI adapter；Tauri command 不拥有业务规则，WebView 不能提交任意 executable、cwd、Git 子命令或参数数组。
- REQ-010：Git CLI 必须使用固定 executable 与结构化参数启动，不经 shell；路径参数使用 Git 的 option terminator，读写操作有取消/超时和有界 stdout/stderr，交互式 prompt/editor 被禁用，错误映射为稳定且不泄露无关环境信息的 DTO。
- REQ-011：Git Block 必须使用 Qterm 的 Block header 和暗/亮/Cyberpunk semantic token，形成“存储库 / 更改 / 图表”三段式布局；各段折叠、列表滚动、busy/error/empty/disabled/focus/selected 状态可辨，核心操作不依赖 hover，最短支持窗口高度下只有指定列表区域滚动。
- REQ-012：Workspace persistence 必须升级为可表达 `Git { blockId, repositoryPath }` 的 schema v8，并在读取 v7 时无损迁移既有 Terminal/Files/Network 布局；未知、更旧、未来、损坏或含敏感字段的文档仍按现有安全策略拒绝且不得覆盖源文件。
- REQ-013：第一版必须保持范围边界：不提供 diff、远程仓库、clone、remote 同步、分支删除/重命名、历史改写、stash、discard 或冲突编辑器。

## Non-Functional Requirements

- NFR-001：状态与分支读取默认 10 秒超时，mutation 默认 60 秒超时；超时后终止子进程并使 UI 回到可重试状态。
- NFR-002：单次 Git stdout/stderr 各自有 8 MiB 上限；超过上限返回 `outputTooLarge`，不得把不受限输出送入 WebView。
- NFR-003：更改列表至少在 1,000 条记录下保持可键盘访问且不一次性挂载全部行；图表固定最多 100 条提交。
- NFR-004：仓库状态解析使用 Git 稳定的 machine-readable 输出（如 porcelain v2 与 NUL 分隔），不得解析本地化的人类文本作为正常数据协议。

## Observable Acceptance

- AC-001（REQ-001, REQ-003）：选中带有效 OSC 7 目录的本机 Terminal 或本机 Files 后点击“Git 管理”，在活动 Block 旁创建绑定到其仓库根的 Git Block；远程或无目录上下文创建未绑定 Block，不尝试远程命令。
- AC-002（REQ-001, REQ-002）：选择普通本机目录后显示“初始化存储库”；只有点击确认动作才产生 `.git`，目录内既有文件保持不变，初始化后的 unborn branch 名称遵循系统 Git 行为。
- AC-003（REQ-002, REQ-003, REQ-004）：选择仓库子目录会解析到顶层根；重新启动并加载 Workspace 后恢复相同 Git Block 和仓库。目录被移动后显示可恢复错误并允许重新绑定。
- AC-004（REQ-004, REQ-005）：普通 branch、detached HEAD、unborn branch、有/无 upstream 以及 ahead/behind 均有明确且非仅颜色的表示。
- AC-005（REQ-005）：用户能创建并切换本地分支；存在会被覆盖的未提交更改时，Git 拒绝结果被显示，原分支和更改保持不变。
- AC-006（REQ-006）：包含 staged、unstaged、untracked、rename、delete 和 conflict fixture 的临时仓库被正确分组；单项/全部 stage 与 unstage 后快照一致。
- AC-007（REQ-006）：有 staged 内容与非空消息时可以 commit；空消息、无 staged 内容、身份缺失、hook 失败或索引锁定时不伪报成功，输入消息在失败后仍保留。
- AC-008（REQ-007, REQ-013）：分叉/合并历史显示可辨认拓扑和 ref decoration，最多 100 条；空仓库显示空状态，点击 changed file 或 commit 不打开 diff。
- AC-009（REQ-008）：快速连续刷新与 mutation 的乱序响应测试证明旧 status 不会覆盖新状态；隐藏 Block 不发起周期轮询，窗口重新聚焦会刷新一次。
- AC-010（REQ-009, REQ-010）：IPC 拒绝额外 executable、cwd、subcommand/args 字段；包含空格、引号、前导短横线和 Unicode 的路径/branch/message 不造成 shell 注入或参数错位。
- AC-011（REQ-009, REQ-010, NFR-001, NFR-002, NFR-004）：Git 未安装、safe-directory 拒绝、超时、取消、非零退出和超限输出分别得到稳定错误；进程被回收，UI 可重试，原仓库数据不被 Qterm 清理。
- AC-012（REQ-011, NFR-003）：Dark/Light/Cyberpunk、正常与最短窗口高度、空/长列表、折叠、busy/error/disabled 状态均保持清晰；只有更改与图表列表拥有滚动，键盘焦点、ARIA expanded/selected 与 reduced-motion 生效。
- AC-013（REQ-012）：v7 fixture 迁移为语义等价的 v8 文档且不改写源文件直至正常保存；未知、更旧、未来、损坏和敏感 fixture 继续被拒绝且保持字节不变。
- AC-014（REQ-013）：生产 UI 与 IPC 中不存在 diff、remote sync、clone、delete/rename branch、merge/rebase/cherry-pick、stash、discard 或远程仓库入口。

## Behavior Delta

### ADDED

- REQ-001：Workspace 新增可从工具轨创建的 Git Block。
- REQ-002：本机目录可经明确操作初始化为 Git 仓库。
- REQ-003：Git Block 独立绑定并恢复一个仓库根。
- REQ-004：新增仓库、HEAD 与 upstream 状态视图。
- REQ-005：新增本地分支列出、创建与切换。
- REQ-006：新增更改分组、stage、unstage 与基础 commit。
- REQ-007：新增有界本地提交图。
- REQ-008：新增 Git 快照刷新与竞态保护行为。
- REQ-009：新增 Git application/port/adapter 边界。
- REQ-010：新增受限外部 Git 进程执行契约。
- REQ-011：新增 Qterm 三段式 Git 工作台界面及完整交互状态。

### MODIFIED

- REQ-012：Workspace 从“schema v7 只表达 Terminal/Files/Network”变为“schema v8 额外表达 Git，并无损接收 v7 既有布局”；未知和不安全文档的拒绝不变量保持不变。

## Options Evaluated

### Option A：Rust Git application + 系统 Git CLI adapter + 单仓库 Git Block（推荐）

- 成本：中高。需要新 leaf/schema、Git process adapter、稳定 parser、IPC、GitPane 和跨层测试。
- 复杂度：可分层控制；每个 Block 的 repository path 与 snapshot owner 明确。
- 风险：依赖用户安装 Git，必须处理 GUI 环境 PATH、safe.directory、hook、超时和大输出。
- 维护性：最好。与 VS Code 使用机器 Git 的模型一致，Git CLI 语义、配置、hook 和用户终端保持一致，也为以后扩展 remote 操作保留兼容路径。

### Option B：在 Rust 中引入 libgit2/git2 并内嵌 Git 实现

- 成本：高。增加 native 依赖、跨平台打包、升级与安全审计成本。
- 复杂度：基础 status/branch API 直接，但 credential helper、hook、配置和 CLI 行为兼容会形成第二套 Git 语义。
- 风险：安装包、OpenSSL/libgit2 构建与平台差异扩大；用户在终端和 Qterm 中可能看到不同结果。
- 维护性：对纯离线基础操作尚可，但与未来 fetch/push、签名和 Git 生态集成的兼容成本更高。

### Option C：复用 Terminal/SSH session 执行文本命令，同时支持本机与远程仓库

- 成本：表面低，实际高。无需新 Git native adapter，但必须解析交互 shell、目录、prompt、编码和断线状态。
- 复杂度：Git 业务与终端生命周期耦合，远程命令结果无法形成可靠 machine protocol。
- 风险：命令注入、输出污染、终端关闭、shell 差异和远程权限都会破坏一致性。
- 维护性：最差，不符合现有 Block 独立运行时和 Tauri transport 边界。

## Recommendation

采用 Option A，并把 UI 实现为第四种 Workspace Block，而不是长期模态 manager。系统 Git CLI 与 VS Code 的运行模型一致，也最符合用户在 Qterm 终端与图形界面之间共享同一仓库语义的预期。第一版绑定本机单仓库，保留完整的“仓库 -> 更改/提交 -> 图表/分支”闭环；主动排除 diff 与远程/历史改写能力。

仓库读取建议使用稳定机器协议：`status --porcelain=v2 -z --branch`、`for-each-ref` 的显式字段格式，以及返回 commit/parent/ref 元数据的有界 `log`。前端只负责三段布局、交互状态和由 parent OID 派生的图线；Rust 负责路径、Git 规则、process 生命周期、解析和错误分类。具体命令表、DTO 与文件拆分进入批准后的 plan，不在本 spec 固化为不可调整实现细节。

## Architecture Boundary Decision

- Placement：Git repository/head/change/branch/commit 元数据与输入验证放入 `domain/git`；刷新、初始化、stage/unstage/commit/branch 编排放入 `application/git_service`；系统 executable 发现、进程与 machine-output 解析放入 `infrastructure/git_cli`；`commands/git` 只提供窄 DTO。
- Frontend：`src/git/` 拥有 GitPane、三段布局、快照 reducer 和 feature CSS；`WorkspaceProvider` 只拥有按 blockId 隔离的 runtime 与请求 epoch，`LayoutView` 只装配 leaf，`WorkspaceShell` 只派发工具轨打开策略。
- Model separation：Workspace persistence 只保存 `blockId/repositoryPath`；Git snapshot、process state、commit graph 和错误不持久化。Domain model、IPC DTO 和 CLI parser record 不复用同一 struct。
- Tradeoff：本期不抽象通用 SCM provider，也不把 Git 做成 manager dialog；只有一个实际 provider 和一个仓库/Block，提前泛化会模糊所有权。
- Critical behavior signal：schema 兼容、路径/参数边界、porcelain parser、mutation 失败不丢状态和 refresh 竞态需要 focused automated protection。

## Strict Traceability Seed

- TASK-001（REQ-001, REQ-003, REQ-012）：扩展 Workspace Git leaf、reducer、布局 DTO、schema v8 与 v7 迁移。
- TASK-002（REQ-002, REQ-004 至 REQ-010）：建立 Git domain/application/port/CLI adapter、受限命令表、parser、超时与错误分类。
- TASK-003（REQ-001 至 REQ-010）：新增窄化 Tauri Git commands 与 frontend adapter/runtime，处理取消、epoch 和 mutation 后刷新。
- TASK-004（REQ-004 至 REQ-008, REQ-011, REQ-013）：实现 GitPane 三段式 UI、虚拟列表、分支控件和所有状态。
- TASK-005（REQ-001 至 REQ-013）：补齐 Rust/React/style/integration fixtures、Directory Map 与批准后的 context 候选说明。
- VER-001（AC-002, AC-004 至 AC-011）：Rust domain/application/parser/process 单元测试及临时 Git 仓库集成测试。
- VER-002（AC-001, AC-003, AC-013）：Workspace reducer/DTO/repository schema 与 v7 -> v8 迁移回归。
- VER-003（AC-001, AC-004 至 AC-010, AC-012, AC-014）：Testing Library、纯图线/refresh 规则与 CSS contract 测试。
- VER-004（AC-001 至 AC-014）：`pnpm check`、Rust fmt、strict Clippy、全量 Rust tests、native dialog audit 与 `git diff --check`。
- VER-005（AC-001 至 AC-012）：Windows/macOS/Linux 至少完成 Git executable found/missing、初始化、dirty repo、branch switch、commit、最短窗口高度的桌面人工 smoke matrix；CI 无法覆盖的平台项必须作为明确发布前证据保留。

## Quality Check

- Goal、Scope、Non-Goals、MVP 分支语义和本机边界已明确。
- REQ-001 至 REQ-013 均由 AC-001 至 AC-014 覆盖；Behavior Delta 与新增/修改行为一致。
- 主路径覆盖仓库发现、初始化、状态、stage/unstage、commit、branch 和 graph；备选/错误/恢复覆盖未安装 Git、无效目录、切换冲突、身份/hook/锁错误、超时、大输出、竞态和 schema 兼容。
- NFR 覆盖外部进程、输出协议、性能上限和大列表呈现。
- strict 的 TASK/VER seed 已闭合，详细任务顺序和 AC-to-check matrix 留给批准后的 plan。

## Independent Spec Review

- Result：`PASS WITH NOTES`。规格可以在用户批准后进入 planning，不需要为当前评估追加澄清问题。
- Findings：没有阻塞性语义缺口；本机单仓库、MVP 分支操作、无 diff/remote 的范围均可判断。唯一高影响备注是 REQ-012 的 v7 -> v8 迁移属于现有严格 schema 规则的显式局部例外，必须随本 spec 一并获得用户批准，不能在实现时静默决定。
- Traceability：REQ-001 至 REQ-013 均有 AC 覆盖；AC-001 至 AC-014 均能映射到 VER-001 至 VER-005；Delta 覆盖全部新增行为与唯一兼容性修改，TASK/VER ID 满足 strict seed 要求。
- Risk note：系统 Git executable 的逐平台发现顺序、固定 command allowlist 和 graph lane 算法属于 plan 级实现选择，不改变本 spec 的产品行为，因而不构成当前阻塞项。

## Open Issues

- 无阻塞实现评估的问题。
- 显式范围假设：远程 Git、分支删除/重命名和 remote sync 不属于 MVP；若用户要求其中任一项，本 spec 需要重新评估认证、危险确认、远程 transport 与验收范围。
- 批准本 spec 将同时批准一次 v7 -> v8 Workspace 兼容迁移，作为现有“只接受当前 schema”长期规则的局部例外；不批准则需选择“Git Block 不持久化”或“现有 v7 Workspace 被拒绝”之一，两者均不推荐。

## Next Action

实现与 strict 验证已完成，change 已归档。跨平台桌面人工 smoke 保留为发布前检查，不阻塞本机 MVP 完成。

## Completion Summary

- VER-001：Git domain/DTO/parser/process 聚焦测试 12 项通过；真实临时仓库覆盖 init、stage/unstage、commit、创建/切换分支、切换冲突、身份失败、index lock、超时回收与输出上限。
- VER-002：Workspace v8 DTO、Git leaf round-trip、v5/v6/v7 迁移与不安全文档保留随 Rust 全量回归通过；前端 reducer/LayoutView/WorkspaceShell 回归通过。
- VER-003：前端全量 63 个测试文件、552 项测试通过；覆盖 GitPane 错误保留、空状态、无 diff、stale epoch、上下文打开策略与 fork/merge 拓扑算法。
- VER-004：`pnpm check`、strict Clippy、Rust 全量 227 项通过（3 项既有 OpenSSH 环境测试忽略）、本次 Rust 文件逐项 rustfmt、非阻塞 dialog/范围/任意 IPC 字段审计和 `git diff --check` 通过。仓库级 `cargo fmt --check` 仍被 16 个未修改文件的既有换行风格阻塞，本次文件无格式差异。
- VER-005：本机浏览器工作台 smoke 验证工具入口、Git Block、Git missing 状态与 900×560 无整体溢出；Tauri 原生目录选择和完整数据态由自动化证据覆盖，macOS/Linux 桌面交互留作发布前验证。
