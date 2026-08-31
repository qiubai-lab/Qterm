---
id: QB-20260831-git-content-containers
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git 存储库与图表内容容器优化执行计划

## Requirement

以同 ID spec 的 REQ-001 至 REQ-005 与 AC-001 至 AC-004 为事实源。

## Scope

- 为存储库主体增加 feature-local 内容卡片。
- 将现有图表滚动面优化为内嵌卡片并收敛提交选中层级。
- 更新 GitPane 结构测试与 Git CSS 契约测试。
- 不改动 Git 行为、IPC、后端或更改列表的独立 group 结构。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/git.css`
- `src/git/GitPane.test.tsx`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/specs/QB-20260831-git-content-containers.md`
- `docs/qb-spec/plans/QB-20260831-git-content-containers.md`

## Design

- Apple Design：以 grouping、material depth 和克制反馈建立层级；当前提交使用中性 surface 与小型语义指示，不增加弹跳或装饰动效。
- Qterm hierarchy：复用 `--surface`、`--raised`、`--subtle`、`--border`、`--text`、`--primary-action` 等现有 token；使用 7px 容器圆角和 7–8px compact gutter。
- Scrolling：`git-graph-scroll` 仍是唯一图表滚动 owner，保留 `flex: 1`、`min-height: 0` 与 `overflow: auto`；容器化不增加嵌套滚动。

## Implementation Tasks

- [x] 在 GitPane 中用 `.git-repository-card` 包裹仓库主行、远程状态与 upstream 信息。
- [x] 在 git.css 中建立存储库卡片和图表卡片的共享层级，调整内部边距、圆角裁切与选中态。
- [x] 补充仓库容器 DOM 断言，以及存储库/图表容器、滚动和选择态的 CSS 契约断言。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitPane.test.tsx` 断言仓库主行位于 `.git-repository-card`；`gitStyles.test.ts` 检查容器 margin、border、radius、background 与 shadow。 |
| AC-002 | `gitStyles.test.ts` 检查图表卡片 margin、border、radius、overflow、scrollbar gutter 及滚动 owner 契约。 |
| AC-003 | `GitPane.test.tsx` 保持 `aria-pressed` 选择行为；`gitStyles.test.ts` 检查中性 surface、leading indicator、主题文字、hover 与 focus。 |
| AC-004 | 运行聚焦 Vitest、完整 `pnpm check` 与 `git diff --check`。 |

## Test / Verification

1. `pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts`
2. `pnpm check`
3. `git diff --check`
4. 在可用的本地 UI 运行态检查真实仓库下的存储库卡片、图表长列表、展开文件和三主题层级；若 Tauri IPC 无法在浏览器态提供真实内容，则明确记录限制并以组件/CSS 契约证据补足。

## Documentation Updates

- 验证结果写回 spec 与 plan，并由 standard completion 流程归档。
- 不新增或移动模块，无需更新 Directory Map。

## Trigger Signals

- Architecture boundary：未触发；仍由 `src/git` 拥有 feature 结构与样式。
- Critical behavior：未触发；仅以相邻组件和样式测试保护既有交互。
- Directory Map：未触发；文件和模块边界不变。

## Verification Evidence

- Result：`PASS`，AC-001 至 AC-004 均有自动化或聚焦手工证据。
- Commands：聚焦 Vitest 31 项通过；`pnpm check` 通过（64 个测试文件、578 项测试，ESLint、TypeScript、Vite build 成功）；`git diff --check` 通过。
- Manual Check：本地 Web 运行态确认 Git Block 外框和空状态无布局回归；真实仓库内容因浏览器态无 Tauri Git IPC，由组件结构和样式契约测试替代。
- Documentation：spec 与 plan 已记录验证证据并归档；Directory Map 无需更新。
