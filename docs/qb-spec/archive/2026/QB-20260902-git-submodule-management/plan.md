---
id: QB-20260902-git-submodule-management
type: feature
tier: strict
status: archived
created: 2026-09-02
updated: 2026-09-02
spec: spec.md
---

# Git Submodule 首期管理实施计划

## Background

现有本机与 POSIX SSH Git Block 已共享 snapshot/action 领域语义，并显式禁止 Fetch/Pull 递归更新 Submodule。Porcelain v2 parser 目前忽略 `<sub>` 状态，导致 gitlink 提交变化、子仓库 tracked modification 与 untracked content 都退化为普通 `M`。本计划在不扩展通用 shell、Workspace schema 或 Git 凭据面的前提下，增加直接 Submodule 状态、逐层打开及两项安全 mutation。

## Requirement

- 以规格 REQ-001 至 REQ-015、AC-001 至 AC-010 和 Behavior Delta 为唯一产品事实源。
- 采用一级摘要与逐层 drill-down；只支持单项初始化和非 force 检出父仓库记录版本。
- 父仓库 gitlink/index 语义与打开后子仓库内部 Git 语义保持分离。

## Non-Goals

- 不实现递归树、批量 update、`update --remote`、add/remove/deinit、URL/branch 配置或普通嵌套仓库发现。
- 不把 Submodule URL、任意 OID、command/args 或 force/recursive 开关加入 IPC。
- 不修改 Workspace schema、Git 凭据、Terminal/Files session 或现有文本 diff/conflict 能力。
- 不为本功能重构通用 SCM framework、通用 manager dialog 或全局样式/token。

## Architecture Impact

- Domain：增加正交 Submodule 状态、配置有效性和 gitlink change metadata；禁止把 CLI raw output 作为上层模型。
- Application/ports：增加 list/initialize/checkout-recorded 的 purpose-specific 方法；service 负责本机/POSIX path 校验和动作允许条件。
- Infrastructure：local process 与 SSH fixed command 分别解析同一受限状态协议；mutation 只接受 repository + snapshot-derived path，并保留 non-interactive、timeout、output 与恢复边界。
- Transport：严格 DTO 增加 Submodule snapshot 字段和封闭 mutation action，不提供 URL、OID selector 或任意命令面。
- Frontend：GitPane 继续拥有 snapshot、busy 与 epoch；feature-local Submodule section 负责展示和动作，Workspace controller 只在同 profile path 切换时保留既有 Git session。

## Domain Model Impact

- `GitSnapshot` 增加按路径稳定排序的直接 `submodules`。
- `GitSubmodule` 区分 name/path、recorded/current OID、initialized、commit changed、tracked modified、untracked、conflict、configuration error 与 readable state。
- `GitChange` 增加可空 Submodule metadata，使父仓库 change action 能区分 gitlink OID 与 child worktree dirtiness。
- 状态模型不计算 ahead/behind，不递归携带子仓库 snapshot，也不持有 URL。

## API Impact

- Local Git commands 增加单项 initialize/checkout-recorded IPC。
- `RemoteGitAction` 增加对应封闭 variants，并沿用 profile/session ownership。
- TypeScript `GitSnapshot`/`GitChange` 增加 Submodule DTO；client hook 暴露语义方法。
- 新 DTO 使用 `deny_unknown_fields`，没有 command、args、url、oid、recursive、remote 或 force 字段。

## Database Impact

- 无。Workspace 继续使用现有 Git target union；Submodule snapshot、OID、busy/error 与 operation record 都是 runtime-only。

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-002, REQ-003, REQ-008, AC-001] 先增加 Porcelain `<sub>`、gitlink/config/status parser 与领域状态失败测试，再实现 `GitSubmodule` 和 `GitChange` metadata；覆盖合法特殊路径、配置漂移、直接层级和确定排序。
- [x] TASK-002 [depends: TASK-001] [REQ-006, REQ-007, REQ-011, REQ-012, REQ-013, AC-002, AC-005, AC-006, AC-008, AC-009] 先增加真实本机与 SSH fixed-protocol 失败测试，再扩展 service/ports/local/remote executor，实现单项 initialize/checkout-recorded、non-interactive network、no recursive/remote/force、dirty guard 与 snapshot recovery。
- [x] TASK-003 [depends: TASK-001, TASK-002] [REQ-012, REQ-014, AC-005, AC-008] 增加严格 Rust IPC DTO、From 映射、Tauri 注册和 TypeScript client/action 类型；加入 unknown-field 与范围审计测试。
- [x] TASK-004 [depends: TASK-003] [REQ-004, REQ-008, REQ-009, REQ-010, REQ-013, REQ-015, AC-003, AC-007, AC-009] 先增加 GitPane/section 失败测试，再实现紧凑 Submodule section、gitlink 专用标签/动作/预览降级、busy/error/focus/scroll/reduced-motion 与操作记录。
- [x] TASK-005 [depends: TASK-003] [REQ-005, REQ-014, AC-004] 增加 Workspace controller/LayoutView 测试并实现父子仓库导航；本机切换 target，同 profile SSH 切换 path 时保留 sessionId，父仓库进入最近历史且 schema 不变。
- [x] TASK-006 [depends: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005] [REQ-001 至 REQ-015, AC-001 至 AC-010] 运行聚焦到完整 strict 验证、审计 Submodule 自动递归与敏感输出边界、更新 Directory Map，并把证据写回 spec/plan 后走普通归档路径。

## Dependencies And Parallel Work

- TASK-002 依赖 TASK-001 的领域状态与 path ownership；TASK-003 依赖稳定 domain/port 形状。
- TASK-004 与 TASK-005 都依赖 transport 类型，但分别修改 Git feature 与 Workspace controller；当前不使用并行 Agent，按共享类型稳定后顺序实施。
- 不新增外部依赖；测试 fixture 使用系统 Git 和现有 tempfile/SSH infrastructure。

## Acceptance To Verification

- VER-001 [AC-001, AC-008] `cargo test submodule --lib` 加 domain/command DTO 审计：覆盖状态组合、配置漂移、路径边界、确定排序、unknown fields 与无 URL/command/args/force surface。
- VER-002 [AC-002, AC-005, AC-006, AC-007] 真实本机 Submodule fixture：覆盖直接/嵌套发现、只读 snapshot、单项 init、干净 checkout-recorded、dirty/conflict 拒绝与 gitlink stage/unstage/discard 语义。
- VER-003 [AC-004, AC-005, AC-006, AC-008, AC-009] SSH fixed command/session ownership 聚焦测试及可用环境下 ignored OpenSSH fixture：覆盖 POSIX path、no recursive/remote/force、同 profile session reuse、断线与未知结果恢复。
- VER-004 [AC-003, AC-004, AC-007, AC-009] `pnpm exec vitest run` 覆盖 GitPane Submodule、gitlink change、Workspace navigation、busy/epoch、long list/scroll/focus/reduced-motion。
- VER-005 [AC-010] `pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、`git diff --check`。

## Test Plan

1. 先让 parser/domain tests 对 `N...`、`S.C.`、`S.M.`、`S..U`、组合状态、`160000`、缺失/重复 config 和异常 path 失败。
2. 实现只读 snapshot 后运行 `cargo test submodule --lib`，确认非 Submodule snapshot 回归不变。
3. 先写真实 local fixture 的 init/checkout/dirty refusal，再实现 executor；同步增加 remote fixed command 与 action validation tests。
4. 完成 DTO 后先跑 Rust Git/command 聚焦测试，再让 frontend types 接入。
5. 先写 GitPane section、gitlink action 与 same-profile navigation tests，再实现组件、Workspace path retarget 和样式。
6. 按 VER-001 至 VER-005 从便宜到昂贵执行；后续修复只重跑被影响的聚焦证据，最终执行完整门禁。

## Verification Evidence

- VER-001 / AC-001, AC-008：`cargo test submodule --lib` 通过，8 项测试覆盖正交状态、配置漂移、Unicode quoted path、dirty-only gitlink 保护、严格 DTO 与敏感 URL 降级。
- VER-002 / AC-002, AC-005, AC-006, AC-007：真实本机 Git fixture 通过；父仓库只列出直接 `modules/child`，不列出 child 的 `deps/grandchild`；Fetch/Pull 不初始化已 deinit 的 child；单项初始化、干净 checkout-recorded、dirty 拒绝、gitlink stage/unstage 与 HEAD 不变均有断言。
- VER-003 / AC-004, AC-005, AC-006, AC-008, AC-009：SSH fixed-command 与 session ownership 测试通过；命令固定为单 path literal、non-recursive、非 remote、非 force，同 profile path retarget 由 frontend controller 测试证明保留 connected Git session。4 项需要本机 OpenSSH 服务的既有 fixture 按环境 ignored，未作为阻断证据。
- VER-004 / AC-003, AC-004, AC-007, AC-009：`pnpm exec vitest run src/git src/workspace/useGitWorkspaceController.test.ts src/workspace/LayoutView.test.tsx` 通过，20 个文件、209 项测试全部成功。
- VER-005 / AC-010：`pnpm check` 通过，82 个 Vitest 文件、733 项测试与 9 项 Node 测试全部成功，TypeScript/Vite production build 成功；`cargo fmt --check`、严格 Clippy 和完整 Rust 测试通过，Rust 结果为 288 passed、4 environment-only ignored；`git diff --check` 通过。Vite 仅报告仓库既有的大 chunk 非阻断 warning。

## Completion

- Acceptance Coverage：AC-001 至 AC-010 全部满足。
- Behavior Delta：REQ-001 至 REQ-007、REQ-012 至 REQ-015 的 ADDED 行为和 REQ-008 至 REQ-011 的 MODIFIED 行为均已实现并验证。
- Documentation：`docs/qb-spec/DIRECTORY_MAP.md` 已同步 Git domain/application/ports、local/SSH adapters、commands、TypeScript IPC、GitPane section 与 Workspace controller 职责。
- Residual Risk：未在当前环境执行真实外部 SSH Submodule 认证生命周期；fixed protocol、session ownership、真实 local Git 与脱敏失败测试覆盖常规阻断边界。未引入 Workspace schema 或持久化迁移。

## Rollback Plan

- 前端移除 Submodule section、metadata 分支和语义动作，恢复普通 GitChange 展示。
- 后端同步移除新增 DTO、ports、RemoteGitAction variants 与 snapshot 字段；不涉及 JSON/schema 回迁。
- 不自动反转用户已显式完成的 init 或 checkout；这些工作树结果留给用户通过 Git/终端处理。
- 保留既有 `--no-recurse-submodules` Fetch/Pull 行为和非 Submodule Git 流程。

## Risks

- `<sub>` 与 `XY` 混淆会导致错误 stage/discard affordance；parser/domain fixture 是阻断门禁。
- `.gitmodules` 与 index 不一致可能诱导错误 path；mutation 必须重新验证当前仓库中的有效登记，而不信任旧前端 OID 或 URL。
- `submodule update --init` 可能访问不可信网络端点；仅用户显式单项触发，禁止回显 URL/凭据并保持 non-interactive。
- same-profile SSH retarget 若误放宽 ownership 可能复用错误连接；仅 profileId 相同且现有 session connected 时保留，其他 target 变化沿用关闭/重连。
- 大量 Submodule 可能放大 15 秒 snapshot 成本；实现必须使用有界、非递归查询并避免 per-submodule 网络或内容扫描。

## Documentation Updates

- TASK-006 更新 `docs/qb-spec/DIRECTORY_MAP.md` 中 domain/application/ports/local/SSH/commands/TypeScript/GitPane/Workspace controller 的新职责。
- 验证证据回写 spec 与 plan；通过后由 `verifying-before-completion` 无冲突归档。

## Architecture Boundary Check

- Boundary Decision：状态组合、动作允许条件与路径语义在 domain/application；CLI/Shell 输出解析和执行在 infrastructure；commands 只做 DTO/ownership/error mapping；React 不生成 Git 命令。
- Placement：只扩展现有 Git purpose-specific files，不新建通用 SCM 或 command builder；feature-local Submodule UI 不进入 shared components。
- Model Separation：domain、IPC、frontend、Workspace target、process args 与 SSH channel 保持独立类型；URL 和 raw output 不越界。
- Tradeoff：snapshot 可携带直接 Submodule 摘要以维持现有单一刷新模型，但禁止递归/N+1 网络查询；具体 parsing strategy 由 executor tests 固定。

## Critical Behavior Protection

- Coverage Decision：状态解析、pathspec、工作树 mutation、SSH command/ownership 和 gitlink 三棵树语义均属于高价值保护，TASK-001/TASK-002/TASK-004/TASK-005 必须先写失败测试。
- Required Coverage：正常、未初始化、dirty、conflict、配置漂移、恶意路径、网络失败、断线/迟到结果、同/异 profile navigation 和非 Submodule 回归。
- Gap：真实 POSIX OpenSSH + 外部 Submodule 网络认证依赖环境；保留 ignored fixture 与运行说明，fixed protocol、local real Git 和 ownership tests 是常规阻断证据。

## Style Context

- 使用 Qterm compact workbench：在存储库与更改之间复用 `GitSection`，采用 file/path row selection tokens，OID 为次级 monospace 元数据，核心动作常驻。
- Submodule 列表独占滚动，所有 shrinking ancestor 设置 `min-height: 0`/`min-width: 0`；header 固定，长路径截断并保留 title/accessible name。
- 状态不只依赖颜色，busy/error/disabled/success 使用文本与 ARIA；仅用短 opacity/color/transform transition，并保留 reduced-motion。

## Trigger Signals

- Architecture boundary：已触发并通过；实施必须保持上述 placement。
- Critical behavior：已触发；先失败测试再改 parser、mutation 和 navigation。
- Directory Map：新增职责与 UI 文件后必须更新。
