---
id: QB-20260830-git-pane-exclusive-sections
type: feature
tier: standard
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

## Requirement

执行 spec 中的 REQ-001 至 REQ-003。

## Scope

仅调整 Git Pane 的局部展开状态与现有弹性布局，不改变 Git 数据读取、仓库操作或持久化。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/specs/QB-20260830-git-pane-exclusive-sections.md`
- `docs/qb-spec/plans/QB-20260830-git-pane-exclusive-sections.md`

## Design

在 Git Pane 内集中处理“更改 / 图表”的打开转换：目标段从收起变为展开时，将另一段写为收起。保留现有 flex 增长和图表底部自动外边距，使唯一展开段填满可用高度。

## Implementation Tasks

- [x] 在 `GitPane` 增加互斥展开转换，并接入两个段的标题按钮。
- [x] 更新组件测试，覆盖“更改 → 图表 → 更改”的状态序列。
- [x] 扩展样式契约，保护弹性填充与图表底部锚定。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `pnpm vitest run src/git/GitPane.test.tsx` 中的互斥切换测试。 |
| AC-002 | `pnpm vitest run src/git/GitPane.test.tsx` 中的往返切换断言。 |
| AC-003 | `pnpm vitest run src/git/gitStyles.test.ts` 中的布局契约断言。 |

## Test / Verification

1. 运行三个 Git Pane 相关测试文件与 `pnpm typecheck`。
2. 运行 `pnpm check`，覆盖 lint、全量测试和生产构建。

## Documentation Updates

本计划和 spec 已归档到 `docs/qb-spec/archive/2026/QB-20260830-git-pane-exclusive-sections/`。
