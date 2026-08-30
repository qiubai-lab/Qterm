---
id: QB-20260830-remote-git-management
type: feature
tier: strict
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

# Remote Git Management over SSH Plan

## Background

现有 Git Block 已提供本机仓库的初始化、状态、暂存、提交、本地分支与提交图。此次在保留本机执行路径的前提下，把 Git target 扩展到 Qterm 已保存的 SSH profile 和远端 POSIX 工作目录，并由独立 Git-purpose SSH session 执行受限动作。

## Requirement

- 以规格中的 REQ-001 至 REQ-014 和 AC-001 至 AC-012 为事实源。
- 首期只管理 SSH 服务器文件系统中的工作区仓库，不实现 Git origin fetch/pull/push。
- 本机与远程行为共用 Git domain snapshot/action/parser 语义，但 process lifecycle 与 SSH channel lifecycle 保持分离。

## Non-Goals

- 不实现 diff、clone、fetch、pull、push、remote branch、merge、rebase、stash、discard、分支删除或重命名。
- 不支持远端 Windows/PowerShell，不注入 Terminal session，不部署远端 helper。
- 不重构无关的 Terminal、Files 或 Network 功能。

## Architecture Impact

- Domain：增加 `GitTarget`、远程路径校验和固定 `RemoteGitAction`，保持 Git 行为规则与 transport 无关。
- Application/ports：本机 `GitExecutor` 保持不变；远程动作由受限 port/control 调用，禁止传入 executable、cwd、subcommand 或 args。
- Infrastructure：`SshSessionManager` 新增 `SessionPurpose::Git`，其 run loop 只接受一个有界 Git action；远程 adapter 负责 POSIX literal、stdin、独立 stdout/stderr、exit status、超时与输出上限。
- Transport：Tauri Git DTO 显式区分 local/remote target，远程调用必须同时校验 session purpose 与 profile ownership。
- Frontend：WorkspaceProvider 拥有 `gitRuntimes`、连接 epoch、host-key progress 和关闭语义；GitPane 仅派发 target-aware action。

## Domain Model Impact

- `GitNode.repositoryPath` 替换为 `GitNode.target: unbound | local(path) | remote(profileId, path)`。
- `GitRuntime` 只保留 sessionId、连接状态、host-key prompt、route progress、notice 与 stale 标记，不持久化。
- `RemoteGitAction` 只表达 snapshot/init/stage/unstage/commit/createBranch/switchBranch 的领域输入。

## API Impact

- 新增 Git-purpose SSH connect 命令与 target-aware Git action DTO；现有本机命令可在兼容层内继续工作或收敛到统一入口。
- WebView 无法提交 shell、executable、cwd、subcommand、args 或其他 session owner。

## Database Impact

- Workspace JSON schema 从 v8 升级至 v9。
- v8 Git `repositoryPath` 迁移为 `target: { type: local, path }`，null 迁移为 `{ type: unbound }`。
- v9 不持久化 sessionId、snapshot、stdin、command 或 secret；未知、损坏及敏感文档继续拒绝且不覆盖。

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-002, REQ-012, REQ-013, AC-001, AC-010, AC-011] 在 Rust/TypeScript workspace model、DTO、repository 和 reducer 中落地 `GitTarget` 与 v8→v9 migration；补 round-trip、拒绝与上下文继承测试。
- [x] TASK-002 [depends: TASK-001] [REQ-003, REQ-004, REQ-005, AC-002, AC-003] 增加 `SessionPurpose::Git`、Git session connect、owner 校验、host-key/jump/auth 事件与确定关闭路径。
- [x] TASK-003 [depends: TASK-002] [REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, AC-004, AC-005, AC-006, AC-007, AC-008] 实现 RemoteGitAction、POSIX literal、stdin framing、无 PTY exec、parser 复用、10/60 秒超时、8 MiB 双流限制和稳定错误映射。
- [x] TASK-004 [depends: TASK-001, TASK-002, TASK-003] [REQ-002, REQ-004, REQ-006, REQ-011, REQ-013, REQ-014, AC-001, AC-005, AC-009, AC-011, AC-012] 扩展 WorkspaceProvider、Git Block、目标选择器和 GitPane，使本机/远程/断线/stale 状态及既有三段式能力可用。
- [x] TASK-005 [depends: TASK-001, TASK-002, TASK-003, TASK-004] [REQ-001, REQ-014, AC-001, AC-012] 审计 IPC/UI 范围、更新 Directory Map，并完成 strict 验证。

## Dependencies And Parallel Work

- TASK-002 依赖 Git target/profile ownership 模型；TASK-003 依赖 Git-purpose session control。
- TASK-004 依赖统一 DTO 与 runtime 语义，避免前端先固化错误 transport。
- 本地 Git parser 纯测试和 Workspace migration fixture 可独立开发，但共享当前未提交的本地 Git 功能文件，执行时顺序提交修改以避免覆盖。

## Acceptance To Verification

- VER-001 [AC-001, AC-010, AC-011] Rust workspace repository/DTO 与 TypeScript reducer/gitWindow 测试：验证 v8→v9、remote round-trip、缺失 profile 恢复和上下文继承。
- VER-002 [AC-002, AC-003, AC-007, AC-008] SSH manager/domain/command 测试：验证 Git purpose、profile owner、host-key route、关闭、超时、输出和非法 DTO。
- VER-003 [AC-004, AC-005, AC-006, AC-008] Remote Git adapter 纯测试与可选本地 sshd ignored integration fixture：验证完整 Git 流程、恶意输入、stdin secrecy、断线与未知结果。
- VER-004 [AC-009, AC-011, AC-012] Testing Library + 聚焦样式检查：验证 Local/Remote/Disconnected/Connecting/Failed/Stale、键盘操作和无范围外入口。
- VER-005 [AC-001 至 AC-012] `pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Test Plan

1. 先写 GitTarget migration、remote action validation、POSIX quoting/stdin framing 的失败测试。
2. 实现 Rust domain/session/adapter 后运行对应 `cargo test` 过滤项。
3. 实现 frontend target/runtime 后运行 GitPane、WorkspaceProvider、reducer、LayoutView 与 gitWindow 聚焦 Vitest。
4. 最后按 VER-005 从便宜到昂贵执行完整门禁；本机不具备 sshd 时保留带运行说明的 ignored integration test，并报告残余风险。

## Rollback Plan

- 垂直移除 Git-purpose session、remote command、frontend remote target 入口。
- schema v9 回滚前拒绝静默降级 remote target；用户需删除或转成本机 Git Block 后才能由旧版本读取。
- 本机 Git executor、parser 与现有 Git UI 行为保持可独立保留。

## Risks

- 远端 shell quoting 或 stdin framing 错误可能形成命令注入；恶意 fixture 是阻断性验证。
- mutation 断线时结果未知；UI 必须 stale 并重新 snapshot，不能伪报成功或失败。
- SSH auth/host-key 流程若复制实现会产生安全分叉；必须复用现有 route builder 和 manager。
- 当前本地 Git 功能仍在未提交工作树中；修改必须保留其全部行为与测试。

## Documentation Updates

- 实现完成后更新 `docs/qb-spec/DIRECTORY_MAP.md` 的 Git/SSH/Workspace 边界。
- 验证通过后由 strict completion 流程记录证据并归档 spec/plan。

## Architecture Boundary Check

- Boundary Decision：Git 业务输入与 snapshot/parser 属于 domain/application；本机 process 与远程 SSH channel 各自属于 infrastructure adapter；Tauri command 只做 DTO、ownership 与错误映射；React 不生成命令。
- Model Separation：Workspace `GitTarget`、runtime `GitRuntime`、domain `RemoteGitAction`、IPC DTO 和 russh channel message 保持不同类型。
- Tradeoff：不引入通用 SCM framework，也不把现有 `GitExecutor` 改成包含同步/异步与 local/remote 生命周期的万能接口。

## Critical Behavior Protection

- Coverage Decision：schema、安全输入边界、认证 session ownership、远程 mutation 与断线恢复均属于高风险行为，必须先补失败测试或同步补回归保护。
- Initial Tests：VER-001 至 VER-004 覆盖 migration、DTO deny-unknown-fields、literal/stdin、owner/epoch 与可观察 UI 状态。
- Gap：真实跨平台 client→POSIX sshd 矩阵依赖 CI/本机 sshd；无法自动运行的场景保留 ignored fixture 和明确运行说明。

## Style Context

- 沿用 `qterm-ui-spec.md`：紧凑深色 workbench、既有 `TerminalTargetPicker`、固定 Header 与三段式 Git 内容、显式 loading/error/disabled/stale 状态、核心操作不依赖 hover、最短高度下只让内容区域滚动。

## Trigger Signals

- Architecture boundary：已触发并通过，上述 placement 为实施约束。
- Critical behavior：已触发，TASK-001 至 TASK-003 先建立聚焦自动化保护。
- Directory Map：schema 与 SSH client 新模块构成结构变化，TASK-005 必须更新。

## Verification Evidence

- Result：`PASS WITH RESIDUAL RISK`。TASK-001 至 TASK-005 完成，AC-001 至 AC-012 的自动化与静态门禁通过。
- VER-001：Workspace v8→v9 migration、Local/Remote target round-trip、reducer、上下文继承和缺失 profile 恢复测试通过。
- VER-002：Git-purpose session、profile ownership、关闭路径、严格 IPC DTO 与稳定错误映射测试通过。
- VER-003：Remote action 校验、POSIX literal、NUL pathspec stdin、commit stdin、parser、断线/owner 回归测试通过；完整 init/stage/commit/branch/snapshot 的真实 POSIX sshd fixture 已加入并标记 `ignored`，当前 Windows 主机没有 `/usr/sbin/sshd`，因此本轮未执行该一项环境测试。
- VER-004：GitPane、WorkspaceProvider、WorkspaceShell、LayoutView、reducer 与 gitWindow 聚焦测试均纳入完整前端套件并通过；生产入口仍不包含 diff、fetch、pull、push、merge、rebase、stash 或 discard。
- VER-005：`pnpm check` 通过（63 个测试文件、554 项测试）；`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 与 `cargo test --all-targets --all-features` 通过（236 项通过、4 项环境测试忽略）；`git diff --check` 通过。
- Residual Risk：尚需在带 Git 2.25+ 与 OpenSSH sshd 的 POSIX 测试机运行 ignored fixture，确认真实服务器端 exec 行为；Windows/PowerShell 远端和 Git origin sync 仍明确不在本次范围。
