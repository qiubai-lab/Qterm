---
id: QB-20260903-git-change-list-virtualization
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Git change list virtualization plan

## Requirement

- 实现并验证 spec 中的 REQ-001 至 REQ-004。

## Scope

- 仅调整 Git 更改列表的展示模型、React 展示组件、局部样式、相邻测试与目录索引。
- 后端 snapshot、IPC、刷新编排和 Git mutation 保持不变。

## Affected Files

- `src/git/gitChangeListModel.ts`：固定行虚拟范围纯规则和常量。
- `src/git/GitChangeList.tsx`：共享滚动视口监听、有界行渲染和现有交互适配。
- `src/git/GitPaneSections.tsx`：把更改分组组合委托给新组件。
- `src/git/styles/gitChangeList.css`、`src/git/git.css`：虚拟容器和绝对定位行样式。
- `src/git/GitChangeList.test.tsx`、`src/git/gitChangeListModel.test.ts`：大列表及边界行为保护。
- `src/git/GitPane.basics.test.tsx`、`src/git/GitPane.operations.test.tsx`：复用既有集成回归。
- `docs/qb-spec/DIRECTORY_MAP.md`：登记新的 Git 更改列表展示 owner。

## Design

- 以 `GitChangeList` 为列表展示 owner，使用现有 `.git-change-scroll` 作为唯一滚动容器。
- 超过阈值时，为分组建立总高度占位层，并只绝对定位渲染当前范围；阈值以内沿用普通文档流。
- 虚拟范围由纯模型根据相对视口位置、视口高度、总数、固定行高和 overscan 计算。
- 每个虚拟行使用完整数组索引，保留选择、shift 区间、操作 handler 与 ARIA 集合位置。
- 不添加依赖，不建立第二份 selection/snapshot store，不让 presentation 调用 Tauri。

## Implementation Tasks

- [x] 先添加纯范围模型与 5,000 项列表的失败测试，覆盖 AC-001 至 AC-003。
- [x] 提取 `GitChangeList` 展示组件并接入共享滚动容器 ref。
- [x] 删除 500 项截断，加入固定高度虚拟画布和局部样式。
- [x] 验证阈值以内完整渲染及既有选择、预览、上下文操作不回归。
- [x] 更新 Directory Map，并在实现完成后记录验证证据和自动归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitChangeListModel.test.ts` 验证 5,000 项范围有界；`GitChangeList.test.tsx` 验证 DOM 行数远小于总数。 |
| AC-002 | `GitChangeList.test.tsx` 模拟滚动到底并操作最后一项，断言无旧截断提示。 |
| AC-003 | 组件测试断言 ARIA 全局位置和 handler 收到最后一项；既有 operations 测试保护选择与菜单。 |
| AC-004 | 小列表组件测试、既有 Git Pane 测试、`pnpm check:source-size`、lint/typecheck/build。 |

## Test / Verification

1. `pnpm vitest run src/git/gitChangeListModel.test.ts src/git/GitChangeList.test.tsx`
2. `pnpm vitest run src/git/GitPane.basics.test.tsx src/git/GitPane.operations.test.tsx src/git/gitStyles.test.ts`
3. `pnpm check:source-size`
4. `pnpm check`

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 的 Git 展示模块职责。
- 验证通过后把 spec/plan 与证据归档到 `docs/qb-spec/archive/2026/QB-20260903-git-change-list-virtualization/`。

## Dependencies

- 无外部依赖；使用浏览器滚动事件、`ResizeObserver` 和现有 React/CSS 能力。

## Trigger Signals

- 架构边界：新增独立展示组件和纯展示模型，但不改变领域或 transport 边界。
- 关键行为保护：大列表范围、末尾可达性与全局索引需要先行自动化测试。
- Directory Map：新增稳定能力 owner，需要更新。

## Verification Evidence

- 聚焦：`pnpm vitest run src/git/gitChangeListModel.test.ts src/git/GitChangeList.test.tsx src/git/GitPane.basics.test.tsx src/git/GitPane.operations.test.tsx src/git/gitStyles.test.ts`，67 项通过。
- 尺寸：`pnpm check:source-size` 通过，无 ratchet reminder；`gitShell.css` baseline 随死选择器清理从 879 收紧到 878。
- 完整：`pnpm check` 通过，包含 ESLint、90 个 Vitest 文件/761 项测试、13 个 Node 测试、TypeScript 与 Vite 生产构建。
