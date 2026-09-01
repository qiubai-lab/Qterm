---
id: QB-20260901-git-change-selection-preview-flow
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 更改选择与短文件预览优化计划

## Requirement

实现 REQ-001 至 REQ-005。

## Scope

仅调整 Git 更改列表的选择/预览交互、局部反馈气泡、MergeView 表面样式和相邻回归测试。

## Affected Files

- `src/git/GitPaneSections.tsx`
- `src/git/GitPane.operations.test.tsx`
- `src/git/git.css`
- `src/git/styles/gitChangeSelection.css`
- `src/git/styles/gitChangePreview.css`
- `src/git/styles/gitMedia.css`
- `src/git/gitStyles.test.ts`

## Design

使用点击发生前的选中状态作为二阶段交互判据。未受控的预览列表在组件内保存单项选择，已有多选状态的工作区列表继续由父组件控制。提示气泡通过 portal 固定定位，复用主题浮层 token。预览背景由 MergeView 编辑器容器统一继承 `--editor-background`，行号仍只由 CodeMirror 真实文档行产生。

## Implementation Tasks

- [x] 添加首次选择、再次预览和修饰键保护的行为回归测试。
- [x] 实现受控/未受控更改列表选择与短时提示气泡。
- [x] 补齐短文件 MergeView 全可用区域的主题背景样式和样式契约测试。
- [x] 运行聚焦测试、前端完整检查、手工界面验证和差异检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001、AC-002、AC-003 | `GitPane.operations.test.tsx` 和实际浏览器两阶段点击检查 |
| AC-004 | `gitStyles.test.ts`、`GitChangeComparison.test.tsx` 和实际浏览器计算样式/DOM 检查 |
| AC-005 | Git 聚焦测试与 `pnpm check` |

## Test / Verification

- 聚焦 Vitest：42 项通过。
- 浏览器手工检查：首次/再次点击、气泡位置和短文件空白背景通过。
- `pnpm check`：通过，78 个测试文件、684 项测试。
- `git diff --check`：通过，仅有 LF/CRLF 提示。

## Documentation Updates

不需要 Directory Map 更新；交互延续现有 Qterm 文件选择规范，不新增长期上下文。

