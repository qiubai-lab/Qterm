---
id: QB-20260831-git-graph-natural-details
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git 图表自然高度与外置轨道执行计划

## Requirement

以同 ID spec 的 REQ-001 至 REQ-006 与 AC-001 至 AC-005 为事实源。

## Scope

- 外置 commit rail、仅包裹信息的 card。
- 自然高度详情、绝对定位 continuation SVG。
- 常驻详情 shell 与对称展开/收起动画。
- 图表滚动 owner 伸展契约与相邻测试。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/specs/QB-20260831-git-graph-natural-details.md`
- `docs/qb-spec/plans/QB-20260831-git-graph-natural-details.md`

## Design

- DOM：button 仍拥有完整点击/ARIA 语义，直接包含 rail 和 card 两列；details shell 常驻，内部 details 同样是 rail + files 两列。
- Height：files/state 是唯一行高来源；continuation wrapper 只有动态列宽，SVG 绝对定位覆盖自然高度。
- Motion：`grid-template-rows: 0fr ↔ 1fr`、opacity、3px translate，180ms 无弹跳曲线；状态直接派生、可反复点击；reduced motion 取消空间过渡。
- Scrolling：graph section/content/scroller 保持完整 flex/min-height 链，只有 scroller 使用 overflow-y auto。

## Implementation Tasks

- [x] 先补 rail/card sibling、详情自然高度、常驻 shell、收起后 inert/ARIA 与 reduced-motion 样式契约测试。
- [x] 重构 GitPane commit row/details DOM，保留缓存内容以支持 exit animation。
- [x] 调整 graph rail/card/files/scroll CSS，移除详情整体 min/max-height 并实现绝对 continuation 与对称动画。
- [x] 运行聚焦、完整、diff 和可用视觉检查并记录证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitStyles.test.ts` 检查完整伸展链与唯一 overflow-y owner，排除固定/min/max height。 |
| AC-002 | `GitPane.test.tsx` 检查 rail/card sibling 和 content ownership；样式契约排除 rail card 视觉。 |
| AC-003 | 两文件展开组件测试与 CSS 契约检查 natural details、absolute continuation 及无整体 min/max height。 |
| AC-004 | `GitPane.test.tsx` 验证 shell 常驻、expanded/collapsed ARIA/inert 与缓存内容不卸载；CSS 契约检查 transition/reduced motion。 |
| AC-005 | 复用多 lane、缓存、重试、选择测试；运行聚焦 Vitest、`pnpm check`、`git diff --check`。 |

## Test / Verification

1. 运行新增聚焦测试并确认实现前因 DOM/height/animation 契约缺失而失败。
2. `pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts`
3. `pnpm check`
4. `git diff --check`
5. 以用户真实截图为问题基线；若当前 Tauri dev 内容态可用，检查两文件、长文件列表、快速展开/收起和短视口，否则明确记录限制。

## Documentation Updates

- 验证结果写回 spec/plan 并归档。
- 无模块或 ownership 变化，不更新 Directory Map。

## Trigger Signals

- Architecture boundary：未触发，仍是 `src/git` 内部展示重构。
- Critical behavior：已触发，针对已复现的 intrinsic height、rail ownership 与收起生命周期先写回归测试。
- Directory Map：未触发。

## Completion Evidence

- 聚焦 Vitest：3 个文件、32 项测试通过。
- 完整 `pnpm check`：64 个测试文件、579 项测试通过；ESLint、TypeScript 与 Vite production build 通过。
- `git diff --check`：通过。
- 真实内容态视觉检查受当前运行窗口状态与浏览器安全策略限制；已在 spec 中记录为非阻塞残余风险。
