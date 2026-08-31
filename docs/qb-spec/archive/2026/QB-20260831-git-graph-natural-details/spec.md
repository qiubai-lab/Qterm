---
id: QB-20260831-git-graph-natural-details
type: bugfix
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 图表自然高度与外置轨道修复

## Goal

修复提交图表未充分使用可用高度、展开文件出现大块空白以及提交轨道被信息容器包裹后错位的问题，并为提交文件提供可逆的展开/收起动画。

## Change Shape

- Type：`bugfix`，截图已明确展示滚动时机、轨道归属和详情高度回归，同时包含用户指定的展开/收起反馈。
- Tier：`standard`，涉及 GitPane DOM、局部展示状态、feature CSS 与相邻回归测试，不改变 Git 数据、IPC 或后端。
- 用户已明确描述期望行为并要求优化，实施已获授权，状态为 `active`。

## Observed Behavior

- 展开两条文件时详情区被 SVG 百分比高度和最小高度撑到约 150px，产生大块空白并提前消耗图表滚动空间。
- commit 卡片同时包裹拓扑轨道和提交信息，兼容性布局下轨道列宽、边框与连接线容易错位。
- 详情在收起时立即卸载，只存在进入动画，没有对称的收起动画。
- 图表内容视觉上未自然占满 section 的剩余高度，实际内容尚未超出可用空间时就容易出现滚动感知。

## Expected Behavior

- 图表滚动面占满 section 可用高度，仅在真实 commit 与文件内容总高超过可用高度时滚动。
- 拓扑轨道始终位于卡片外的固定列；卡片只包裹 commit 信息，不给轨道施加背景、边框或裁切。
- 文件详情高度完全由文件行、加载、错误或空态内容自然决定，不设置整体最小高度或最大高度。
- 展开与收起沿同一路径进行短促、可中断的动画；reduced motion 下取消空间运动。

## Scope

- 将 commit row 调整为“外置 rail + 信息 card”的两列结构。
- 将详情 rail 改为绝对定位 SVG，使其填满右侧内容决定的自然高度但不参与高度计算。
- 详情 shell 常驻 DOM，在 expanded/collapsed 状态间使用 grid/opacity/translate 的对称过渡，并保持 `aria-hidden` 与 `inert`。
- 移除详情 rail 和状态区不必要的 min-height，禁止详情 shell/files 设置 max-height。
- 强化图表 scroll owner 的 `flex/min-height/align-self` 契约。

## Non-Goals

- 不改变 `continuingLanes`、卡片间 bridge、提交文件加载、缓存、错误重试或文件状态映射。
- 不实现 diff、文件打开或 Git 操作。
- 不增加动画依赖或定时器，不改变 section 折叠动画。

## Requirements

- REQ-001：`.git-graph-scroll` 必须作为唯一图表滚动 owner 拉伸占满 `.git-section-content` 的可用高度；只有真实内容溢出时允许纵向滚动。
- REQ-002：每个 commit 的 rail 和信息 card 必须是并列列；`.git-commit-card` 只包裹提交主题、元数据与 decoration，`.git-graph-rail` 不得具有 card 背景、border、radius 或 overflow 裁切。
- REQ-003：展开详情的高度必须由文件内容自然决定；continuation SVG 必须绝对定位且不贡献 intrinsic height，详情 shell、details、continuation、files 和 state 不得设置整体 min-height 或 max-height。
- REQ-004：详情 shell 必须在展开后保持挂载，使 expanded/collapsed 可进行 160–220ms 的对称、可反转过渡；collapsed 状态必须 `aria-hidden=true` 且 inert，展开时恢复。
- REQ-005：`prefers-reduced-motion: reduce` 下必须取消详情空间移动与 grid transition，只保留即时状态或短透明度反馈。
- REQ-006：现有拓扑连续线、bridge、多 lane、文件懒加载缓存、错误重试、提交选择、focus-visible 和三主题必须保持。

## Observable Acceptance

- AC-001（REQ-001）：样式契约确认 graph section/content/scroller 的 `flex: 1`、`min-height: 0`、`align-self: stretch` 与 `overflow-y: auto`，且无固定高度、min/max-height。
- AC-002（REQ-002）：DOM 中 `.git-graph-rail` 与 `.git-commit-card` 是 `.git-commit-row` 的并列子项；card 内含 commit content，rail 不位于 card 内且样式无背景、边框、圆角或裁切。
- AC-003（REQ-003）：展开两文件时 details 包含两个文件行且无 min/max-height 契约；continuation SVG 为 absolute/inset 并以 `height: 100%` 视觉填充但不参与 grid intrinsic sizing。
- AC-004（REQ-004, REQ-005）：详情 shell 初始常驻且 collapsed/inert；展开和收起只切换 state class/ARIA 而不卸载缓存内容，CSS 提供对称 transition 与 reduced-motion 覆盖。
- AC-005（REQ-006）：continuation/bridge 双 lane 测试、缓存、重试、选择和样式测试保持通过；完整 `pnpm check` 与 `git diff --check` 通过。

## Behavior Delta

### MODIFIED

- REQ-001：图表从可能被详情固有高度提前撑出滚动，改为占满可用空间并仅按自然内容溢出滚动。
- REQ-002：commit card 从包裹 rail + 信息，改为只包裹提交信息，rail 独立位于左侧。
- REQ-003：详情从受 SVG intrinsic/min-height 撑高，改为完全按文件内容自然高度显示且无最大高度。
- REQ-004：详情从仅进入动画且收起立即卸载，改为常驻 shell 的对称展开/收起动画。

## Root Cause

- 详情 continuation SVG 使用 `height="100%"` 参与自动高度 grid 的 intrinsic sizing，浏览器回退到 SVG 默认高度；同时 rail 的 `min-height` 进一步阻止内容按实际文件行收缩。
- card 容器位于 row 外层并包裹 rail，使轨道同时受 card border、overflow 与背景约束。

## Recommendation

让右侧文件内容成为 details grid 唯一高度来源；左侧 continuation rail 只提供固定宽度，其 SVG 使用 absolute positioning 填满 rail。commit row 保留透明 button 作为交互范围，但只给右侧 `.git-commit-card` 应用 card 视觉。详情 shell 常驻并用 `0fr ↔ 1fr`、opacity 和轻微 translate 提供无弹跳的可逆过渡。

## Quality Check

- REQ-001 至 REQ-006 均由 AC-001 至 AC-005 覆盖，滚动 ownership、DOM ownership、自然高度、动画、reduced motion 与既有拓扑行为都有直接验收。
- 不涉及后端、schema、安全或公共 API，无需升级 strict。

## Open Issues

- 无阻塞问题。用户所说“不设置最小/最大高度”按提交详情整体解释；非交互文件行仍保留紧凑行高以维持可读性。

## Next Action

变更已完成并归档；后续仅在真实仓库内容态出现新的浏览器差异时追加针对性回归。

## Verification

- AC-001：`gitStyles.test.ts` 已验证 graph section/content/scroller 的 flex、`min-height: 0`、拉伸与独立纵向 overflow 契约，scroller 无固定或最大高度。
- AC-002：`GitPane.test.tsx` 已验证 rail 与 commit card 为 button 的并列直接子项，card 仅包含 commit content；样式契约确认 rail 无 border、radius、overflow 或容器背景。
- AC-003：双文件与双 lane 组件回归已验证 details/files/continuation 结构；continuation SVG 使用 absolute + `height: 100%`，详情相关容器无整体 min/max-height。
- AC-004：组件回归已验证 shell 初始常驻、展开/收起 class、`aria-hidden`、`inert` 与缓存内容不卸载；CSS 契约覆盖 180ms 双向过渡和 reduced motion。
- AC-005：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts` 通过（32 项）；`pnpm check` 通过（64 个测试文件、579 项测试、ESLint、TypeScript、Vite build）；`git diff --check` 通过。
- 聚焦视觉验证尝试连接正在运行的 Tauri dev，但当前可控窗口没有 Git 内容态且终端持续刷新使界面操作快照失效；浏览器内存样本受本地浏览器 URL 安全策略阻止。该项是补充证据，不影响上述自动化验收；残余风险限于未录制真实展开动画观感。
