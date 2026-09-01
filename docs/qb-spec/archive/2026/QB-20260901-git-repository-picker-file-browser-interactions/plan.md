---
id: QB-20260901-git-repository-picker-file-browser-interactions
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Plan

## Requirement

实现 `QB-20260901-git-repository-picker-file-browser-interactions` 的 REQ-001 至 REQ-005。

## Scope

仅调整 Git feature-local 远程目录选择器及相邻测试、样式；不修改 IPC 或文件管理 Block。

## Affected Files

- `src/git/GitRepositoryPickerDialog.tsx`
- `src/git/GitRepositoryPickerDialog.test.tsx`
- `src/git/styles/gitRepositoryPicker.css`
- `src/git/gitStyles.test.ts`

## Design

- 采用 `FileBrowserPane` 的上级/前进、按需路径编辑、单击选择/双击打开模型。
- 保持 picker 自己的 request epoch、虚拟列表和手工路径 fallback。
- 行状态复用 `--file-active-*` 与 `--file-selection-*` token，核心动作始终可见。

## Implementation Tasks

- [x] 重构 picker 状态和导航函数，加入行选择与按需路径编辑。
- [x] 重构目录行键盘、双击和 ARIA 行为。
- [x] 调整 toolbar、列表、footer 与 responsive/reduced-motion 样式。
- [x] 更新行为和样式契约测试。

## Acceptance To Verification

- AC-001、AC-002、AC-003、AC-004：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx`
- AC-005：`pnpm vitest run src/git/gitStyles.test.ts`，并检查目标 CSS token 与 scrolling contract。
- AC-001 至 AC-005：`pnpm check`

## Test / Verification

先运行 picker 聚焦测试，再运行 Git 样式测试，最后运行仓库前端检查。

## Documentation Updates

本次不改变模块职责或目录结构，无需更新 Directory Map。
