---
id: QB-20260831-git-graph-lane-palette
type: design
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 图表泳道配色与逐行自适应布局

## Goal

让 Git 提交图中的不同分支泳道使用稳定、可追踪且随主题变化的颜色，并让每个 commit item 只为当前行实际存在的泳道让出空间，避免一次多泳道历史永久压缩全部提交内容。

## Change Shape

- Type：`design`，本次调整拓扑派生模型、SVG 颜色语义和 commit row 布局策略。
- Tier：`standard`，涉及纯图算法、React SVG、三主题令牌、feature CSS 与相邻测试，但不改变 Git 数据、IPC 或后端。
- 用户已采纳推荐方案并明确授权实施，状态为 `active`。

## Current Behavior

- `buildGitGraphRows` 只返回泳道位置与 `through/parent` 类型，不保存线条颜色身份。
- row、详情 continuation 与 bridge 均使用单一 `currentColor`，不同流向无法持续辨认。
- `GitPane` 求整个历史的最大泳道数并传给每一行；只要任一 commit 有两条或更多线，所有 commit card 都统一后移。

## Scope

- 将内部泳道升级为带稳定颜色槽的派生模型。
- 第一父链继承当前泳道颜色；新增侧分支获取不同色槽；既有侧分支在穿越、移动和并入连接中保持颜色至连接节点。
- 为节点、incoming、parent/through segment、展开详情 continuation 与 commit 间 bridge 输出颜色槽。
- 在暗色、亮色、赛博主题中提供六个 Git 图表语义色槽；赛博主题前三色为青、亮黄、红。
- 移除全历史最大 rail 宽度，让每行、详情和 bridge 使用自己的 `row.laneCount`。
- 保持现有滚动 owner、卡片 ownership、自然详情高度、折叠/展开、选择、焦点和无障碍语义。

## Non-Goals

- 不改变后端 commit 顺序、parent OID、日志数量或 IPC。
- 不实现分支筛选、diff、缩放、拖拽或整图 Canvas。
- 不按 `through/parent` 类型机械换色；颜色表达可追踪泳道，拓扑仍由位置、节点和线型共同表达。
- 不重构现有 Git Block section、commit 文件加载或缓存生命周期。

## Requirements

- REQ-001：每条活动泳道必须拥有确定的颜色槽；线性第一父链继承颜色，新侧分支分配与相邻活动泳道不同的颜色，结果对相同输入保持确定。
- REQ-002：节点、incoming、parent/through segment、continuation 与 bridge 必须携带并渲染同一泳道颜色；侧分支移动或并入时不得在中途无故换色。
- REQ-003：图表必须提供至少六个主题语义色槽并在暗色、亮色、赛博主题中保持可辨认；赛博主题前三槽依次使用赛博青、赛博亮黄、赛博红。
- REQ-004：每个 commit row、展开详情和 bridge 必须按该行 `laneCount` 计算 rail 宽度；单泳道行不得因其他行存在多泳道而后移。
- REQ-005：多泳道行必须仍容纳其最右侧节点与曲线，所有行的泳道 X 坐标继续以图表左边缘为共同基准，跨行连接保持连续。
- REQ-006：现有 commit 卡片、选择/hover/focus、展开文件自然高度、ARIA/inert、滚动条与 reduced-motion 行为必须保持；颜色不得成为理解拓扑的唯一信号。

## Observable Acceptance

- AC-001（REQ-001, REQ-002）：纯函数测试证明线性历史为单一色槽，merge 的侧分支获得不同色槽，through/parent/continuation 在跨行移动和并入前保持该色槽。
- AC-002（REQ-001, REQ-003）：六条以上活动泳道的颜色分配结果确定，优先避开相邻活动色槽；主题测试确认三套主题均提供六个令牌，赛博前三槽为青、亮黄、红。
- AC-003（REQ-004, REQ-005）：包含 `2 → 1` 泳道收缩的组件测试确认各 row、continuation、bridge SVG 使用自己的宽度，单泳道 card 不再继承全局最大 rail 宽度，同时所有 X 坐标仍使用共同 lane gap/offset。
- AC-004（REQ-002, REQ-006）：DOM/CSS 测试确认 path、line、circle 通过颜色槽渲染，选择态不覆盖泳道身份；现有展开、缓存、滚动和可访问性测试保持通过。
- AC-005（REQ-001 至 REQ-006）：聚焦 Vitest、`pnpm check` 与 `git diff --check` 通过。

## Behavior Delta

### ADDED

- REQ-001：Git 图表新增稳定泳道颜色身份与确定性色槽分配。
- REQ-003：三主题新增六个 Git 图表语义色槽。

### MODIFIED

- REQ-002：拓扑线从单一主题色改为跨节点、连接、详情和 bridge 连续的泳道颜色。
- REQ-004：commit rail 从全历史最大固定宽度改为逐行实际泳道宽度。

## Recommendation

在 `gitGraph.ts` 内维护 `{ oid, colorIndex }` 泳道并输出带颜色的 segment/continuation；React 使用 `data-color` 渲染，不写固定色值；三个主题显式声明 `--git-graph-lane-1` 至 `--git-graph-lane-6`。移除 `graphLaneCount`，三个 SVG 组件均直接读取 `row.laneCount`。

## Quality Check

- REQ-001 至 REQ-006 均由 AC-001 至 AC-005 覆盖。
- 复杂拓扑派生先由纯函数测试保护；布局和主题由组件/样式契约覆盖。
- 不涉及安全、schema、公共 API 或后端，无需升级 strict；无阻塞歧义。

## Open Issues

- 超过六条并行泳道时允许确定性循环使用色槽，但必须优先避免相邻泳道同色；拓扑位置仍是主要辨识信号。

## Next Action

变更已完成并归档；后续只在真实复杂仓库中发现新的拓扑辨识或平台渲染问题时追加针对性回归。

## Verification Summary

- AC-001：`gitGraph.test.ts` 证明线性第一父链继承颜色，merge 侧分支独立配色，through/parent/continuation 在移动与并入前保持颜色身份。
- AC-002：七泳道测试证明六色色槽分配确定且循环时避开相邻同色；`themeStyles.test.ts` 证明三主题均声明六个令牌，赛博前三色为青、亮黄、红。
- AC-003：`GitPane.test.tsx` 证明双泳道行使用 28px rail、收缩后的单泳道行及其 continuation/bridge 使用 17px rail。
- AC-004：DOM/CSS 契约证明 path、line、circle 使用 `data-color` 与主题令牌，选择态不覆盖泳道色；现有展开、缓存、滚动与 ARIA 回归保持通过。
- AC-005：聚焦 Vitest 4 个文件 69 项通过；完整 `pnpm check` 通过 68 个测试文件、619 项测试，并通过 ESLint、TypeScript 与 Vite production build；`git diff --check` 通过。
- 残余风险：本轮未在带复杂真实历史的 Tauri 窗口录制视觉截图；几何、颜色传播和主题契约已有自动化覆盖。
