---
id: QB-20260831-git-graph-section-fill
type: bugfix
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 图表 section 剩余高度分配修复

## Goal

修复图表展开时 section 只获得约 75% 剩余高度、底部保留约 25% 空白的问题，并纠正上一轮把修复位置放在内部 scroller 高度链的诊断偏差。

## Change Shape

- Type：`bugfix`，新截图明确显示 graph scroller 在有内容溢出时提前结束，底部空白位于 section 外层分配区域。
- Tier：`standard`，虽为聚焦 CSS 修复，但属于连续出现的布局回归，需要稳定追踪、失败测试与完整前端验证。
- 用户已明确要求重新分析并修复，实施已获授权，状态为 `active`。

## Observed Behavior

- `toggleExclusiveSection` 保证 changes 与 graph 最多只有一个展开；graph 展开时 changes 的 flex 被 collapsed 规则重置为 0。
- graph 是唯一 grow item，却使用 `flex: .75 1 140px`。CSS Flexbox 在正 grow factor 总和小于 1 时只按该比例消费自由空间，因此只分配 75%，留下约 25% 底部空白。
- 上一轮补齐 inner body/content/scroller 高度链只能让 scroller 填满 graph section，无法让 graph section 本身获得未分配的外层空间。

## Expected Behavior

- changes 展开时由其 `flex-grow: 1` 占满剩余高度；graph 展开时也必须由 `flex-grow: 1` 占满同一剩余高度。
- inner graph body/content/scroller 保持既有明确高度链和唯一滚动 ownership。
- 不拉伸 commit/file rows，不给详情恢复最小/最大高度。

## Requirements

- REQ-001：`.git-graph-section` 在展开时必须使用不小于 1 的 grow factor，使其作为唯一 grow item 时消费全部剩余空间。
- REQ-002：changes/graph 的互斥展开行为、collapsed 27px header、graph collapsed 底部停靠与 repository 自然高度保持不变。
- REQ-003：graph scroller 继续作为唯一纵向滚动 owner；commit/file 自然高度、连接线、滚动条槽位和动画不得回归。

## Observable Acceptance

- AC-001（REQ-001）：样式回归测试明确要求 `.git-graph-section { flex: 1 1 140px; }`，且禁止小于 1 的 `.75` grow contract。
- AC-002（REQ-002）：既有 section 顺序、changes `flex: 1 1 160px`、collapsed header 与 graph bottom docking 契约继续通过；组件互斥展开测试保持通过。
- AC-003（REQ-003）：既有 graph body/content/scroller height chain、scrollbar、natural details、topology 与 lazy/cache 测试继续通过。
- AC-004：聚焦 Vitest、`pnpm check` 与 `git diff --check` 通过；真实 Git 内容态可用时确认 scrollbar/last row 延伸到 block 底部，否则记录限制。

## Behavior Delta

### MODIFIED

- REQ-001：graph section 从只消费 75% 自由空间，改为作为唯一展开工作区时消费全部自由空间。

## Root Cause

根因位于 `.git-graph-section` 的外层 flex shorthand，而不是 graph scroller：`flex-grow: .75` 在互斥 section 模式下没有其他正 grow item 与其凑满 1，浏览器按规范保留剩余 25% 自由空间。

## Non-Goals

- 不移除上一轮正确的 inner height chain、滚动条、连接线或文件动画修复。
- 不让 commit 条目均分或拉伸填充高度。
- 不改变 changes 与 graph 的互斥交互。

## Quality Check

- REQ-001 至 REQ-003 均有直接 AC，截图比例、状态机和 CSS grow 规则相互印证，无阻塞歧义。
- 不涉及后端、公共 API、schema 或安全边界，无需 strict。

## Verification

- AC-001：先运行 `pnpm vitest run src/git/gitStyles.test.ts`，旧实现按预期因 `.git-graph-section` 仍为 `flex: .75 1 140px` 失败；修复后聚焦套件通过并明确禁止旧 grow contract。
- AC-002：`GitPane.test.tsx` 的 changes/graph 互斥展开行为，以及 `gitStyles.test.ts` 的 section 顺序、collapsed header、bottom docking 契约在聚焦套件中通过。
- AC-003：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts` 通过，共 3 个测试文件、33 项测试；既有高度链、自然详情、连接线、滚动条和缓存契约未回归。
- AC-004：`pnpm check` 通过，共 64 个测试文件、580 项测试，TypeScript 检查和 Vite production build 成功；`git diff --check` 通过。
- Visual：用户截图与 flex 状态机、CSS Flexbox 自由空间分配规则形成直接证据。当前验证环境未复现同一远程仓库长文件列表，因此未新增实机截图；残余风险仅限平台 scrollbar overlay 的最终像素表现，不影响本次外层高度分配根因。

## Completion

实现和验证均完成，change 已归档。没有目录、模块边界或长期产品偏好变化，无需更新 Directory Map 或 project context。
