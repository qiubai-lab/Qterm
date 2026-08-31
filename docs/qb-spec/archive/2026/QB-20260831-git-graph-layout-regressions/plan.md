---
id: QB-20260831-git-graph-layout-regressions
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
---

# Git 图表布局回归执行计划

## Requirement

以同 ID spec 的 REQ-001 至 REQ-005、AC-001 至 AC-005 为事实源。

## Scope

- 修复 row/detail/bridge 轨道接缝与动画归属。
- 复用文件管理 scrollbar token/appearance 并为 overlay scrollbar 预留槽位。
- 显式闭合 graph section 的 grid/flex 高度链。
- 保留详情自然高度与现有 Git 行为。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- 当前 change spec / plan

## Design

- Geometry：row rail 使用 36px viewBox，node center 为 18，父线结束于 36；details/bridge 从相同边界继续。
- Motion：shell 仅负责 `0fr ↔ 1fr` 空间揭示；topology 不做 opacity/translate；file panel 使用短促、可逆的 opacity + 3px translate。
- Scrollbar：复制 file-browser 的 scrollbar role/token，而非新建 feature 色；graph 以右侧 6px padding 配合收窄右 margin 避让 overlay scrollbar。
- Height：graph body 明确单行 `minmax(0, 1fr)`，content 占满 100%，scroller 使用 `flex: 1 1 0`。

## Implementation Tasks

- [x] 先补 row SVG 边界、topology 动画隔离、scrollbar appearance/槽位和 definite-height chain 回归断言。
- [x] 调整 GitGraph SVG 几何与 details 动画目标。
- [x] 调整 Git scroller scrollbar 和 graph 高度链 CSS。
- [x] 运行聚焦、完整、diff 与可用视觉检查并记录证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitPane.test.tsx` 检查 row SVG 36px 几何；`gitStyles.test.ts` 检查动画只属于 file panel。 |
| AC-002 | `gitStyles.test.ts` 对照 file browser 断言 token、5px WebKit rules、transparent track、thumb/hover 和 graph padding 槽；主题断言 cyan token。 |
| AC-003 | `gitStyles.test.ts` 检查 body/content/scroller 的 explicit grid/height/flex/overflow 链。 |
| AC-004 | 复用 lazy/cache、双 lane、natural height、ARIA/inert、reduced-motion 与选择测试。 |
| AC-005 | 聚焦 Vitest、`pnpm check`、`git diff --check` 与可用真实内容态检查。 |

## Test / Verification

1. 运行新增聚焦测试，确认实现前因 34px rail、whole-details animation、缺少 scrollbar style 和隐式高度链而失败。
2. `pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts`
3. `pnpm check`
4. `git diff --check`
5. 检查展开首帧/终帧、右侧 decoration/card 与 scrollbar 间距、长列表滚动、短内容 viewport 以及 cyber/dark theme。

## Documentation Updates

- 验证结果写回 spec/plan 并归档。
- 不改变目录或模块 ownership，无需 Directory Map。

## Trigger Signals

- Critical behavior：触发；三个均为已截图复现的 UI 回归，先写测试。
- Architecture boundary：未触发。
- Directory Map：未触发。

## Completion Evidence

- 聚焦 Vitest：3 个文件、33 项测试通过。
- 完整 `pnpm check`：64 个测试文件、580 项测试通过；ESLint、TypeScript 和 Vite production build 通过。
- `git diff --check`：通过。
- 当前真实窗口无 Git 内容态，未完成视觉录制；spec 已记录非阻塞残余风险与复验范围。
