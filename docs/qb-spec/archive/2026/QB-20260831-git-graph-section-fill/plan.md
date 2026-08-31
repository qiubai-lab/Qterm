---
id: QB-20260831-git-graph-section-fill
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git 图表 section 高度修复计划

## Requirement

以同 ID spec 的 REQ-001 至 REQ-003、AC-001 至 AC-004 为事实源。

## Scope

- 将 graph section grow factor 从 `.75` 修正为 `1`。
- 更新 section 布局回归测试，继续复用全部相邻 Git 测试。
- 不改内部 scroller、commit/file 高度或 section 状态逻辑。

## Affected Files

- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- 当前 change spec / plan

## Design

changes/graph 已由状态逻辑保证互斥展开，因此两个工作区都应使用 `flex-grow: 1`。basis 继续分别保留 160px/140px 作为压缩与切换时的尺寸提示；collapsed 规则继续覆盖为 `0 0 27px`。

## Implementation Tasks

- [x] 先更新 graph section grow 回归断言并确认旧 `.75` 实现失败。
- [x] 将 graph section 改为 `flex: 1 1 140px`。
- [x] 运行聚焦、完整与 diff 验证并记录真实视觉限制。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitStyles.test.ts` 断言 graph `flex: 1 1 140px` 且不再接受 `.75`。 |
| AC-002 | 复用 section order/collapsed/docking 样式契约和 `GitPane.test.tsx` section toggle 行为测试。 |
| AC-003 | 复用全部 Git pane/style/graph 聚焦测试。 |
| AC-004 | 聚焦 Vitest、`pnpm check`、`git diff --check` 与可用视觉检查。 |

## Test / Verification

1. `pnpm vitest run src/git/gitStyles.test.ts`
2. `pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts`
3. `pnpm check`
4. `git diff --check`

## Documentation Updates

- 验证证据写回并归档。
- 不涉及目录或 ownership 变化，不更新 Directory Map。

## Trigger Signals

- Critical behavior：触发，属于重复出现的 layout regression，先写失败测试。
- Architecture boundary / Directory Map：未触发。

## Completion Evidence

- Red：`pnpm vitest run src/git/gitStyles.test.ts` 在旧 `.75` grow contract 上按预期失败。
- Focused：3 个测试文件、33 项测试通过。
- Full：`pnpm check` 通过，64 个测试文件、580 项测试、TypeScript 与 production build 均成功。
- Hygiene：`git diff --check` 通过。
