---
id: QB-20260901-git-change-context-actions
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 更改右键操作与暂存区多选计划

## Requirement

实现 REQ-001 至 REQ-005。

## Scope

调整 GitPane 的双列表选择状态、通用更改菜单、GitChangesSection 参数和相邻行为/样式测试；复用现有 stage/unstage/discard client 方法。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/GitPaneSections.tsx`
- `src/git/GitPane.operations.test.tsx`
- `src/git/GitPane.testHarness.tsx`
- `src/git/styles/gitShell.css`
- `src/git/gitStyles.test.ts`

## Design

工作区与暂存区分别保存选择集合及范围锚点。统一的 context menu state 记录来源 scope 与已排序路径；菜单根据 scope 呈现 stage/unstage，并仅在工作区追加危险的 discard。普通与键盘上下文菜单沿用现有定位、焦点和关闭机制。

## Implementation Tasks

- [x] 先添加两区多选、右键范围和批量 API 的失败回归测试。
- [x] 将工作区专用菜单状态泛化为双 scope 更改菜单。
- [x] 为暂存区接入受控选择、范围锚点及上下文菜单。
- [x] 验证既有抛弃、预览、单文件按钮和远程路由。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001、AC-003 | `GitPane.operations.test.tsx` 断言菜单数量及单次批量 stage/unstage 参数 |
| AC-002、AC-004 | Testing Library 验证 ARIA 选择、Ctrl/Shift、Shift+F10、抛弃与预览相邻行为 |
| AC-005 | 本地 mock 与既有远程 client 路由测试、`pnpm check` |

## Test / Verification

- 聚焦 Vitest：GitPane operations 与 gitStyles。
- `pnpm check`。
- `git diff --check`。

## Documentation Updates

不需要 Directory Map 或长期上下文更新；交互继续遵循既有 Qterm Git 文件选择规范。
