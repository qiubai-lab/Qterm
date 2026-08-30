---
id: QB-20260830-git-pane-visual-polish
type: design
tier: standard
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

# Git Pane Visual Polish

## Goal

提升 Git 管理窗口三段式布局的空间层级、折叠行为和提交输入体验，使其在浅色、深色与赛博朋克主题下都保持紧凑、清晰且有 Qterm 工作台风格。

## Change Shape

- Type：`design`，核心是既有 Git 功能的信息层级、动效与布局约束调整。
- Tier：`standard`，涉及 GitPane React 结构、feature CSS 和交互测试，不改变后端、Workspace schema 或 Git 行为。
- 用户当前请求已明确具体行为并授权修改，因此 implementation 开始时直接进入 `active`。

## Scope

- 存储库、更改、图表三个 section 都提供短促、无弹跳、可中断的展开/收起反馈，并支持 reduced motion。
- 默认展开存储库与更改，默认收起图表。
- 更改或图表收起后排列到面板底部；展开 section 占据中间剩余空间，避免固定 Grid 行留下空洞。
- 提交消息从一行高度开始，随内容增长至最多五行，提交按钮放在输入框下一行并重做 composer 层级。
- 仓库路径跟随“存储库”标题显示，并在空间不足时单行省略。
- 图表采用顶格内容、独立轨道面与提交信息层级；三段式 surface、header、hover、focus 和主题 token 更清楚。

## Non-Goals

- 不修改 Git 命令、SSH、持久化、分支或提交行为。
- 不增加 diff、origin sync、拖拽、section 状态持久化或动画依赖。
- 不改动全局主题 token，仅消费现有语义 token。

## Requirements

- REQ-001：GitPane 首次打开必须默认展开存储库与更改、收起图表；所有 section toggle 保持按钮语义与正确 `aria-expanded`。
- REQ-002：更改和图表收起时必须自动排列到面板底部，展开内容拥有明确的剩余空间和独立滚动区域。
- REQ-003：三个 section 的展开/收起必须有约 180–240ms 的无弹跳空间反馈，且 `prefers-reduced-motion` 下取消空间移动。
- REQ-004：提交消息框必须一行起步、按内容自动增长、最多五行后内部滚动；提交按钮必须位于其下方并保持既有禁用、点击和 Ctrl+Enter 行为。
- REQ-005：仓库路径必须紧跟“存储库”标题显示，使用路径字体并在狭窄宽度省略；原内容区不重复路径。
- REQ-006：图表内容必须从 section 顶部开始，并通过轨道面、主题 surface、文字权重和 decoration 层级区分提交拓扑、主题与元数据。
- REQ-007：样式必须复用现有 Qterm token，在既有三主题、最短支持高度、键盘 focus 和 reduced-motion 环境中保持可用。

## Observable Acceptance

- AC-001（REQ-001, REQ-002）：加载仓库后，存储库/更改 toggle 为展开、图表 toggle 为收起；切换更改或图表后，collapsed section 带可验证的底部排序状态。
- AC-002（REQ-003, REQ-007）：三个 section 内容常驻于可动画容器，CSS 提供一致展开过渡和 reduced-motion 覆盖，快速反复点击不会锁定输入。
- AC-003（REQ-004）：textarea 初始 `rows=1`，内容增长时高度更新但不超过五行；提交按钮在独立底部操作行，失败保留消息、成功清空消息、Ctrl+Enter 仍可提交。
- AC-004（REQ-005）：仓库路径出现在“存储库”标题同一 header 内，具有 title 完整值且内容区域不再重复渲染路径。
- AC-005（REQ-006, REQ-007）：图表展开后顶端出现首条提交，lane、subject、meta、decoration 有不同层级，并继续只有图表内容区域滚动。

## Behavior Delta

### MODIFIED

- REQ-001：原先三个 section 全部默认展开，改为图表默认收起。
- REQ-002：原先固定 Grid 行导致折叠 section 留在原位置，改为折叠的更改/图表归入底部 stack。
- REQ-003：原先仅旋转 chevron 且卸载内容，改为内容常驻、对称展开/收起反馈。
- REQ-004：原先两行固定输入框与右侧纵向提交按钮，改为一至五行自适应 composer 与下方全宽按钮。
- REQ-005：原先路径位于存储库内容行下方，改为跟随 section 标题。
- REQ-006：原先图表行与普通列表处于同一平面，改为拓扑轨道与提交信息有明确视觉层级。

## Recommendation

使用 React 状态派生 class 与 CSS Grid/Flex 完成布局，不加入动画库。展开内容保留 DOM，以 `grid-template-rows`、`opacity` 和小幅 `translateY` 提供 critically damped 风格的短过渡；textarea 只用 ref 同步 `scrollHeight` 并在五行处切换内部滚动。

## Quality Check

- REQ-001 至 REQ-007 均由 AC-001 至 AC-005 覆盖，默认状态、反复切换、狭窄布局、键盘、主题和 reduced motion 均有明确验收。
- 变更只触及 Git feature UI 与测试，不存在后端、schema、安全或公共 API 风险，无需升级 strict。

## Open Issues

- 无阻塞问题。“图表顶格”按图表内容从 section 顶部开始、拓扑轨道形成独立左侧层级实现。

## Next Action

实现与 standard verification 已完成；变更归档。

## Verification Evidence

- Completion：REQ-001 至 REQ-007 已按批准范围实现，三段式默认状态、底部折叠 stack、展开动效、提交 composer、仓库路径位置与图表层级均完成。
- Automated Evidence：Git 聚焦测试 15 项通过；完整 `pnpm check` 通过（64 个测试文件、561 项测试）；`git diff --check` 通过。
- Manual Evidence：本地浏览器确认 Git Block 外框、active 状态与空状态在当前主题下正常；真实内容态受浏览器无 Tauri Git IPC 限制，以组件和 CSS 契约测试替代。
- Archive Decision：`PASS`；无阻塞验收项，保留一次 Tauri 真实仓库内容态人工截图作为非阻塞后续视觉证据。
