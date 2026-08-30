---
id: QB-20260831-git-commit-files
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git 图表提交文件列表执行计划

## Requirement

实现 `QB-20260831-git-commit-files` 的 REQ-001 至 REQ-005。

## Scope

包含领域模型与校验、Git CLI 解析、本地/SSH 端口和 DTO、前端懒加载缓存、展开列表样式及自动化测试；不包含文件 diff 或内容读取。

## Affected Files

- `src-tauri/src/domain/git.rs`
- `src-tauri/src/application/git_service.rs`
- `src-tauri/src/ports/git_executor.rs`
- `src-tauri/src/ports/remote_git_executor.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/infrastructure/ssh/client/session.rs`
- `src-tauri/src/infrastructure/ssh/client/network.rs`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/git.ts`
- `src/git/GitPane.tsx`, `src/git/git.css` 及相邻测试

## Design

- `GitCommitFile` 是领域输出；Tauri DTO 与 TypeScript transport 类型保持独立映射。
- `GitExecutor` 和 `RemoteGitExecutor` 分别提供 `commit_files`，应用层统一校验仓库和 OID。
- 适配器使用 `git diff-tree --root --first-parent --no-commit-id --name-status -r -z -M -C`，解析 NUL 分隔状态与路径。
- 前端以 `target + repository + oid` 为缓存键，只在展开时查询；提交内容区拥有滚动和状态显示。
- 遵循 Qterm 紧凑工作台层级与现有主题 token，不引入依赖。

## Implementation Tasks

- [x] 先增加 OID 校验、NUL 状态解析和远程会话控制的回归测试。
- [x] 实现领域模型、本地执行端口和 Git CLI 查询。
- [x] 实现 SSH 会话控制、远程执行端口与 Tauri 命令/DTO。
- [x] 实现 TypeScript IPC、提交展开缓存、重试和只读文件列表。
- [x] 补充布局与主题样式断言并完成分层验证。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | Rust domain/parser/SSH control tests；本地临时仓库集成测试 |
| AC-002 | `GitPane.test.tsx` 验证首次加载、收起复用和仓库隔离键 |
| AC-003 | `GitPane.test.tsx` 验证失败、重试与空结果 |
| AC-004 | Testing Library 内容断言与 `gitStyles.test.ts` 布局/主题契约 |
| AC-005 | 聚焦 Rust tests、前端定向测试、`pnpm check` 和 Rust fmt/clippy/test |

## Test / Verification

1. 运行 Git domain/parser 与 SSH 控制聚焦测试。
2. 运行 `GitPane.test.tsx`、`gitStyles.test.ts`。
3. 运行 `pnpm check`。
4. 在 `src-tauri` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Documentation Updates

验证结果写回 spec；本次不改变目录结构，不更新 Directory Map。
