---
id: QB-20260901-git-pathspec-safety
tier: strict
status: completed
created: 2026-09-01
updated: 2026-09-01
spec: QB-20260901-git-pathspec-safety-git-pathspec-safety.md
supersedes: []
---

# Git 路径语义与 literal pathspec 实施计划

## Background

实现 `QB-20260901-git-pathspec-safety`：修复 macOS 上固定 Windows 绝对路径断言，并消除 local/SSH path 校验随客户端 OS 漂移及 Git pathspec magic 改写选择范围的风险。

## Requirement

执行 REQ-001 至 REQ-004，保持普通 stage/unstage 行为、列表上限和其他 Git action 兼容。

## Non-Goals

不改变 IPC/前端/schema，不支持非 POSIX SSH shell，不重构通用 Git command builder。

## Architecture Impact

- `domain/git` 提供共享列表形状、本机 repository-relative 与 POSIX repository-relative 校验。
- `application/git_service` 只为本机用例选择本机 validator。
- `RemoteGitAction::validate` 只为 SSH action 选择 POSIX validator。
- local/SSH infrastructure 只在固定 stage/unstage 命令上启用 `--literal-pathspecs`。

## Domain Model Impact

不新增持久化模型或 DTO；把单一、宿主相关的 path validator 拆成两个显式执行语义。

## API Impact

无 IPC 或 port 签名变化。Rust crate 内 validator 名称发生受控调整。

## Database Impact

不适用，无 schema 或数据迁移。

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-002, AC-001, AC-002] 先补 domain 回归测试，覆盖宿主绝对/root/prefix/父目录与稳定 POSIX 语义。
- [x] TASK-002 [depends: TASK-001] [REQ-001, REQ-002, REQ-004] 实现共享结构校验和 local/POSIX validator，并分别接入 application 与 remote action。
- [x] TASK-003 [REQ-003, AC-003] 先补真实 Git literal stage/unstage 测试和 SSH 固定参数断言。
- [x] TASK-004 [depends: TASK-003] [REQ-003] 为 local/SSH 逐路径 stage/unstage 启用 `--literal-pathspecs`，保持参数数组/NUL stdin 边界。
- [x] TASK-005 [depends: TASK-002, TASK-004] [REQ-004, AC-004] 执行格式、Clippy、聚焦和全量 Rust 验证，记录证据并归档。

## Dependencies And Parallel Work

- 无外部依赖。
- domain validator 与 infrastructure literal 参数逻辑相互独立，但共享 Rust 测试门禁；本次按测试先行顺序串行完成。
- 真实 OpenSSH lifecycle 环境不是完成依赖。

## Acceptance To Verification

- VER-001 [AC-001] `cargo test domain::git::tests::local_git_paths_follow_host_repository_relative_semantics --lib`
- VER-002 [AC-002] `cargo test domain::git::tests::remote_git_paths_use_stable_posix_repository_relative_semantics --lib`
- VER-003 [AC-003] `cargo test literal_pathspec --lib` 与 SSH command/payload 单元测试。
- VER-004 [AC-004] `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、`git diff --check`。

## Test Plan

1. 先运行新增 domain 测试并确认旧实现失败。
2. 实现 validator 后重跑 domain 聚焦测试。
3. 先运行真实 Git literal 文件名测试并确认默认 pathspec 行为被捕获，再修改 adapter。
4. 运行 `cargo test literal_pathspec --lib`、完整 domain tests 和相关真实 Git tests。
5. 运行完整 Rust fmt、Clippy、tests 与 diff 检查。

## Rollback Plan

整体回退 domain validator 拆分与 local/SSH `--literal-pathspecs` 参数；无数据迁移、持久状态或依赖需要恢复。

## Risks

- Windows-only prefix/root 形式无法在 macOS 运行时由 `std::path::Path` 模拟；使用 `#[cfg(windows)]` 的目标平台测试补充，跨平台通用验收由宿主原生绝对路径夹具承担。
- Git 版本必须支持现有 SSH 已使用的 `--pathspec-from-file`；`--literal-pathspecs` 是 Git 全局参数，不引入新的版本级能力边界。

## Documentation Updates

- 验证证据写回 spec/plan并按 strict workflow 归档。
- 不发生目录、模块、IPC 或长期工程风格变化，无需刷新 Directory Map 或 project context。
