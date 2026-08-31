---
id: QB-20260831-git-graph-layout-regressions
type: bugfix
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 图表连续线、滚动条与高度链修复

## Goal

修复展开提交时拓扑线断层、滚动条覆盖提交信息卡片，以及图表滚动面没有占满 section 剩余高度的三个相邻回归。

## Change Shape

- Type：`bugfix`，用户截图给出了稳定可复现的布局和动效缺陷。
- Tier：`standard`，涉及 GitPane SVG 几何、feature CSS、主题滚动条契约和相邻回归测试，不改变 Git 数据或后端。
- 用户已明确要求修复，实施已获授权，生命周期为 `active`。

## Observed Behavior

- commit row 最小高度为 36px，但 row rail SVG 高度仅 34px；详情 shell 又整体参与 opacity/translate，展开过程中交界处出现明显断层。
- macOS 覆盖式 scrollbar 绘制在 graph scroller 内容之上，右侧 commit card 和 decoration 会被遮挡；Git scroller 未复用文件管理的 scrollbar token/WebKit 样式。
- graph section 的 body 依赖隐式 grid row，content 作为 grid child 却只声明 flex，scroller 使用内容基准的 flex shorthand；Safari 布局检查显示剩余高度没有稳定传递给滚动 owner。

## Expected Behavior

- 拓扑轨道从 commit row、展开文件区到下一个 commit 始终像一条连续路径；文件内容可动画，轨道本身不淡出或位移。
- scrollbar 使用文件管理同一套 `--scrollbar-thumb`、透明 track、5px WebKit 样式；在覆盖式 scrollbar 下也有固定内容避让槽，不遮盖 card。
- graph section body、content、scroller 建立明确的 `minmax(0, 1fr) → height: 100% → flex: 1 1 0` 高度链，scroll viewport 占满实际可用高度。

## Scope

- 统一 row rail SVG 与 commit row 的 36px 几何边界。
- 将详情 opacity/translate 从 shell/details 移到 file panel，保留 grid 展开并让 continuation line 始终可见。
- 为 Git changes/graph scroller复用文件管理 scrollbar 色彩和 WebKit 外观；graph 右侧预留稳定槽位。
- 显式设置 graph section 的 grid/flex 高度链。
- 添加样式与组件回归测试。

## Non-Goals

- 不改变 Git graph lane 算法、commit 文件加载/缓存、文件行密度或 section 展开规则。
- 不修改全局 scrollbar token，也不改变文件管理现有颜色。
- 不通过拉伸文件详情或设置整体 min/max-height 填补空白。

## Requirements

- REQ-001：commit row rail 必须覆盖 row 的完整 36px，continuation/bridge 必须与上下轨道无几何间隙；展开动画不得对 topology rail 应用 opacity 或 translate。
- REQ-002：Git scroll surfaces 必须使用文件管理一致的 `--scrollbar-thumb`、透明 track、5px WebKit scrollbar 与 hover 混色；graph 内容必须固定避让 overlay scrollbar，赛博主题继续由 cyan scrollbar token 驱动。
- REQ-003：graph section body/content/scroller 必须显式传递全部剩余高度，scroller 使用零 flex basis 成为唯一纵向滚动 owner，不依赖固定高度。
- REQ-004：详情仍按文件内容自然定高、无整体 min/max-height，展开/收起保持可逆、缓存、ARIA/inert 和 reduced-motion 行为。
- REQ-005：既有多 lane、选择、主题 decoration 与 commit card ownership 保持不变。

## Observable Acceptance

- AC-001（REQ-001）：组件/样式契约确认 row SVG `height/viewBox=36`、center/endpoint 使用 18/36；shell/details 无 opacity/translate，只有 file panel 执行 180ms opacity/translate，continuation line 始终渲染。
- AC-002（REQ-002）：样式契约确认 Git scrollers 与 file browser 相同的 scrollbar token、5px track/thumb/hover 规则；graph 使用右侧 padding 槽且 card 不延伸到 overlay scrollbar 下；cyber token 为 cyan hue。
- AC-003（REQ-003）：样式契约确认 graph body 的 `grid-template-rows: minmax(0, 1fr)`、content `height: 100%`、scroller `flex: 1 1 0` 与 `min-height: 0/overflow-y: auto`。
- AC-004（REQ-004, REQ-005）：既有 lazy files、cache、双 lane continuation/bridge、natural height、ARIA/inert、reduced-motion 与选择测试继续通过。
- AC-005：聚焦 Vitest、`pnpm check` 与 `git diff --check` 通过；可用的真实内容态用于复核滚动与展开观感，否则记录限制。

## Behavior Delta

### MODIFIED

- REQ-001：展开详情从轨道与文件内容一起淡入/位移，改为轨道连续、仅文件内容进行状态动画。
- REQ-002：Git scrollbar 从浏览器默认覆盖内容，改为文件管理同色同宽并预留 card 避让槽。
- REQ-003：图表高度从隐式 grid/flex 推导，改为显式占满 section 剩余高度。

## Root Cause

- 34px row SVG 位于 36px row 中会在上下各留下约 1px，whole-details opacity/translate 又在展开帧放大该接缝。
- `scrollbar-gutter` 对 macOS overlay scrollbar 不预留实体宽度，且 Git 未声明 file-browser 的 WebKit scrollbar appearance。
- graph body 的隐式 auto grid track 与 content 上的 flex 声明不能形成可靠的 definite-height chain。

## Quality Check

- REQ-001 至 REQ-005 均由 AC-001 至 AC-005 覆盖，关键边界为真实出现过的回归，先写自动化保护。
- 不涉及权限、schema、后端或公共 API，无需 strict；无阻塞歧义。

## Open Issues

- 无。底部“占满”指 scroll viewport 获得全部可用高度，不拉伸 commit/file rows，也不恢复详情最小高度。

## Next Action

变更已完成并归档；后续只在真实 Git 内容态出现新的平台差异时追加针对性回归。

## Verification

- AC-001：`GitPane.test.tsx` 已验证 row SVG `height/viewBox=36`、circle center 18 与父线终点 36；样式契约确认 topology shell/details 无 opacity/translate，仅 file panel 执行 160/180ms 可逆动画。
- AC-002：`gitStyles.test.ts` 已对照 `fileBrowser.css` 验证 `--scrollbar-thumb`、透明 track、5px WebKit scrollbar、thumb/hover/corner 规则；graph 右侧使用 6px padding 槽，cyber theme 保持 `#168996` cyan thumb 与 `#00ddeb` accent。
- AC-003：样式契约已验证 graph body `minmax(0, 1fr)`、content `height: 100%`、scroller `flex: 1 1 0`、`min-height: 0` 与唯一 `overflow-y: auto`。
- AC-004：lazy/cache、双 lane continuation/bridge、natural details、ARIA/inert、reduced-motion、选择与 decoration 回归继续通过。
- AC-005：聚焦 Vitest 通过（3 个文件、33 项）；`pnpm check` 通过（64 个测试文件、580 项、ESLint、TypeScript、Vite build）；`git diff --check` 通过。
- 真实窗口检查确认当前 Qterm 调试窗口仅有终端工作区，没有可操作的 Git 内容态，因此未宣称视觉录制通过；残余风险限于尚未录制真实展开帧与 overlay scrollbar，自动化已覆盖其几何和样式契约。
