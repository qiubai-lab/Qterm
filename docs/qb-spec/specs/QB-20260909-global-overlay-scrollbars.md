---
id: QB-20260909-global-overlay-scrollbars
type: feature
tier: standard
status: active
created: 2026-09-09
updated: 2026-09-09
supersedes: []
---

# 全局悬浮滚动条与分阶段迁移

## Goal

为 Qterm 的普通滚动窗口提供一套与终端细条一致的共享悬浮滚动条：滚动条不占用内容宽度，滚动或指针靠近时出现，悬停和拖拽时高亮并轻微放大，同时消除原生滚动条槽在固定表头、列表和窗口边缘之间形成的空白断层。

用户已明确授权落地 spec/plan 并开始迁移，因此本变更直接进入 `active`。本变更以 Files 主列表作为首个样板，再扩展到 Git 普通列表和连接/凭证管理列表。

## Current Behavior And Drivers

- Wry/WebView 的原生滚动条是否覆盖内容由平台实现决定；`scrollbar-width: thin`、`scrollbar-color` 和删除固定 gutter 无法保证 overlay，也无法提供一致的 hover/drag 放大。
- Files 表头与内容共用 `.file-browser-content`；原生 scrollbar track 会在右侧保留可见槽，形成截图中的表头断层。
- Files 与 Git 更改列表依赖真实 viewport 的 `scrollTop`、`clientHeight` 和 scroll event，迁移不得改变虚拟列表、锚点恢复或上下文菜单定位。
- xterm、CodeMirror 和 Git diff overview 已有专用滚动/概览实现，不属于首轮共享迁移范围。

## Scope

- 新增共享 `OverlayScrollArea`，拥有普通 DOM viewport 的滚动指标同步、短暂显隐、边缘唤醒和拖拽映射。
- 支持纵向与横向溢出；thumb 以绝对定位覆盖在 viewport 内侧，不参与布局。
- 首轮迁移 Files 主列表；随后迁移 Git 普通列表及连接/凭证管理列表。
- 使用现有主题语义滚动条 token，并提供 reduced-motion 与高对比度适配。
- 保留每个 feature 对 viewport class、ref、scroll handler、role 和 aria label 的所有权。

## Non-Goals

- 不替换 xterm、CodeMirror、Git diff overview/minimap 或浏览器页面内滚动条。
- 不创建第二套滚动位置 store，不持久化滚动条状态。
- 不在本变更中把所有历史弹窗和嵌套代码块一次性迁移。
- 不改变列表宽度、列定义、虚拟化规则或业务交互。

## Requirements

- REQ-001: 共享滚动条必须绝对覆盖在 viewport 边缘，隐藏原生 scrollbar chrome，且不得改变 viewport 的 `clientWidth`/`clientHeight` 或内容布局。
- REQ-002: 仅在对应轴实际溢出时渲染可见 thumb；thumb 的长度和位置必须随 viewport、内容尺寸与 scroll position 同步。
- REQ-003: 滚动、键盘滚动、指针接近边缘或拖拽期间显示滚动条；交互结束后约 1 秒淡出。常规表面从约 3px 增至约 5px，紧凑浮层从约 2px 增至约 4px，并使用主题强调色。
- REQ-004: thumb 拖拽必须通过 pointer capture 映射到原生 `scrollTop`/`scrollLeft`，不得阻断滚轮、触控板、键盘和程序化滚动。
- REQ-005: 共享层只拥有表现与 DOM 滚动同步；feature 保留滚动事件、ref、语义属性、虚拟化与业务状态。
- REQ-006: reduced-motion 下禁用显隐和缩放过渡；高对比度模式保持可辨识边界。隐藏滚动条不得进入辅助技术树。
- REQ-007: 首轮 Files 迁移必须保持 sticky 表头连续、横向窄窗滚动、虚拟范围、目录切换滚动恢复与拖放覆盖层行为。
- REQ-008: Git、连接和凭证的后续迁移复用同一 owner，不复制指标、显隐或拖拽状态机；专用编辑器/终端滚动表面保持原实现。
- REQ-009: 共享组件必须支持参与 thumb 尺寸、位置和拖拽换算的轨道安全区；Files 的纵向轨道避开 sticky 表头，连接选中面不得越过列表选项边界，Git 分支浮层不得为原生滚动条保留额外右侧空白。
- REQ-010: 内容自适应的 Git 分支浮层必须由真实 viewport 持有高度上限和 `overflow`；共享 wrapper 只负责可收缩布局与 overlay，不得形成百分比高度循环。分支名称 tooltip 只锚定可能截断的名称节点，不得锚定包含整行元数据的 option。

## Behavior Delta

### ADDED

- REQ-001, REQ-002, REQ-003, REQ-004: 普通滚动窗口获得不占布局的双轴主题化悬浮滚动条与直接拖拽能力。
- REQ-006: 共享滚动条具有 reduced-motion 和高对比度行为。

### MODIFIED

- REQ-007: Files 主列表从 WebView 原生细滚动条迁移到共享 overlay，原 viewport 和列表行为保持不变。
- REQ-008: Git 与管理器普通列表按阶段从各自的原生 scrollbar 声明迁移到共享组件；专用表面不变。
- REQ-009: Files、连接列表和 Git 分支浮层分别获得表头安全区、选中框宽度约束和紧凑对称边距。
- REQ-010: 修正分支列表迁移后的不可滚动回归，并消除行级 `title` 导致的 tooltip 锚点漂移。

## Acceptance

| ID | 对应需求 | 可观察结果 |
| --- | --- | --- |
| AC-001 | REQ-001, REQ-007 | Files 表头到右边缘连续，无原生 scrollbar 槽或布局预留；窄窗仍可横向滚动。 |
| AC-002 | REQ-002, REQ-003 | 自动化测试证明无溢出时不显示；滚动和边缘接近时显示，约 1 秒后淡出；thumb 位置/尺寸与两轴指标一致。 |
| AC-003 | REQ-004, REQ-005 | 拖拽测试证明 pointer movement 更新原 viewport scroll position；原 `onScroll` 与外部 ref 继续接收同一 viewport。 |
| AC-004 | REQ-006 | 样式检查证明 reduced-motion 禁用 transition，高对比度提供明确 thumb；overlay 设为 `aria-hidden`。 |
| AC-005 | REQ-007 | Files 现有虚拟化、锚点恢复、目录切换和列表交互测试通过，并增加共享 wrapper 接线回归。 |
| AC-006 | REQ-008 | 每个迁移表面只组合共享组件；仓库检索没有新增 feature-local thumb 指标/拖拽实现，xterm/CodeMirror/Git diff 未被改写。 |
| AC-007 | REQ-003, REQ-009 | Files thumb 不进入表头；连接选中面左右边界与选项一致且不和滚动条重叠；Git 分支列表使用对称 4px padding 和 2px 紧凑 overlay。 |
| AC-008 | REQ-010 | 长分支列表在 280px/可用视口上限内由 listbox 自身滚动；wrapper 不持有 `max-height`；普通分支名称不产生整行 tooltip，截断名称仍可从名称节点读取完整值。 |

## Recommended Design

`src/components/scrollbars/OverlayScrollArea.tsx` 是唯一交互 owner。它渲染一个 `position: relative; overflow: hidden` 的 shell、保持真实可滚动 viewport，并在 sibling overlay layer 中渲染双轴 thumb。指标同步使用 `requestAnimationFrame` 合并 scroll 更新，使用 `ResizeObserver` 监听 viewport 与内容尺寸；缺少 observer 时仍通过 scroll、mount 与 rerender 同步。

组件通过转发 ref 和原样传递 viewport props 保持稳定 DOM 契约。CSS 只拥有视觉尺寸、颜色、transition 与媒体查询；feature CSS 只负责 shell 在原布局中的 flex/grid 尺寸，不复制滚动状态机。

## Implementation Plan

- [x] 建立共享 `OverlayScrollArea`、样式和相邻行为测试，覆盖双轴指标、自动隐藏、边缘唤醒、拖拽与外部 ref/scroll handler。
- [x] 将 Files 主列表接入共享组件，迁移原 flex/overflow 所在位置并保护既有虚拟滚动行为。
- [ ] 将 Git 更改列表和普通仓库/分支/历史列表分批接入；Git 更改列表与分支浮层已完成，仓库/历史列表待后续批次；排除 diff overview 与 CodeMirror。
- [x] 将连接与凭证管理主列表接入，并确认 selection indicator 的定位/测量仍以 viewport 为基准。
- [x] 更新 Directory Map 与 source-size baseline，运行 focused tests、lint、typecheck、source-size 和 production build。

## Verification Mapping

| Acceptance | Planned check |
| --- | --- |
| AC-001 | Files 组件/样式回归测试与桌面截图检查。 |
| AC-002 | `OverlayScrollArea.test.tsx` 几何、scroll、timer 与 edge pointer 测试。 |
| AC-003 | pointer drag、forwarded ref 与 `onScroll` 测试；Files/Git 既有交互测试。 |
| AC-004 | DOM aria assertion 与 CSS source assertion。 |
| AC-005 | `FileBrowserPane.test.tsx`、`fileBrowserModel.test.ts` 和相关 Files 样式测试。 |
| AC-006 | 迁移点源码检查及对应 Git/Connection/Credential focused tests。 |
| AC-007 | shared geometry 测试、连接 selection inset 样式契约、Git 分支 wrapper/对称 padding 接线测试。 |

## Risks And Rollback

- ResizeObserver 与 jsdom/WebView 时序差异可能导致首次指标延迟；组件必须在 layout effect 中先同步一次，并在内容变化时可重算。
- overlay hit area 不能永久覆盖最右侧内容；隐藏时不接收 pointer，只有边缘唤醒或可见期间启用拖拽层。
- wrapper 可能影响 flex/grid min-size 或 container query；每个迁移点需要显式 `min-width: 0; min-height: 0`，Files 的 container query 继续由原 feature root 负责。
- 若共享组件出现阻断性回归，可逐表面回退到原 viewport markup；不需要数据迁移或持久化回滚。

## Verification Evidence

- AC-002/AC-003/AC-004: `OverlayScrollArea.test.tsx` 与样式契约共 7 项通过，覆盖双轴指标、外部 ref/scroll handler、1 秒显隐、无溢出、边缘唤醒、pointer-capture 拖拽、aria-hidden、hover/drag 尺寸和 reduced-motion。
- AC-005/AC-006: Files、Git、Connection、Credential focused suite 与样式契约通过；Files 既有目录恢复/虚拟列表用例继续使用 `.file-browser-content` 真实 viewport，三个管理表面接线测试确认共享 shell。
- AC-007: 共享组件测试证明 Files 的 28/3/3 轨道安全区参与 thumb 几何与拖拽映射；连接样式测试锁定选中面与选项共用 7px 左右 inset；Git 分支测试锁定 compact density、对称 4px padding 和无原生 scrollbar 声明。
- AC-008: `gitBranchOverlayStyles.test.ts` 锁定真实 listbox 的 `height: auto`、280px 上限和 `overflow-y: auto`，以及 wrapper 的可收缩无上限契约；`GitPane.branches.test.tsx` 锁定 option 不再持有行级 `title`、完整名称只挂在可截断的名称节点。
- 仓库完整 `pnpm check` 通过：152 个 Vitest 文件 / 1016 项测试、17 项 Node 脚本测试、ESLint、TypeScript、source-size（0 reminders）及 Vite production build。
- AC-001 的桌面像素级截图确认，以及 AC-006 中 Git 仓库/分支/历史次级列表迁移，保留到下一批次；本 active change 暂不归档。

## Quality Check

这是 `feature + standard`：它增加跨表面的共享用户交互并需要分阶段协调，但不改变安全、持久化、IPC 或公共数据契约。REQ-001–008 均有 AC 覆盖，Files 首轮与后续迁移边界明确，xterm/CodeMirror/Git diff 排除项明确，无需在实现前补充产品选择。
