---
id: QB-20260831-git-content-containers
type: design
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 存储库与图表内容容器优化

## Goal

让源代码管理中的存储库概要与提交图表拥有和提交消息组件一致的内嵌容器层级，减少内容直接贴边造成的松散感，并在深色、浅色与赛博朋克主题下保持紧凑、清晰的工作台视觉。

## Change Shape

- Type：`design`，调整既有 Git 内容面的分组、材质和选中层级，不新增产品能力。
- Tier：`standard`，涉及 GitPane 结构、feature CSS 与相邻测试，但不改变后端、Workspace schema 或 Git 行为。
- 用户已明确要求参考提交消息容器包裹存储库内容并同步优化图表，实施已获授权，因此实现开始时状态为 `active`。

## Scope

- 使用 feature-local 容器包裹存储库名称、分支操作、远程过期提示与 upstream 状态。
- 将图表滚动面改为有边界的内嵌容器，并同步整理提交选中态、拓扑轨道和展开文件列表的层级。
- 复用现有 Qterm theme token、圆角、边框、间距和短促状态反馈。
- 增加结构与样式契约测试，防止内容重新贴边或滚动 ownership 回归。

## Non-Goals

- 不改变折叠互斥、提交选择、文件懒加载、分支切换、刷新或仓库更换行为。
- 不修改 Git 命令、Tauri IPC、后端模型、持久化或 Workspace 布局。
- 不新增 UI、图标或动画依赖，不新增全局主题 token。
- 不把“更改”列表再套一层外部容器；其独立 change group 卡片保持现状。

## Requirements

- REQ-001：存储库内容必须位于独立的内嵌容器中，容器复用提交消息组件的边距、边框、圆角、surface 和轻量内阴影层级；仓库主行、远程过期反馈与 upstream 信息属于同一分组。
- REQ-002：图表必须位于独立的内嵌滚动容器中，具有紧凑边距、边框、圆角与裁切；提交拓扑、主题、元数据、装饰标签及展开文件列表不得突破该容器。
- REQ-003：当前提交的选中态必须以中性 surface、清晰主题文字和小型语义指示共同表达，避免大面积高饱和填充，同时保持 hover、focus-visible 和 expanded 状态可辨。
- REQ-004：存储库与图表改动必须复用现有主题 token，并在三主题、短视口、长路径、长提交主题和 reduced-motion 环境中保持可用。
- REQ-005：现有 Git 行为和无障碍语义必须保持不变，包括 section 折叠、独立滚动、按钮可见性、ARIA 状态、分支浮层与提交文件懒加载。

## Observable Acceptance

- AC-001（REQ-001, REQ-004）：仓库名称所在主行具有 `.git-repository-card` 祖先；该容器在 CSS 中具有与 `.git-commit-box` 对齐的外边距、边框、7px 圆角、主题 surface 和内阴影。
- AC-002（REQ-002, REQ-004）：`.git-graph-scroll` 自身成为有边界的内嵌卡片，同时继续拥有 `flex: 1`、`min-height: 0`、`overflow: auto` 和稳定 scrollbar gutter；提交与展开文件内容均位于其中。
- AC-003（REQ-003）：当前提交继续通过 `aria-pressed="true"` 暴露选择，并以中性背景、小型 leading indicator 和主题文字形成至少三重可见提示；hover 与 focus-visible 规则仍存在。
- AC-004（REQ-004, REQ-005）：聚焦 Git 组件和样式测试通过，现有折叠、分支浮层、提交选择、文件展开与缓存测试无回归；`pnpm check` 通过。

## Behavior Delta

### MODIFIED

- REQ-001：存储库内容由直接铺在 section surface 上，改为作为一个带边界的内嵌卡片分组显示。
- REQ-002：图表由贴边的透明滚动面，改为带边界、圆角和裁切的内嵌滚动卡片。
- REQ-003：当前提交由较大面积的主题色混合填充，改为更克制的中性选中 surface、主题文字和小型语义指示。

## Recommendation

只在 `GitPane` 增加语义清楚的 feature-local `git-repository-card` 包裹层；图表复用现有 `git-graph-scroll` 作为滚动卡片，避免增加无价值的 DOM 层。两者使用和 `git-commit-box` 一致的 7px 圆角、compact gutter、subtle border 与 raised/surface 混合；选中态遵循 Apple Design 的克制反馈和 Qterm 的中性 selection 规则。

## Quality Check

- REQ-001 至 REQ-005 均由 AC-001 至 AC-004 覆盖，容器结构、滚动 ownership、选择状态、主题和行为回归都有可观察证据。
- 范围仅限 Git feature UI 与测试，不含后端、schema、安全或公共 API 风险，无需升级 strict。

## Open Issues

- 无阻塞问题。“图表也做相应的优化”按同样的内嵌容器语言、克制选择态和保持独立滚动实现。

## Next Action

实现与 standard verification 已完成；变更归档。

## Verification Evidence

- AC-001：`GitPane.test.tsx` 确认仓库主行位于 `.git-repository-card`；样式契约确认容器使用 7px 圆角、7px/8px compact gutter、subtle border、raised/surface 背景与轻量内阴影。
- AC-002：样式契约确认 `.git-graph-scroll` 同时承担卡片与唯一滚动 owner，保留 `flex: 1`、`min-height: 0`、`overflow: auto`、稳定 scrollbar gutter，并新增边界、圆角与裁切层级。
- AC-003：组件测试继续验证 `aria-pressed` 的提交选择行为；样式契约确认当前提交使用中性 surface、2px 主题色 leading indicator、主题文字，且 hover 与 focus-visible 规则保持。
- AC-004：Git 聚焦测试 31 项通过；完整 `pnpm check` 通过（64 个测试文件、578 项测试，ESLint、TypeScript 和 Vite production build 全部成功）；`git diff --check` 通过。
- Manual：本地浏览器确认 Git Block 外框、空状态与当前主题集成无溢出或层级破坏；纯浏览器缺少 Tauri 系统 Git IPC，无法加载真实仓库内容态，内容态由组件与 CSS 契约测试覆盖。

## Completion

- Result：`PASS`。REQ-001 至 REQ-005 均已完成，存储库与图表使用一致的内嵌卡片语言，提交选中态更克制，既有 Git 行为保持不变。
- Style Conformance：复用现有 Qterm token、Icon 和 feature-local React/CSS 结构；Apple Design 的 grouping、material depth、克制反馈与无额外动效已落实。
- Durable Preference：本次是 GitPane 局部容器优化，并复用既有 Qterm 规范，不构成新的跨任务长期偏好，不更新 project context。
- Directory Map：未新增、移动模块或改变 ownership，无需更新。
- Residual Risk：未在 Tauri 真实仓库运行态生成内容截图；自动化已覆盖 DOM 层级、主题 CSS、滚动、选择和既有交互，剩余风险仅限不同系统字体或原生窗口缩放下的细微视觉差异。
