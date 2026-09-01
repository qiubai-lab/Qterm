---
id: QB-20260901-git-change-preview-editor-surface
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 更改预览编辑器表面优化计划

## Requirement

实现 REQ-001 至 REQ-003。

## Scope

仅调整 GitChangeComparison 的只读扩展、预览样式和相邻回归测试。

## Affected Files

- `src/git/editor/GitChangeComparison.tsx`
- `src/git/editor/GitChangeComparison.test.tsx`
- `src/git/styles/gitChangePreview.css`
- `src/git/gitStyles.test.ts`

## Design

保留 MergeView 的共享滚动模型，通过预览局部的全高覆盖让 editor/scroller/gutter 延伸到底部；用现有 `codemirror` 包的精简只读配置替代通用 `basicSetup`，不安装活动行和活动 gutter，并在预览局部隐藏绘制光标。

## Implementation Tasks

- [x] 添加短文件全高布局与无重复活动装饰的失败回归测试。
- [x] 精简只读比较扩展并补齐 MergeView 全高链。
- [x] 运行聚焦测试、前端完整检查和差异检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitStyles.test.ts` 断言 MergeView/editor/scroller/gutter 全高链 |
| AC-002、AC-003 | `GitChangeComparison.test.tsx` 使用真实 CodeMirror 验证两个只读 pane、无活动 gutter，并由样式契约验证绘制光标隐藏 |
| AC-004 | GitChangePreview、GitPane operations 聚焦测试与 `pnpm check` |

## Test / Verification

- 聚焦 Vitest：40 项通过。
- `pnpm check`：通过。
- `git diff --check`：通过，仅有 LF/CRLF 提示。

## Documentation Updates

不需要长期项目上下文或 Directory Map 更新。

