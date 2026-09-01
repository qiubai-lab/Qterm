---
id: QB-20260901-git-change-diff-preview
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
---

# Git 工作区更改差异预览实施计划

## Requirement

执行 spec 的 REQ-001 至 REQ-007：建立 staged/unstaged 语义明确且本地/远程一致的只读内容读取链路，并在 Git 变更列表上提供大尺寸 CodeMirror 差异工作台。

## Affected Areas

- `src-tauri/src/domain/git.rs`、`application/git_service.rs`、Git executor ports
- `src-tauri/src/infrastructure/git_cli.rs` 与 SSH client/session/manager 链路
- `src-tauri/src/commands/git.rs`、`src-tauri/src/lib.rs`
- `src/lib/tauri/git.ts`、`src/git/gitRepositoryClient.ts`
- `src/git/GitPane*.tsx`、`GitPaneSections.tsx`、新增 change preview/editor/styles/tests

## Design

- DTO 返回 `scope`、`beforeSource`、`afterSource`、`path`、`originalPath`、`status` 和两侧 typed version；version kind 为 missing/text/binary/unsupported，包含 size/mode 和可选 content。
- local infrastructure 先由 snapshot 校验选中项，再通过 object id 读取 HEAD/index blob，避免 revision:path 歧义；worktree 使用仓库边界与 symlink 防护读取。
- remote infrastructure 使用 SSH Git 命令读取 HEAD/index 元数据和 blob，unstaged after 通过既有 SFTP session 边界读取；application/command 不包含 shell 或解析逻辑。
- UI 用 `${staged}:${path}` 作为选择 key；每次加载递增 request id，只有最新响应可提交状态。missing 与 text 可转为空文本比较，其余 kind 使用 metadata fallback。
- 更改行使用并列 preview button 与 action button，不创建嵌套交互。工作台复用现有 DialogFrame/StatusBadge/CodeMirror 语言识别，比较组件延迟加载。

## Implementation Tasks

- [x] 先补 domain/CLI 内容选择、transport 映射和前端入口/工作台失败测试。
- [x] 增加 change diff domain model、local/remote ports、application use case 与 Tauri DTO/commands。
- [x] 实现 local HEAD/index/worktree typed reader、snapshot 漂移校验与安全/大小限制。
- [x] 实现 SSH Git object reader、SFTP worktree reader 和 session/manager control 链路。
- [x] 增加 TypeScript IPC/repository client，接入 GitPane session 与语义化 change row。
- [x] 实现只读 comparison、preview dialog、悬浮文件列表、导航、fallback 和 feature-local CSS。
- [x] 运行聚焦前后端回归、完整门禁，记录 evidence 并按 ordinary completion path 归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitPane.operations.test.tsx` 与 change-list interaction regression |
| AC-002 | Rust local executor integration tests、remote command/session tests、TS repository client tests |
| AC-003 | Rust path/kind/size/status-drift focused tests |
| AC-004 | `GitChangePreview.test.tsx`、comparison test、`gitStyles.test.ts` |
| AC-005 | 邻近 Git/conflict tests、`pnpm check`、Rust fmt/clippy/test、`git diff --check` |

## Test / Verification

1. 先运行新 focused tests，确认旧实现缺少入口、command 和内容语义。
2. 分别验证 local CLI、remote session/manager、Tauri DTO、repository client 和 workbench。
3. 运行受影响 GitPane/conflict/editor 邻近测试，确认现有写操作不回归。
4. 执行 `pnpm check`；在 `src-tauri` 执行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`；执行 `git diff --check`。

## Trigger Signals

- Architecture boundary：已触发；按 domain → application → ports → infrastructure → commands → UI 的现有层次实现，不把 Git 语义放入 command/UI。
- Critical behavior：已触发；staged/unstaged、missing/rename、安全路径和 latest-request-wins 先由 focused tests 保护。
- Directory Map：若仅在现有 Git/SSH 目录新增 feature 文件且职责不变，则无需更新；若新增稳定模块边界，完成前刷新。

## Documentation Updates

- spec/plan 已在用户明确采纳并开始实现时设为 `active`。
- 验证通过后补写 evidence/execution result，并由 verification completion 一并归档。

## Execution Result

- 新增 local/remote `change_diff` typed use case，staged 使用 HEAD/index，unstaged 使用 index/worktree；local object id reader 与 remote SSH object/SFTP reader 均保留 literal path、repository boundary、2 MiB 和非文本降级。
- 普通 staged/unstaged change row 已增加独立可访问预览按钮，原 stage/unstage 与 conflict resolver 行为保持不变。
- 新增 1480×920px 只读差异工作台，文件列表默认收起并 absolute 浮层展开，不改变 editor 尺寸；支持同路径双项、列表/前后导航、latest-request-wins、error retry、missing 文本比较和 binary/unsupported fallback。
- 前端聚焦与完整门禁、Rust 聚焦与完整门禁以及 `git diff --check` 均通过；新增文件属于既有 Git/SSH/UI owner，不需要更新 Directory Map。
