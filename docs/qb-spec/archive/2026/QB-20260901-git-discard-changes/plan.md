---
id: QB-20260901-git-discard-changes
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 变更多选与抛弃实施计划

## Requirement

实现 REQ-001 至 REQ-006。

## Scope

调整 Git 变更列表、Git 前端客户端契约、应用服务、domain action、Tauri DTO、本地 Git CLI 和远程 SSH Git runner；不扩展通用 shell 或冲突处理能力。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/GitPaneSections.tsx`
- `src/git/gitRepositoryClient.ts`
- `src/git/styles/gitShell.css`
- `src/git/GitPane.operations.test.tsx`
- `src/git/gitStyles.test.ts`
- `src/lib/tauri/git.ts`
- `src-tauri/src/domain/git.rs`
- `src-tauri/src/application/git_service.rs`
- `src-tauri/src/ports/git_executor.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`

## Design

- 前端只拥有选择、菜单、确认与反馈；discard 资格和路径分类由后端基于最新 snapshot 决定。
- domain 保持封闭 `Discard` action 与路径验证；application 仅编排端口。
- 本地/远程适配器复用相同 snapshot 语义，将 tracked、untracked 和 rename 计划转换为固定 Git 操作，不接受前端命令片段。
- 使用现有 DialogFrame、Button、Icon、Git 浮层材料和 token，不引入 UI 依赖。

## Implementation Tasks

- [x] 先添加领域验证、本地真实仓库和前端选择/确认失败测试。
- [x] 添加本地与远程 discard action、IPC 和客户端适配。
- [x] 添加变更选择模型、上下文菜单、二次确认和选择收敛。
- [x] 修复文件名网格对齐并添加样式契约。
- [x] 运行聚焦测试、`pnpm check`、Rust fmt/clippy/test 和差异检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitStyles.test.ts` 的路径左对齐与尾部列契约 |
| AC-002、AC-003、AC-005 | `GitPane.operations.test.tsx` 的多选、菜单、确认、取消、忙碌和收敛行为 |
| AC-004 | `domain::git` 验证测试、`git_cli` 真实临时仓库测试及远程 action/runner 测试 |
| AC-006 | 聚焦 Vitest、`pnpm check`、cargo fmt/clippy/test 与 `git diff --check` |

## Test / Verification

- GitPane operations/styles 聚焦测试：36 项通过。
- Rust discard 聚焦测试：2 项通过。
- `pnpm check`：通过，78 个测试文件、679 项测试及构建完成。
- `cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test --all-targets --all-features`：268 项通过，4 项忽略；4 项未改动测试受 Windows 配置目录或既有 CRLF fixture 影响失败。
- `cargo fmt --check`：本 change 文件格式符合，命令被未改动 Rust 文件的既有 CRLF newline style 阻塞。
- `git diff --check`：通过；用户同期的 Git preview 工作树修改保持不变。

## Documentation Updates

记录验证证据并在成功后归档本 change；不需要更新 Directory Map 或长期 UI/工程上下文。
