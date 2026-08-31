---
id: QB-20260831-git-commit-cards-continuity
type: design
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git commit 卡片与展开轨道连续性优化

## Goal

将提交图表从“整体外框”调整为“每个 commit 独立容器”，让展开文件以 VS Code 风格的紧凑树形列表显示，并保证文件列表展开后 Git 拓扑连接线仍连续穿过展开区域。

## Change Shape

- Type：`design`，以新的 commit 分组层级和可测拓扑连续性约束修正既有图表展示。
- Tier：`standard`，涉及图表派生模型、GitPane 结构、feature CSS 与相邻回归测试，不改变 Git 数据、IPC 或后端。
- 用户已通过本次明确指令批准该方向，实施开始时状态为 `active`。

## Current Behavior

- 图表滚动面整体使用一个外部容器，commit 之间主要依靠分隔线区分，未形成按提交分组的独立卡片。
- 展开文件直接插入两个 commit 行之间，但只渲染 commit 行高度内的 SVG 轨道，导致父提交连接在文件列表高度范围内出现断层。
- 文件列表具备文件名、目录和状态，但左侧拓扑与内容层级未形成 VS Code 式连续树形结构。

## Scope

- 移除图表滚动面本身的卡片外观，改为带间距的透明滚动列表。
- 每个 `.git-commit-entry` 成为独立紧凑容器，commit header 与其展开文件属于同一卡片。
- 展开区增加与 commit 图相同坐标系的 continuation rail，渲染当前行之后仍存活的全部 lane。
- 文件列表采用单行文件名、弱化目录、尾部状态的 VS Code 式层级，并保留重命名来源、加载、空态与错误重试。
- 对线性历史、分叉/合并历史和展开 DOM 增加回归保护。

## Non-Goals

- 不实现 diff、文件打开、行级变更统计、右键菜单或文件操作。
- 不改变提交文件懒加载、缓存键、错误恢复、提交选择或 section 折叠逻辑。
- 不修改后端 Git 拓扑来源、OID、parent 顺序或 Tauri IPC。
- 不引入新的 UI、图标或图形依赖。

## Requirements

- REQ-001：图表必须以 commit 为分组单位；每个 commit header 及其展开内容位于独立的圆角、边框、主题 surface 容器中，图表滚动面自身保持透明且不再承担整体外框。
- REQ-002：展开文件必须以紧凑树形列表呈现，文件图标、文件名、弱化目录/来源和尾部状态保持单行对齐；hover、错误、空态、加载和超过上限提示均属于当前 commit 容器。
- REQ-003：图表派生数据必须暴露 commit 之后仍存活的 lane；展开区域必须为这些 lane 渲染从顶部到底部的连续线，使下一 commit 的 incoming segment 与上一 commit 的 parent/through segment 视觉衔接。
- REQ-004：线性历史以及分叉/合并历史中的 continuation lane 必须正确，不得只延续当前 lane 或固定第一条 lane。
- REQ-005：现有 `aria-pressed`、`aria-expanded`、文件列表语义、懒加载缓存、错误重试、focus-visible、独立滚动与 reduced-motion 行为必须保持。
- REQ-006：所有样式必须复用 Qterm theme token，在三主题、长路径、多文件和短视口中保持紧凑可读。

## Observable Acceptance

- AC-001（REQ-001, REQ-006）：`.git-graph-scroll` 是透明的独立滚动列表且无 border/shadow；每个 `.git-commit-card` 具有边框、5–7px 圆角、主题 surface 和裁切，卡片间 5px 空间由连续 bridge rail 占据。
- AC-002（REQ-002, REQ-005）：展开后 `.git-commit-details` 位于同一 commit entry 内，文件名、目录/来源与状态按 VS Code 式单行层级显示；现有加载、空态和重试测试继续通过。
- AC-003（REQ-003, REQ-004）：`buildGitGraphRows` 对线性和 merge/fork 输入返回正确 `continuingLanes`；展开非根提交后 DOM 存在 `.git-graph-continuation`，并为每个存活 lane 渲染一条贯穿详情高度的 line。
- AC-004（REQ-005, REQ-006）：提交选择、展开缓存、重试、折叠和样式聚焦测试通过；完整 `pnpm check` 与 `git diff --check` 通过。

## Behavior Delta

### ADDED

- REQ-003：图表新增展开区 continuation rail，连接线可穿过任意高度的提交文件列表。
- REQ-004：图表派生行显式提供全部存活 lane，保护 merge/fork 展开时的多线连续性。

### MODIFIED

- REQ-001：图表从整体单一容器改为每个 commit 独立容器。
- REQ-002：提交文件从缩进块改为与拓扑 continuation rail 并列的 VS Code 风格紧凑树形列表。

## Recommendation

让 `gitGraph.ts` 在构造每行时直接返回 `after` lane 的索引，避免 UI 从 SVG path 反推拓扑；GitPane 用与 commit SVG 相同的 lane gap/x 坐标渲染详情 continuation 与卡片间 bridge SVG。详情区采用两列 grid，使轨道高度由文件列表自然撑开且只有外层图表滚动。

## Quality Check

- REQ-001 至 REQ-006 均由 AC-001 至 AC-004 覆盖，commit 分组、文件层级、线性及分叉/合并连续性、既有行为和主题约束均有直接证据。
- 改动只扩展前端派生展示模型，不触及后端 Git 语义、schema、安全或公共 API，无需升级 strict。

## Open Issues

- 无阻塞问题。VS Code 参考按其“commit header + 嵌套文件树 + 连续左侧轨道”的信息层级实现，不复制其图标库或专有视觉资源。

## Next Action

实现与 standard verification 已完成；变更归档。

## Verification Evidence

- AC-001：`gitStyles.test.ts` 确认 `.git-graph-scroll` 为无 border/shadow 的透明唯一滚动面；`.git-commit-card` 具有 subtle border、6px 圆角、主题 surface 与裁切；7px bridge 加上下各 -1px 重叠，形成 5px 有效卡片间距并覆盖相邻边框。
- AC-002：`GitPane.test.tsx` 确认展开文件与 continuation rail 位于当前 commit card 的 `.git-commit-details` 内；现有懒加载、重命名来源、缓存、空态和错误重试测试保持通过。CSS 契约确认文件行 25px 起步、4px 圆角、单行名称/目录/来源与尾部状态层级。
- AC-003：`gitGraph.test.ts` 确认线性历史的 `continuingLanes` 为 `[0] → [0] → []`，merge/fork 为 `[0,1] → [0,1] → [0] → []`；组件测试确认展开双父提交时详情 rail 与卡片间 bridge 均渲染两条全高 line。
- AC-004：Git 聚焦测试 32 项通过；完整 `pnpm check` 通过（64 个测试文件、579 项测试，ESLint、TypeScript 与 Vite production build 全部成功）；`git diff --check` 通过。
- Tests-first Evidence：新增契约在实现前按预期产生 5 条失败，分别对应缺失的 `continuingLanes`、commit card、details continuation 与 CSS 层级；实现后全部转为通过。

## Completion

- Result：`PASS`。REQ-001 至 REQ-006 已完成：图表以 commit 独立卡片分组，文件列表采用 VS Code 式紧凑层级，全部存活 lane 在详情区和卡片间持续连接。
- Style Conformance：只复用 Qterm theme token 与现有 Icon，不新增依赖；选择、hover、focus、加载、错误、空态与 reduced-motion 行为保持。
- Manual Evidence：用户提供的真实仓库截图作为问题基线；本机当前运行的 Qterm 实例不包含本轮 Git 管理入口且报告 Workspace 版本不受支持，无法作为当前构建的有效内容截图，因此未将其计入通过证据。
- Durable Preference：本次是 Git 图表局部信息层级与拓扑连续性修正，不形成新的跨任务长期风格偏好，不更新 project context。
- Directory Map：未新增或移动模块，ownership 仍在 `src/git`，无需更新。
- Residual Risk：尚未在当前源代码对应的 Tauri dev WebView 中拍摄长 commit 列表与多文件展开截图；纯拓扑、DOM、样式、类型检查和生产构建均已覆盖，剩余风险限于不同系统缩放下的细微像素对齐。
