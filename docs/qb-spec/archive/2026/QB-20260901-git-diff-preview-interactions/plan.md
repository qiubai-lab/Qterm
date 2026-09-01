---
id: QB-20260901-git-diff-preview-interactions
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: ../specs/QB-20260901-git-diff-preview-interactions.md
---

# Git 差异预览显示与触发扩展实施计划

## Requirement

执行 REQ-001 至 REQ-006：修复普通预览状态与行布局，并通过 immutable commit diff use case 把同一工作台扩展到图表文件。

## Affected Areas

- Git domain/application/ports、local CLI、SSH session/manager/client、Tauri commands
- TypeScript Git IPC/repository client
- `GitChangePreview`、`GitPaneSections`、`GitCommitGraph`、`GitPane` 与 feature-local CSS/tests

## Design

- 新增 `GitCommitFileDiff`，包含 commit oid、第一父 oid、path/original/status 和 before/after typed version。
- local/remote 先验证 oid/path，并确认文件属于 `commit_files(oid)`；root before 为 missing，其他使用第一父 tree；after 使用 commit tree。
- preview 内部规范化为 entry 与 presentation detail；loader 存入 ref，effect 只依赖稳定 entry key/reload token，并用 request sequence/cancel 防陈旧响应。
- change row 使用两列：`minmax(0,1fr)` 主按钮 + 尾部 action；commit file row 本身使用 semantic button，占据完整文件行。

## Implementation Tasks

- [x] 先补空白状态、loader 稳定性、整行触发、action 隔离和 commit file preview 测试。
- [x] 实现 commit diff domain/ports/application/local Git tree/blob 读取与实仓测试。
- [x] 实现 SSH commit diff client/session/manager control 与 Tauri/TS transport。
- [x] 规范化预览工作台的两类 context、显式 empty 状态和 stable loader。
- [x] 修复 change row 布局，接入 commit file 整行预览与样式状态。
- [x] 运行聚焦/完整门禁，记录证据并归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitChangePreview.test.tsx` 的状态机、race 与 empty 回归 |
| AC-002 | `GitPane.operations.test.tsx`、`gitStyles.test.ts` |
| AC-003 | `GitPane.graph.test.tsx` 与图表邻近回归 |
| AC-004 | local Git 实仓、remote parser/manager dispatch、command contract tests |
| AC-005 | `pnpm check`、Rust fmt/clippy/test、`git diff --check` |

## Test / Verification

先运行新增前端/Rust focused regression；实现后运行受影响 GitPane、preview、graph、style 测试，再执行仓库标准完整门禁。

## Trigger Signals

- Architecture boundary：触发，commit parent/tree/blob 语义必须留在 domain/infrastructure。
- Critical behavior：触发，空白回归、事件隔离和 immutable commit 基线先用自动化保护。
- Directory Map：预计不触发；新增能力仍位于既有 Git/SSH owner。

## Documentation Updates

验证通过后写入 evidence/execution result，并按 ordinary completion path 归档。

## Execution Result

- 工作区/暂存区和提交图表文件均复用 `GitChangePreview`，主行点击与尾部操作保持独立。
- commit 文件差异由 Rust 选择 first-parent/root baseline，本地与 SSH 使用同一 typed DTO。
- standard tier 全量验证通过；证据记录在关联 spec 的 `Verification Evidence`。
