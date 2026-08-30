---
id: QB-20260830-git-pane-visual-polish
type: design
tier: standard
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

# Git Pane Visual Polish Plan

## Requirement

以同 ID spec 的 REQ-001 至 REQ-007 与 AC-001 至 AC-005 为事实源。

## Scope

- 调整 GitPane section 默认状态、DOM 结构、仓库路径位置与 textarea 自动高度。
- 重构 Git feature CSS 的 section 排列、展开动效、composer 和 graph hierarchy。
- 更新 GitPane 聚焦测试与 CSS 契约检查。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/git.css`
- `src/git/GitPane.test.tsx`
- `docs/qb-spec/specs/QB-20260830-git-pane-visual-polish.md`
- `docs/qb-spec/plans/QB-20260830-git-pane-visual-polish.md`

## Design

- Apple motion：非手势折叠使用无 overshoot、约 220ms 的对称过渡，内容从当前 CSS presentation state 重定向；reduced motion 保留状态变化但去掉空间移动。
- Qterm hierarchy：只使用 `--surface`、`--raised`、`--canvas`、`--hover`、`--border`、`--subtle`、`--accent` 等现有 token；展开内容拥有滚动，header 和 commit composer 固定。
- Collapsed ordering：repository 保持顶部；expanded changes/graph 排在内容区；collapsed changes/graph 以稳定 order 排到底部。

## Implementation Tasks

- [x] 修改 GitSection 为常驻 animation wrapper，默认折叠图表，并提供 path metadata 与 section 状态属性。
- [x] 增加 textarea 一至五行自动高度逻辑，重排提交 composer。
- [x] 重写 feature CSS 的 flex/order、展开动效、主题 surface 与 graph hierarchy。
- [x] 补默认状态、折叠排序、路径标题、textarea 与现有提交行为测试。

## Acceptance To Verification

- AC-001：GitPane 测试断言三个 toggle 初始状态及更改/图表 collapsed class/order contract。
- AC-002：结构测试确认内容不被条件卸载；CSS 检查确认 transition 与 reduced-motion 规则。
- AC-003：GitPane 测试确认 rows、自动高度上限标记、按钮布局 class、点击/Ctrl+Enter 与消息清理行为。
- AC-004：GitPane 测试确认 header path metadata 及无重复路径节点。
- AC-005：GitPane 渲染测试与 CSS 检查确认首条 commit、graph rail、滚动归属和层级 class。

## Test / Verification

1. `pnpm vitest run src/git/GitPane.test.tsx src/git/gitGraph.test.ts`
2. `pnpm lint`
3. `pnpm check`
4. `git diff --check`

## Documentation Updates

- 本次不新增模块或目录，不更新 Directory Map。
- 完成验证后记录 evidence 并自动归档本 spec/plan。

## Style Context

- 遵循用户指定的 `apple-design`：响应直接、无多余弹跳、空间路径对称、reduced-motion。
- 遵循 `qterm-ui-spec.md`：紧凑工作台、主题 token、明确滚动 owner、持久核心操作和可见 focus。

## Trigger Signals

- Architecture boundary：未触发；不改变 feature ownership 或跨层模型。
- Critical behavior：未触发高风险规则；以相邻组件行为测试保护交互回归。
- Directory Map：未触发；文件和模块边界不变。

## Verification Evidence

- Result：`PASS`。AC-001 至 AC-005 均有自动化证据，计划任务全部完成。
- AC-001：GitPane 测试验证存储库/更改默认展开、图表默认收起及更改/图表 collapsed section 状态；CSS 契约验证 collapsed order 为 4/5。
- AC-002：GitSection 内容常驻 DOM，并以 `grid-template-rows`、opacity、translateY 的 220ms 无 overshoot 曲线展开；reduced-motion 规则取消空间移动，样式契约测试通过。
- AC-003：textarea `rows=1`、`data-max-rows=5`、动态高度 92px 上限与内部滚动测试通过；提交按钮在下一行，点击、Ctrl+Enter、失败保留和成功清空行为通过。
- AC-004：仓库路径作为 `git-section-meta` 跟随“存储库”标题并带完整 title，原 `git-path` 内容节点已移除，测试通过。
- AC-005：graph rail、顶格 scroll surface、subject/meta/decoration 层级和独立滚动 CSS 契约通过；提交图数据渲染测试通过。
- Commands：聚焦 Vitest 15 项通过；`pnpm check` 通过（64 个测试文件、561 项测试，lint、typecheck、Vite build 全部成功）；`git diff --check` 通过。
- Manual Check：本地浏览器实看 Qterm Git Block 外框、active 状态与空状态主题集成正常。纯浏览器缺少 Tauri Git IPC，无法加载真实仓库内容；内容态由组件和 CSS 契约测试覆盖。
- Style Conformance：复用既有 Qterm token，无新色系、图标或动画依赖；Apple 风格的直接反馈、对称空间路径、无弹跳和 reduced-motion 已落实。该方向是本次 GitPane 局部调整，不新增长期 UI 偏好。
- Residual Risk：未在本轮生成真实仓库内容态的桌面截图；需在 Tauri 运行态由人工查看一次即可补充视觉证据，不影响自动化行为与构建门禁。
