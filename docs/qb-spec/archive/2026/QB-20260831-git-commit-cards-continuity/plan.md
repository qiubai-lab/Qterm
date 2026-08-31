---
id: QB-20260831-git-commit-cards-continuity
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git commit 卡片与展开轨道连续性执行计划

## Requirement

以同 ID spec 的 REQ-001 至 REQ-006 与 AC-001 至 AC-004 为事实源。

## Scope

- commit 独立卡片、透明图表滚动列表、VS Code 式内嵌文件树。
- 图表行派生 `continuingLanes`，详情区渲染全高 continuation rail。
- 更新纯拓扑、组件行为和 CSS 契约测试。
- 不改动后端、IPC、缓存与 Git 操作行为。

## Affected Files

- `src/git/gitGraph.ts`
- `src/git/gitGraph.test.ts`
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/specs/QB-20260831-git-commit-cards-continuity.md`
- `docs/qb-spec/plans/QB-20260831-git-commit-cards-continuity.md`

## Design

- Topology：由纯函数输出 `continuingLanes`，详情 rail 使用与 commit row 相同的 `laneGap=11` 和 x 偏移，避免 CSS 猜测 lane。
- Layout：`.git-graph-scroll` 继续是唯一 scroller；`.git-commit-card` 内部由 header 与可选 details 组成，details 两列 grid 的左列随右侧文件列表自然增高；卡片间距由 5px bridge rail 占据以保持拓扑连续。
- Qterm/VS Code hierarchy：每个 commit 用 subtle border 与 raised/surface 分组；文件名单行主强调、目录与来源弱化、状态尾对齐，保持紧凑工作台密度。

## Implementation Tasks

- [x] 先补 `continuingLanes` 的线性与 merge/fork 纯函数测试，以及展开详情 continuation DOM 回归测试。
- [x] 在 `gitGraph.ts` 输出存活 lane，并在 GitPane 中统一 rail 尺寸、渲染详情 continuation SVG。
- [x] 重构图表 CSS 为 commit 独立卡片与 VS Code 式文件树，保留外层唯一滚动与 reduced motion。
- [x] 更新样式契约并完成聚焦、完整与视觉验证。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitStyles.test.ts` 检查透明 scroller、commit card border/radius/surface/overflow 与 5px bridge。 |
| AC-002 | `GitPane.test.tsx` 验证 details 与文件内容位于 commit entry；样式契约验证单行 path/status 层级；现有加载、空态、重试继续通过。 |
| AC-003 | `gitGraph.test.ts` 验证线性、merge/fork `continuingLanes`；`GitPane.test.tsx` 验证展开提交的 continuation line 数量。 |
| AC-004 | 运行 Git 聚焦 Vitest、完整 `pnpm check`、`git diff --check` 与可用本地视觉检查。 |

## Test / Verification

1. 先运行新增聚焦测试并确认在实现前因缺少 continuation contract 失败。
2. `pnpm vitest run src/git/gitGraph.test.ts src/git/GitPane.test.tsx src/git/gitStyles.test.ts`
3. `pnpm check`
4. `git diff --check`
5. 在可用运行态检查多 commit、展开多文件、长路径及短视口；若 Web 预览仍缺少 Tauri Git IPC，则记录限制并以真实用户截图、DOM 和 CSS 契约补足。

## Documentation Updates

- 验证结果写回 spec/plan 并按 standard 流程归档。
- 不新增模块或改变 ownership，无需更新 Directory Map。

## Trigger Signals

- Architecture boundary：未触发；纯拓扑派生和展示仍由 `src/git` owning。
- Critical behavior：已触发；拓扑连接连续性难以手工稳定保证，先添加线性、merge/fork 与展开 DOM 回归保护。
- Directory Map：未触发；无模块或入口变化。

## Verification Evidence

- Result：`PASS`，AC-001 至 AC-004 均有自动化证据。
- Critical Behavior Protection：实现前新增线性、merge/fork `continuingLanes` 与双 lane 展开 DOM 测试并确认失败；实现后全部通过，无自动化缺口。
- Commands：聚焦 Vitest 32 项通过；`pnpm check` 通过（64 个测试文件、579 项测试，ESLint、TypeScript、Vite build 成功）；`git diff --check` 通过。
- Manual Check：用户真实截图用于比对问题方向；本机运行实例不是当前 Git build，未将其作为通过证据。
- Documentation：spec 与 plan 已记录证据并归档；Directory Map 无需更新。
