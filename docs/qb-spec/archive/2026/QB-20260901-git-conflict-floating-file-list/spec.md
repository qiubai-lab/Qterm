---
id: QB-20260901-git-conflict-floating-file-list
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 冲突工作台大视野与悬浮文件列表

## Goal

让冲突解决工作台真正使用大尺寸桌面空间，以更紧凑的编辑器文字展示更多上下文；将冲突文件列表改为从文件夹按钮展开的悬浮层，使其开合具有清晰、克制且可打断的空间动效，同时不改变比较区和结果编辑器的几何尺寸。

## Approval

用户于 2026-09-01 提供当前冲突工作台截图，并明确要求进一步放大窗口最大宽高、缩小编辑器文字、将展开入口改为文件夹图标、增加展开/收起动画，以及让文件列表悬浮而不挤占编辑器空间。

## Baseline

冲突 dialog 的 feature 样式声明了 1180×840px 上限，但 `dialogFrame.css` 在 `git.css` 之后加载，且 `.dialog-frame.dialog-wide` 选择器优先级更高，最终界面仍被共享 790×680px 上限覆盖。文件列表当前以 34/210px flex basis 切换，展开会改变 CodeMirror 可用宽度并触发重排；列表通过 `hidden` 卸载视觉状态，无法执行关闭动画；展开入口使用方向箭头，不能直观表达“冲突文件”。

## Scope

- 使用高于共享 wide dialog 的 feature-local 选择器，将有效桌面上限提高到 1480×920px，同时保留每侧至少 24px 的视口安全边距。
- 将 conflict resolver 内的 CodeMirror 字号局部调整为 11px，不修改全局 terminal/editor 字号。
- 将左侧 owner 固定为 34px 文件夹 rail，列表作为相对 rail 定位的悬浮面板覆盖在编辑区上方，开合期间不改变 manager/editor 的布局尺寸。
- 使用现有 folder-shaped `files` 图标作为入口，并保留动态 accessible name、`aria-expanded`、`aria-controls` 和键盘访问。
- 以 opacity + transform 实现锚定按钮原点、进出路径对称、无 overshoot 的开合动画，并为 reduced motion / reduced transparency 提供降级。
- 补充 resolver 行为与 CSS cascade/layout contract 回归测试。

## Non-Goals

- 不修改共享 `DialogFrame`、全局尺寸 token 或其他 wide dialog。
- 不改变 Git conflict detail、resolution、snapshot 或 Rust/Tauri 契约。
- 不改变 Base、Incoming、Current、Result、自动下一冲突和 dirty confirmation 的业务行为。
- 不持久化列表展开状态，不新增图标、动画或浮层依赖。

## Assumptions And Constraints

- 1480×920px 是空间允许时的最大工作区；较小视口继续由 `calc(100vw/100vh - 48px)` 自适应收缩。
- 文件列表默认收起，悬浮面板只属于当前 resolver，会通过同一文件夹按钮或成功选择文件收起。
- `Icon` 的 `files` glyph 已绘制为文件夹轮廓，复用它可保持现有图标语言和包体稳定。
- 动画必须基于 React 展开状态，保持 DOM 挂载以允许离场；关闭状态从可访问树和 pointer hit testing 中移除。

## Requirements

- REQ-001：冲突 dialog 的最终 cascade 必须覆盖共享 `.dialog-frame.dialog-wide` 上限，在可用空间中达到 1480×920px，并始终保留至少 24px 视口边距。
- REQ-002：冲突 resolver 内所有 CodeMirror 输入、Base 和结果编辑器必须使用 11px 局部字号与紧凑但可读的行高，不能影响文件编辑器或终端的全局字号。
- REQ-003：sidebar 必须始终只占 34px rail；悬浮列表展开或收起时不得改变 editor flex basis、grid 尺寸或 CodeMirror host 的可用宽高。
- REQ-004：展开控制必须使用文件夹图标，具有明确的展开/收起 accessible name、`aria-expanded` 和 `aria-controls`；面板关闭时列表不得暴露给可访问树或接收 pointer events。
- REQ-005：悬浮面板必须从文件夹按钮所在的左上锚点以 opacity/translate/scale 进入，并沿对称路径离开；不得动画 width、height 或 flex；reduced motion 下仅保留即时/轻微淡入淡出，reduced transparency 下使用不透明 raised surface。
- REQ-006：展开后的列表必须保持独立滚动、当前项标识和文件选择；成功选择新文件后收起，dirty draft 时仍先进入既有确认流程；自动下一冲突、最终关闭和错误停留行为保持兼容。

## Behavior Delta

### ADDED

- REQ-005：冲突文件列表获得锚定文件夹按钮的悬浮开合动画和无障碍降级。

### MODIFIED

- REQ-001：有效 dialog 上限从被共享样式覆盖的 790×680px 提高为 1480×920px。
- REQ-002：冲突工作台 CodeMirror 字号由全局 13px 局部调整为 11px。
- REQ-003、REQ-004、REQ-006：文件列表从改变 flex basis 的 disclosure 改为固定 rail 上的悬浮 disclosure。

## Acceptance Criteria

- AC-001 [REQ-001]：样式契约证明 feature selector 的 specificity 高于 `.dialog-frame.dialog-wide`，且声明 1480×920px 上限与 48px 总视口扣减。
- AC-002 [REQ-002]：样式契约证明 conflict dialog 内 `.cm-editor` 使用 11px 局部字号和紧凑行高，未修改全局 `--terminal-font-size`。
- AC-003 [REQ-003, REQ-005]：样式契约证明 sidebar 恒为 34px、popover 使用 absolute positioning 和 transform/opacity 动画、关闭状态禁止 pointer events，且不存在展开态 flex-basis 变化。
- AC-004 [REQ-004, REQ-006]：Testing Library 证明默认关闭时文件列表不在可访问树，入口渲染 folder glyph；展开后列表可访问，选择文件后面板收起并加载所选路径。
- AC-005 [REQ-005]：样式契约证明 transform origin、对称 open/closed states，以及 reduced-motion 和 reduced-transparency 降级。
- AC-006 [REQ-006]：既有 resolver dirty protection、自动下一项、最后关闭、错误停留、Base 和 binary fallback 回归以及完整 `pnpm check` 全部通过。

## Architecture Boundary Decision

- `GitConflictResolver` 只拥有 disclosure 状态、无障碍语义和选择后的收起编排，不引入浮层服务或全局状态。
- `gitConflictResolver.css` 只拥有 feature-local dialog override、popover material/motion 和局部 CodeMirror density；共享 `DialogFrame`、CodeEditor 和主题 token 保持不变。
- Git application/domain、Tauri transport 和 Rust infrastructure 不参与本次变更。

## Quality Check

- 根因、最终 cascade、几何稳定性、动画路径、无障碍隐藏、降级和既有流程兼容均有可观察验收。
- 变更跨组件 markup 与 feature CSS，但边界集中、无新依赖或架构移动，适合 standard tier。
- 文件选择与 dirty guard 属于关键交互，先以 focused regression 固化；纯视觉密度以 CSS contract 配合最终真实窗口点测。

## Open Issues

- 无阻塞项。真实 Tauri 窗口下的字体抗锯齿和超宽显示密度需在自动化通过后点测，但不改变实现边界。

## Verification Evidence

- AC-001：`gitStyles.test.ts` 证明 `.dialog-frame.dialog-wide.git-conflict-dialog` 三 class selector 声明 1480×920px 上限和 48px 总视口扣减；它的 specificity 高于后加载的共享 `.dialog-frame.dialog-wide`，因此不再落回 790×680px。
- AC-002：style contract 证明 `.git-conflict-dialog .cm-editor` 局部使用 11px / 1.45，且未修改全局 `--terminal-font-size`。
- AC-003：style contract 证明 sidebar 恒定 `flex: 0 0 34px` 且无任何 `flex-basis` 切换；popover 使用 absolute positioning、独立 220px 上限、opacity/transform/visibility 状态和 pointer-event 隔离，展开不会改变 editor 几何。
- AC-004：`GitConflictResolver.test.tsx` 证明默认关闭、`files` folder glyph、动态 accessible name / `aria-expanded`、关闭态 `aria-hidden`、展开后的 listbox，以及选择新路径后收起并将焦点恢复到可见 toggle。
- AC-005：style contract 证明 popover 使用 left-top origin、对称 closed/open transforms、无 overshoot easing，以及 reduced-motion 100ms opacity-only 和 reduced-transparency opaque raised surface 降级。
- AC-006：6 个受影响测试文件的聚焦回归共 52 项通过；完整 `pnpm check` 通过 ESLint、75 个测试文件共 665 项测试、TypeScript no-emit 和 Vite production build；`git diff --check` 通过。

## Residual Risk

- jsdom 和 CSS contract 无法测量真实 Tauri WebView 的像素几何或字体抗锯齿；已从 selector specificity、固定 flex owner 和 component behavior 三层覆盖实现风险，建议在 1942×974 左右的真实窗口中点测一次 1480×920 工作区和悬浮层遮盖关系。
- Vite 继续报告既有主 chunk 超过 500 kB 的非阻塞提示；conflict comparison 仍保持约 24.53 kB 的独立 lazy chunk，本次未扩大主功能边界。
