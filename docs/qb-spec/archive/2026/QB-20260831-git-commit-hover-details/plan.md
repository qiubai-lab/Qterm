---
id: QB-20260831-git-commit-hover-details
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git commit 悬停详情与整卡选中态计划

## Requirement

以同 ID spec 的 REQ-001 至 REQ-006、AC-001 至 AC-005 为事实源。

## Scope

- 扩展 commit snapshot 正文元数据，覆盖本地与远程 Git log。
- 增加 feature-local tooltip 定位 helper、React portal 详情浮层和可访问交互。
- 将 commit 信息卡选中态改为主题亮黄整卡填充。
- 不增加 hover 网络请求、托管平台集成、统计计算或新依赖。

## Affected Files

- `src-tauri/src/domain/git.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/commands/git.rs`
- `src/lib/tauri/git.ts`
- `src/git/GitPane.tsx`
- `src/git/gitCommitTooltipPosition.ts` 及测试
- `src/git/git.css`
- 相邻 Git 组件、样式和 Rust parser 测试

## Design

- Architecture：adapter 解析 body → domain model → command DTO → frontend transport；展示状态不下沉到 backend。
- Tooltip：由 GitPane 集中维护 hovered/focused commit 与 anchor refs，portal 到 body，feature-local pure helper 计算位置；tooltip 不接收 pointer event。
- Content：作者首字母标识、作者与精确时间、subject、可选 body、引用/父提交、短 hash；ready file cache 可附加文件数。
- Selection：使用 `--primary-action`/`--primary-action-contrast`，覆盖 card 内所有主要层级；拓扑 rail 保持透明且在容器外。
- Motion：约 140ms opacity/translate/scale，reduced motion 关闭空间动画，reduced transparency 使用 raised surface。

## Implementation Tasks

- [x] 先补 Rust body parser/log-format 测试与 frontend tooltip/position/style 失败测试。
- [x] 沿现有 domain/DTO/transport 边界加入 commit body，并同步本地与远程日志格式。
- [x] 实现 viewport-aware tooltip portal、hover/focus 生命周期及详情内容。
- [x] 实现亮黄整卡选中态和浮层主题/reduced-* 样式。
- [x] 运行聚焦 frontend、Rust、完整前端和 diff 验证，记录视觉限制并归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitPane.test.tsx` hover/focus portal、ARIA、关闭与无原生 title 测试。 |
| AC-002 | `git_cli.rs` parser 测试、GitPane 内容测试与本地/远程 format 静态检查。 |
| AC-003 | `gitCommitTooltipPosition.test.ts` 边界算法测试和 GitPane resize/scroll 行为测试。 |
| AC-004 | `gitStyles.test.ts` 选中 card 全背景与 contrast 样式契约。 |
| AC-005 | 既有 Git 聚焦测试、Rust Git 测试、`pnpm check` 和 `git diff --check`。 |

## Test / Verification

1. `pnpm vitest run src/git/GitPane.test.tsx src/git/gitCommitTooltipPosition.test.ts src/git/gitStyles.test.ts src/git/gitGraph.test.ts`
2. `cargo test infrastructure::git_cli::tests --lib`（在 `src-tauri/`）
3. `pnpm check`
4. `cargo fmt --check`（在 `src-tauri/`）
5. `git diff --check`

## Documentation Updates

- 验证证据写回并归档。
- 不改变目录、模块 ownership 或长期 UI 偏好，不更新 Directory Map/project context。

## Dependencies

- 无外部依赖；Git `%b` 提供正文，现有 snapshot 刷新承载数据。

## Trigger Signals

- Architecture boundary：已检查，保持 domain/DTO/frontend 分层，仅增加稳定字段。
- Critical behavior：触发，parser、popover lifecycle、viewport 几何和选中契约先补测试。
- Directory Map：未触发，新增文件仍位于既有 `src/git` ownership 内。

## Completion Evidence

- Red：初始前端测试分别因缺少 positioning helper、native title、tooltip CSS 和旧 inset selection 失败；Rust 测试因 `GitCommit.body` 不存在而失败。
- Focused frontend：4 个文件、39 项测试通过。
- Focused Rust：Git CLI 7 项测试通过。
- Full frontend：`pnpm check` 通过，65 个测试文件、586 项测试，以及 lint/typecheck/build 全部成功。
- Rust static：clippy（warnings denied）与 rustfmt 通过。
- Rust broad：完整运行发现一个与本次无关的既有 macOS 路径测试失败；跳过该用例后 244 项通过、4 项 ignored。
- Hygiene：`git diff --check` 通过。
