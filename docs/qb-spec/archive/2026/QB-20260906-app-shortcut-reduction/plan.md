---
id: QB-20260906-app-shortcut-reduction
type: design
tier: standard
status: archived
created: 2026-09-06
updated: 2026-09-06
supersedes: []
---

# Application Shortcut Reduction Plan

## Requirement

实现 `QB-20260906-app-shortcut-reduction` 的 REQ-001 至 REQ-005。

## Scope

只收缩应用级快捷键解析、执行、标签和文档；不触碰 feature-local 与无障碍键盘交互。

## Affected Files

- `src/app/shortcuts.ts`、`src/app/shortcuts.test.ts`
- `src/workspace/WorkspaceShell.tsx`、`src/workspace/WorkspaceShell.test.tsx`
- `src/workspace/WorkspaceTabs.tsx`
- `README.md`

## Design

保持 `src/app/shortcuts.ts` 为应用级快捷键纯规则 owner，`WorkspaceShell` 只负责状态守卫和命令执行。删除命令不会引入新模块、状态或接口；终端及组件键盘处理边界保持不变。

## Implementation Tasks

- [x] 收窄应用快捷键命令、解析与标签。
- [x] 删除 WorkspaceShell 的失效命令执行分支和依赖。
- [x] 清理新建 Workspace 提示与 README 表格。
- [x] 更新解析器和 Shell 聚焦测试，显式保护保留与移除行为。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001, AC-002 | `pnpm vitest run src/app/shortcuts.test.ts src/workspace/WorkspaceShell.test.tsx` |
| AC-003 | `pnpm vitest run src/terminal/TerminalPanel.test.tsx src/files/CodeEditor.test.tsx` 及代码差异检查 |
| AC-004 | README/UI 源码检查与 TypeScript/build gate |

## Test / Verification

先运行快捷键与 Shell 聚焦测试，再运行未变的终端/编辑器相邻测试、`pnpm check:source-size` 和 `pnpm check`。

## Documentation Updates

更新 README 当前快捷键表；不修改历史归档规格或长期架构边界。
