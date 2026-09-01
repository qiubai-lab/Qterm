---
id: QB-20260901-git-change-preview-content
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 更改预览内容区修复计划

## Requirement

实现 REQ-001 至 REQ-003，恢复 Git 更改预览的可见内容与正确滚动层级。

## Scope

仅修改 Git 更改预览布局样式及其相邻样式契约测试。

## Affected Files

- `src/git/styles/gitChangePreview.css`
- `src/git/gitStyles.test.ts`

## Design

沿用现有 DialogFrame 和 CodeMirror MergeView。让 `.dialog-content` 以 `flex: 1` 占据固定高度弹窗的剩余空间，并保持各可收缩祖先的 `min-height: 0`；文件浮层明确使用纵向 flex。

## Implementation Tasks

- [x] 补充会在缺失内容区 flex 契约时失败的样式回归断言。
- [x] 修复内容区剩余空间分配与文件浮层方向。
- [x] 运行聚焦预览测试和前端完整检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001、AC-002 | `gitStyles.test.ts` 断言内容区 `flex: 1`、stage 可收缩与滚动链；聚焦预览组件测试 |
| AC-003 | `gitStyles.test.ts` 断言文件浮层 `flex-direction: column` 与列表滚动 |
| AC-004 | GitChangePreview、GitPane operations 聚焦 Vitest；`pnpm check` |

## Test / Verification

- `pnpm exec vitest run src/git/GitChangePreview.test.tsx src/git/GitPane.operations.test.tsx src/git/gitStyles.test.ts`：39 项通过。
- `pnpm check`：通过。
- `git diff --check`：通过，仅有 LF/CRLF 提示。

## Documentation Updates

不需要长期项目上下文或 Directory Map 更新。

