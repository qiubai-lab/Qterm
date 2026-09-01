---
id: QB-20260901-git-conflict-workbench-refinement
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 冲突工作台尺寸与连续处理优化

## Goal

让冲突工作台在常见桌面窗口中提供更大的比较与编辑空间，并把文件列表变为不会持续挤压编辑器的可折叠弹性区域；完成一个文件后连续进入下一个冲突，同时消除 CodeMirror 行号后重复的活动行竖条。

## Approval

用户于 2026-09-01 提供当前冲突工作台截图，明确要求扩大宽高、将左侧文件列表改为可展开的 flex 布局、解决后自动进入下一个冲突，并修复行号后的双高亮竖条。

## Baseline

`QB-20260901-git-merge-editor-workbench` 已提供并排 Incoming / Current、下方 Result、可选 Base、冲突文件列表和多文件选择。当前 manager 上限为 960×720px，侧栏使用固定 grid column；resolve 后虽会尝试选择剩余项，但没有专门的连续处理回归与结果编辑器聚焦保证；输入 merge view 和结果冲突装饰还可能与通用 active-line gutter 同时绘制竖向指示。

## Scope

- 提高冲突 dialog 的桌面尺寸上限，同时保留最少 24px 的安全视口边距和低尺寸收缩能力。
- 将 manager 改为 flex，侧栏拥有固定弹性基准、可通过持久可见按钮收起/展开；编辑区始终 `flex: 1`、`min-width: 0`。
- 成功解决当前路径且仍有剩余冲突时，按原文件顺序选择下一项，循环到列表前部，并在加载后聚焦新的结果编辑器。
- 统一活动行和冲突块的指示职责，只保留一个行号邻接竖条，同时继续保留冲突块背景与 marker gutter。
- 增加组件与 CSS contract 回归测试。

## Non-Goals

- 不改变 Git conflict detail、resolution、revision 或 snapshot 的 IPC/Rust 契约。
- 不自动保存草稿、不自动继续 merge、不跳过 unsupported/binary 冲突。
- 不持久化侧栏展开状态到应用设置；状态仅属于当前 resolver 会话。
- 不新增 CodeMirror、图标或布局依赖。

## Assumptions And Constraints

- 文件列表默认展开，用户可主动收起以最大化编辑器；收起后展开按钮仍可键盘访问并暴露 `aria-expanded`。
- “下一个”按打开 resolver 时可见的冲突顺序向后查找，抵达末尾后回到首个剩余项；后端返回的 snapshot 是剩余冲突的权威来源。
- 自动前进只发生在 resolution 成功后；失败时必须保留当前文件和错误信息。
- Qterm UI specification 继续作为 dialog 边距、flex shrink、scroll owner、focus-visible 和 reduced-motion 的规范来源。

## Requirements

- REQ-001：冲突 dialog 在空间允许时必须比现有 960×720px 更大，且任意视口仍保留至少 24px 外边距，header、editor 和 footer 不得被固定尺寸裁掉。
- REQ-002：文件侧栏必须以 flex item 参与 manager 布局，展开时维持稳定列表宽度，收起时缩为仅包含展开控制的紧凑 rail；编辑区必须取得全部剩余宽度且不被列表内容撑开。
- REQ-003：侧栏控制必须持久可见、支持键盘、具有明确的展开/收起 accessible name 和 `aria-expanded` 状态；展开后列表选择、独立滚动和未保存草稿保护必须保持不变。
- REQ-004：成功解决当前文件且 snapshot 仍有冲突时，resolver 必须按当前顺序自动加载下一个剩余路径，必要时从末尾循环，并在新结果编辑器挂载后将编辑焦点交给它；最后一个冲突完成后仍关闭 resolver。
- REQ-005：冲突输入和结果编辑器在行号邻接位置必须只绘制一个活动行竖条；冲突 current/incoming 背景、marker 文本和 diff change 背景必须继续可辨识。
- REQ-006：既有 Base disclosure、Incoming / Current whole-file actions、Result 保存、binary/unsupported fallback、loading/error 和 dirty confirmation 行为必须保持兼容。

## Behavior Delta

### ADDED

- REQ-002：冲突文件列表增加会话级展开/收起控制和紧凑 rail。
- REQ-004：单文件 resolution 成功后连续加载并聚焦下一剩余冲突。

### MODIFIED

- REQ-001：冲突 manager 从 960×720px 上限升级为更大的桌面工作区，同时保留安全视口边距。
- REQ-005：输入与结果的活动行/冲突装饰由重复竖条改为单一 gutter 指示。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002]：样式契约证明 dialog 使用更大的宽高上限与安全视口边距，manager/sidebar/editor 分别满足 flex shrink 契约，展开和收起宽度不会由文件名撑开。
- AC-002 [REQ-002, REQ-003, REQ-006]：Testing Library 证明文件列表默认展开，控制可切换 `aria-expanded`，折叠状态隐藏列表但保留展开入口，重新展开后仍可选择文件且 dirty confirmation 不回归。
- AC-003 [REQ-004, REQ-006]：组件测试证明解决第一个文件后自动加载第二个并聚焦结果编辑器，解决末尾文件时循环到首个剩余项，零剩余时关闭，失败时不前进。
- AC-004 [REQ-005]：样式和 editor extension 回归证明只由通用 active-line gutter 绘制邻接竖条，read-only comparison 不绘制活动行竖条，冲突角色仍保留背景/marker。
- AC-005 [REQ-006]：既有 resolver、CodeEditor、input comparison、GitPane operation 测试以及 `pnpm check` 全部通过。

## Architecture Boundary Decision

- `GitConflictResolver` 继续拥有侧栏 disclosure、文件顺序、resolution 后续导航和结果 view 聚焦。
- `src/git/editor/` 只拥有 CodeMirror diff/marker 呈现，不参与 snapshot 或 path 编排。
- `gitConflictResolver.css` 负责尺寸、flex 和单指示器的 feature-local 覆盖；不修改共享 DialogFrame 或 Files editor 的视觉契约。
- Rust、Tauri transport 和 Git application/domain layers 保持不变。

## Quality Check

- REQ-001 至 REQ-006 均有可观察 AC 覆盖；尺寸、安全边距、侧栏默认状态、连续顺序、循环、聚焦、失败与最后一项行为均已明确。
- 新交互和双竖条缺陷共享同一前端工作台边界，没有需要用户补充的产品决策。
- 变更不涉及架构层移动或后端业务规则；连续流转和视觉回归需要先补 focused automated protection。

## Open Issues

- 无阻塞项。真实平台字体下的大尺寸密度可在 Tauri 环境追加视觉点测，但不影响自动化验收。

## Verification Evidence

- AC-001：`gitStyles.test.ts` 证明 1180×840px 上限、48px 总视口扣减、manager row flex、210/175/150px 展开基准、34px 折叠 rail 和 editor `flex: 1 1 0`；样式没有新增硬编码十六进制颜色。
- AC-002：`GitConflictResolver.test.tsx` 证明 disclosure 默认展开，控制具有动态 accessible name / `aria-expanded`，折叠后列表从可访问树隐藏、展开后选择恢复；既有 dirty confirmation 继续通过。
- AC-003：resolver 回归覆盖成功后加载并聚焦下一项、末尾循环到首个剩余项、最后一项关闭和失败时停留当前项。
- AC-004：editor extension 移除 current/incoming/active 的 inset shadow，comparison 关闭只读 active-line gutter shadow；marker parser、背景角色与 F7 循环导航回归继续通过。
- AC-005：6 个受影响测试文件的聚焦回归通过；完整 `pnpm check` 通过 ESLint、75 个测试文件共 663 项测试、TypeScript no-emit 和 Vite production build。`git diff --check` 通过。
- production build 继续把 `GitConflictInputComparison` 保持为约 24.53 kB（gzip 9.06 kB）的独立延迟加载 chunk。

## Residual Risk

- 普通浏览器环境不能构造真实 Tauri Git 冲突会话，因此没有新增端到端截图；组件行为、CodeMirror owner 和布局 contract 已自动化覆盖。建议在真实双冲突仓库中点测一次 1180px 桌面宽度和手动折叠 rail 的视觉密度。
- Vite 仍报告既有主 chunk 超过 500 kB 的非阻塞提示；本次没有把 conflict comparison 合入主 chunk。
