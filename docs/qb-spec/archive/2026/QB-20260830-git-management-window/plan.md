---
id: QB-20260830-git-management-window
tier: strict
status: archived
created: 2026-08-30
updated: 2026-08-30
spec: spec.md
---

# Git Management Window Plan

## Background

Qterm 目前以可持久化二叉布局树承载 Terminal、Files 与 Network Block。此次按已批准的 Option A 新增本机单仓库 Git Block，使用系统 Git CLI，通过 Rust 分层边界向 React 提供稳定快照和窄化 mutation API。

## Requirement

实施 spec 的 REQ-001 至 REQ-013，并保持 AC-001 至 AC-014、NFR-001 至 NFR-004 的完整追踪。

## Non-Goals

- 不实现 diff、remote Git、clone/fetch/pull/push、分支删除/重命名、merge/rebase/cherry-pick、stash、discard 或冲突编辑器。
- 不创建通用 SCM provider 框架，不复用 Terminal/SSH session，不经 shell 执行 Git。
- 不把 Git snapshot、commit graph 或 process 状态写入 Workspace persistence。

## Architecture Impact

- 新增 `domain::git` 的稳定输入/输出与校验，`ports::git_executor::GitExecutor` 的受限动作接口，`application::git_service::GitService` 的用例编排，以及 `infrastructure::git_cli::SystemGitExecutor` 的 executable/process/parser 实现。
- 新增 `commands::git` 窄化 Tauri DTO。command 只接受 repository path 与动作必需字段；不接受 executable、任意 cwd、subcommand 或 args。
- 前端新增 `src/git/` feature。`WorkspaceProvider` 只按 blockId 管理 runtime/epoch，`LayoutView` 只装配 GitPane，`WorkspaceShell` 只派发工具轨打开策略。
- `src/workspace/gitWindow.ts` 负责从活动本机 Files/Terminal 上下文推导新 Git leaf；远程或无效上下文创建未绑定 leaf。

## Domain Model Impact

- 新增 Git repository snapshot、head/upstream、change kind/staging state、local branch 和 commit graph record。
- branch name、commit message、repository path 和 Git 输出边界在 Rust 侧验证。
- Workspace `LayoutNode` 新增 `Git { block_id, repository_path }`；document schema 升级到 v8。
- v7 -> v8 只迁移既有 leaf，不制造 Git leaf；旧于 v7、未来、损坏和敏感文档继续拒绝并保持源文件不变。

## API Impact

- 新增 query：Git availability、resolve/bind snapshot、refresh snapshot。
- 新增 mutation：initialize、stage paths/all、unstage paths/all、commit、create branch、switch branch。
- DTO 只返回 UI 所需 metadata 和稳定错误 code，不返回原始环境、任意命令或不受限 stdout/stderr。

## Database Impact

- 无数据库变更。
- `device/workspaces.json` schema v7 -> v8；保存 Git leaf 的 `repositoryPath` 为可空本机路径。
- 回滚时 v8 文件不能被旧 v7 reader 消费，因此回滚前必须备份或移除只含 Git leaf 的 v8 Workspace；不得静默降级或删除用户布局。

## Implementation Tasks

- [x] TASK-001 [REQ-012, AC-013] 先补 Workspace v7 fixture 迁移、Git leaf validation/DTO/repository round-trip 和不安全 fixture 保留测试，再实现 schema v8。
- [x] TASK-002 [REQ-002, REQ-004 至 REQ-010, AC-002, AC-004 至 AC-011] 先建立 Git domain validation、porcelain/branch/log parser、受限 action、超时/输出上限与错误映射测试，再实现 port/application/system CLI adapter。
- [x] TASK-003 [depends: TASK-002] [REQ-009, REQ-010, AC-010, AC-011] 注册窄化 Git commands、组合根 state 与 TypeScript adapter；增加 deny-unknown/arbitrary-command 边界测试。
- [x] TASK-004 [depends: TASK-001] [REQ-001, REQ-003, REQ-008, AC-001, AC-003, AC-009] 扩展前端 Workspace model/reducer/persistence/runtime，新增上下文打开策略和 stale epoch 保护测试。
- [x] TASK-005 [depends: TASK-003, TASK-004] [REQ-004 至 REQ-008, REQ-011, REQ-013, AC-004 至 AC-012, AC-014] 实现 GitPane 三段式 UI、折叠/滚动/状态/虚拟更改列表、分支菜单和提交图；接入 Block header、工具轨、Icon 与主题 CSS。
- [x] TASK-006 [depends: TASK-005] [REQ-001 至 REQ-013, AC-001 至 AC-014] 完成跨层交互测试、临时仓库集成测试、Directory Map 更新与全量验证；记录无法自动化的平台 smoke 缺口。

## Dependencies And Parallel Work

- 系统测试依赖开发机可执行 Git；Git-missing 行为使用受控 executable fixture 覆盖。
- TASK-001 与 TASK-002 文件边界独立，但本次单 agent 顺序执行，避免共享 schema/DTO 设计漂移。
- TASK-003 依赖稳定 application API；TASK-005 依赖 Workspace leaf 与 TypeScript adapter。
- 不新增 libgit2/git2；如异步 child 管理需要，扩展现有 Tokio `process` feature，不引入新的运行时。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001, AC-003 | VER-002、VER-003：Workspace Git leaf、打开策略、恢复/无效路径 UI 测试。 |
| AC-002, AC-004 至 AC-008 | VER-001、VER-003：临时仓库 init/status/stage/commit/branch/log 集成及 GitPane 行为测试。 |
| AC-009 | VER-003：epoch/visibility/focus refresh 纯规则与组件测试。 |
| AC-010, AC-011 | VER-001：Rust 参数边界、特殊路径、missing/safe-directory/timeout/output-limit 错误测试。 |
| AC-012 | VER-003、VER-005：三主题 CSS contract、键盘/ARIA、最短高度与人工桌面检查。 |
| AC-013 | VER-002：v7 -> v8 migration 与拒绝/字节保留 fixture。 |
| AC-014 | VER-003、VER-004：生产源码/API capability search 与全量回归。 |

## Test Plan

- VER-001 [AC-002, AC-004 至 AC-011]：运行 Git domain/application/CLI parser 单元测试及真实临时仓库 integration；覆盖 Unicode、空格、前导短横线、rename/conflict、unborn/detached、switch 拒绝、commit identity/hook、timeout 和 output limit。
- VER-002 [AC-001, AC-003, AC-013]：运行 Rust workspace domain/command/repository tests 与前端 reducer/model/persistence tests，证明 v7 -> v8 语义等价、Git leaf round-trip 和非法文档保留。
- VER-003 [AC-001, AC-004 至 AC-010, AC-012, AC-014]：运行 GitPane、gitWindow、WorkspaceProvider/LayoutView/WorkspaceShell 聚焦 Vitest；检查滚动 owner、虚拟列表、三主题 token、focus/ARIA/reduced-motion 和无 diff/remote actions。
- VER-004 [AC-001 至 AC-014]：依次运行 `pnpm check`、`cargo fmt --check`、strict Clippy、全量 Rust tests、`rg 'blocking_(pick|save)' src-tauri/src/commands`、禁止任意 Git args 的源码审计和 `git diff --check`。
- VER-005 [AC-001 至 AC-012]：在可用桌面环境 smoke 初始化、dirty status、stage/unstage/commit、branch switch、graph、Git missing 和最短高度；缺少 macOS/Linux 交互环境时明确记录为发布前验证项。

## Rollback Plan

- 前端 Git leaf、commands 和 Git modules 可按 feature 垂直切片回退，不触碰仓库内容。
- v8 Workspace 是主要回滚边界：回退前保留 `workspaces.json` 备份；若包含 Git leaf，旧版无法表达，必须让用户选择移除 Git leaf 后另存，而不是自动丢弃。
- Git mutations 使用 Git 自身原子/锁语义；Qterm 不实现自动 rollback commit/branch。失败只刷新真实仓库状态并保留用户输入。

## Risks

- GUI 应用 PATH 可能找不到系统 Git；adapter 必须提供跨平台发现与明确 missing 状态。
- Git hook 可阻塞或失败；child 必须可取消/超时，commit 消息失败后保留。
- 大仓库 status 输出和大列表可能耗时；使用有界输出、最多一个 in-flight query、虚拟列表和显式刷新。
- graph lane 算法易在 merge history 退化；使用 parent OID fixture，不解析人类 ASCII graph。
- v7 -> v8 是已批准的长期 schema 局部例外；不得顺带迁移其他旧 schema。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 记录 Git frontend/application/port/adapter/command 与 Workspace v8 owner。
- 完成后在 spec/plan 记录 VER 证据；是否把 Git Block 与 v7 migration 例外提升到长期 PRODUCT/ARCHITECTURE context，须在归档后另行取得用户批准。

## Style Context

- GitPane 使用现有 Qterm Block header、semantic tokens、Icon stroke、紧凑控件和短 motion；不复制 VS Code 色板或增加 UI/图标/动画依赖。
- 三段区域明确滚动 owner，每个 shrink ancestor 设置 `min-height: 0`；核心动作常驻，条件反馈使用稳定预留区。
- Dark/Light/Cyberpunk、focus-visible、ARIA expanded/selected、reduced-motion/reduced-transparency 均进入 VER-003/VER-005。

## Trigger Signals

- Architecture boundary：已触发；实现必须保持 domain/DTO/parser/persistence model 分离。
- Critical behavior：已触发；TASK-001/TASK-002/TASK-004 先补失败测试或边界保护。
- Directory Map：新增 feature 与 Rust modules，完成实现后必须更新。

## Verification Evidence

- VER-001：`cargo test git --all-targets --all-features` 12 项通过；覆盖严格输入 DTO、porcelain v2、rename/conflict/unborn、branch/log、真实 init/stage/unstage/commit/branch、切换冲突、身份失败、index lock、safe-directory、超时与输出上限。
- VER-002：Rust 全量回归 227 项通过、3 项既有 OpenSSH 环境测试忽略；Workspace v8、Git leaf、迁移和源文件保留测试均通过。
- VER-003：`pnpm check` 通过，包含 ESLint、63 个 Vitest 文件/552 项测试、TypeScript 和 Vite production build；GitPane、打开策略、Workspace leaf、stale response 与拓扑算法均有直接覆盖。
- VER-004：strict Clippy 通过；本次 Rust 文件 `rustfmt --check --config skip_children=true`、`git diff --check`、非阻塞 dialog、无范围外 action 与无任意 Git IPC 字段审计通过。全仓 `cargo fmt --check` 仅被 16 个未修改文件的既有 newline style 阻塞。
- VER-005：浏览器工作台 smoke 验证 Git 工具入口、Block 分屏、Git missing 恢复态和 900×560 无整体滚动；Tauri 原生数据态与 Git mutation 使用组件测试和真实临时仓库集成替代。

## Acceptance Coverage

- AC-001 至 AC-014：均由 VER-001 至 VER-005 覆盖，无阻塞验收项。
- 自动化不能替代的 macOS/Linux executable discovery、原生目录选择器和三主题逐像素桌面检查保留为发布前 smoke，不影响已实现的本机行为契约。

## Completion

- Result：completed and archived。
- Documentation：`docs/qb-spec/DIRECTORY_MAP.md` 已更新 Git frontend/application/port/command/CLI adapter 与 Workspace v8 owner。
- Residual risk：大规模真实仓库性能与 macOS/Linux GUI PATH 差异仍需发布矩阵验证；本次未引入新依赖或打包配置，因此未运行 `pnpm tauri build`。
