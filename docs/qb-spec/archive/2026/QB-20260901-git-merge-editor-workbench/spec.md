---
id: QB-20260901-git-merge-editor-workbench
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 冲突编辑器工作台

## Goal

在既有安全冲突读取与整文件解决闭环上，将冲突入口和编辑弹窗升级为可直接比较“传入 / 当前”、持续查看可编辑结果、识别剩余冲突位置的紧凑合并工作台，减少标签切换和整页动作造成的认知负担。

## Approval

用户于 2026-09-01 明确采纳三阶段 CodeMirror 接入建议，要求落地 spec、plan 并开始修改。

## Baseline

`QB-20260901-git-conflict-resolution` 已提供 Base、当前、传入、结果详情、整文件采用、结果保存、revision 保护和单 path 标记解决。本 change 只修改其前端呈现与编辑器辅助能力，不放宽 Git mutation、IPC 或 SSH 能力。

## Scope

- 冲突列表使用专用合并冲突图标和可见“解决”动作，不再复用暂存 `+` 的视觉语义。
- 默认同时显示左侧传入、右侧当前，下方持续显示可编辑结果；Base 作为可选辅助视图，不再与两个输入竞争主标签。
- 整文件“采用传入 / 采用当前”动作放在对应输入标题附近，完成与暂存动作保留在固定结果 footer。
- 修复 manager 内容未占满剩余高度的问题，并为受限宽度定义稳定降级布局和明确滚动 owner。
- 通用 `CodeEditor` 接受 feature-local CodeMirror extensions，并暴露已挂载 `EditorView` 的受控生命周期回调。
- 结果编辑器识别标准 Git 文本冲突标记，提供行级高亮、gutter 标识、剩余数量以及上一处 / 下一处导航。
- 新增按需加载的双路 `@codemirror/merge` 输入比较组件，为两份文本输入提供差异高亮和行对齐；结果编辑器和 Git 解决决策保持独立。

## Non-Goals

- 本 change 不新增逐块“采用当前 / 采用传入 / 两者都采用”的结果生成算法，也不把双路 diff 当作完整三路 merge 决策。
- 不以字符串冲突标记数量替代 Git index 是否仍有未合并 entry；标记扫描只提供编辑辅助和警告。
- 不改变 Base/当前/传入来源、revision 校验、单 path staging、continue/abort 或本机/SSH 契约。
- 不引入新的 UI、图标或动画库；`@codemirror/merge` 仅作为现有 CodeMirror 6 体系内的编辑器能力包。
- 不自动保存、自动标记解决或自动继续合并。

## Assumptions And Constraints

- Incoming 固定在左、Current 固定在右、Result 固定在下；窄宽度可以纵向堆叠输入，但不得隐藏结果或产生页面级水平滚动。
- Base 默认收起，显式操作后在输入区上方展开；缺失、二进制或 unsupported 版本继续显示稳定状态而不是伪造空文本。
- 输入比较只在当前和传入均为文本时启用；其他组合使用现有版本状态表面。
- CodeMirror 扩展只处理编辑器状态、装饰和导航；Git 文件选择、草稿确认、保存和 resolution orchestration 继续由 `GitConflictResolver` 拥有。
- Qterm UI specification 是布局、滚动、语义 token、焦点和 reduced-motion 的规范来源。

## Requirements

- REQ-001：冲突行必须使用与 stage/unstage 不同的专用语义图标，并以持久文字或等价可访问名称暴露“解决冲突”动作。
- REQ-002：文本冲突默认必须同时呈现传入和当前输入，标签、来源状态与整文件采用动作必须空间对应；结果编辑器必须同时保持可见。
- REQ-003：Base 必须是显式可展开的辅助视图；打开和关闭不得丢失结果草稿、改变选中 path 或触发 Git mutation。
- REQ-004：manager dialog 内容必须占满 header 以下可用空间；冲突列表、输入比较和结果编辑分别拥有明确滚动边界，固定 header/footer 在窄窗口与低高度下仍可访问。
- REQ-005：通用 CodeEditor 必须以可组合 Extension 接口接入 feature-local 能力，并在挂载/销毁时可靠暴露和清理 EditorView，不破坏 Files 编辑器现有语言、剪贴板和保存行为。
- REQ-006：结果编辑器必须把完整标准 Git marker 组识别为冲突块，按 current/separator/incoming/boundary 角色装饰行，显示剩余块数量，并支持循环的上一处 / 下一处定位。
- REQ-007：冲突 marker 扫描必须容忍不完整 marker、普通相似文本和编辑过程，不得阻止保存或覆盖 Git index 的真实 readiness 判断。
- REQ-008：当当前和传入均为文本时，输入区必须按需加载 CodeMirror 双路 merge view，以只读方式显示差异并对齐变化块；组件销毁后不得保留 view 或事件资源。
- REQ-009：既有整文件采用、删除、暂存当前结果、保存并标记已解决、未保存确认、loading/error/unsupported 及多文件流转行为必须保持兼容。

## Behavior Delta

### ADDED

- 专用 merge-conflict 图标、双路差异输入、Base 辅助展开、结果冲突块高亮/计数/导航。
- CodeEditor 的 feature-local Extension 和 view lifecycle 接口。

### MODIFIED

- 原 Base/当前/传入 peer tabs 改为稳定的传入/当前并排输入和可选 Base。
- 原集中在 footer 的整文件采用动作移动到对应输入标题；结果级动作仍固定在 footer。
- 原未占满 dialog 的编辑区域改为完整占用剩余高度。

### REMOVED

- 冲突入口使用 `+` 暂存图标的歧义行为。

## Acceptance Criteria

- AC-001 [REQ-001]：GitPane 行为测试证明冲突行显示专用图标与“解决”动作，普通未暂存行仍显示暂存动作。
- AC-002 [REQ-002, REQ-003, REQ-009]：Testing Library 证明传入/当前同时可见、对应整文件动作仍调用原 resolution、Base 可展开/收起且草稿保持、结果编辑和完成行为不回归。
- AC-003 [REQ-004]：样式契约证明 dialog content 使用 `flex: 1; min-height: 0`，输入/结果/列表滚动 owner 明确，并存在窄宽度与 reduced-motion 规则。
- AC-004 [REQ-005]：CodeEditor 测试证明自定义 Extension 生效、ready 回调在 mount/unmount 成对触发，原编辑/只读/保存/剪贴板行为保持通过。
- AC-005 [REQ-006, REQ-007]：纯模型和 CodeMirror 聚焦测试覆盖完整、多块、不完整和相似普通文本，证明冲突计数、角色范围及循环导航稳定。
- AC-006 [REQ-008]：输入比较组件测试证明 text/text 创建只读 merge view，非文本版本使用稳定 fallback，卸载时销毁实例。
- AC-007 [REQ-009]：既有 `GitConflictResolver`、GitPane operation、Files CodeEditor 回归测试以及 `pnpm check` 通过。

## Architecture Boundary Decision

- `src/git/GitConflictResolver.tsx`：拥有文件选择、草稿、Base visibility、Git resolution 编排与页面语义。
- `src/git/editor/`：拥有冲突 marker 纯解析、CodeMirror 装饰/导航和双路输入 view adapter；不调用 Tauri 或执行 Git resolution。
- `src/files/CodeEditor.tsx`：只增加通用 Extension 与 view lifecycle 接缝，不感知 Git。
- `src/lib/tauri/git.ts` 与 Rust Git layers：保持不变；仍是版本来源和解决结果的权威边界。

## Quality Check

- 目标、范围与非目标清晰；REQ-001 至 REQ-009 均有 AC 覆盖。
- 双路 diff 与三路 resolution 的边界被显式区分，marker 扫描不会提升为业务 readiness。
- loading、unsupported、窄窗口、销毁清理和既有 Files 行为包含在验收中，无阻塞歧义。

## Open Issues

- 无阻塞项。逐块接受和自动组合保留为后续独立 change，在建立三路冲突模型前不通过 UI 暗示已经支持。

## Verification Evidence

- AC-001 至 AC-006：聚焦运行 `GitPane.operations`、`GitConflictResolver`、`gitStyles`、`CodeEditor`、marker model 与 `GitConflictInputComparison`，共 6 个测试文件、46 个测试通过。
- AC-007：`pnpm check` 通过，包含 ESLint、75 个测试文件共 659 个测试、TypeScript no-emit 和 Vite production build。
- 生产构建将 `GitConflictInputComparison` 输出为约 24.51 kB（gzip 9.04 kB）的独立延迟加载 chunk，未进入冲突页前不主动加载。
- `git diff --check` 通过；Directory Map 已记录 `src/git/editor/` 的 presentation-only owner。
- Qterm 样式契约确认 dialog content `flex: 1/min-height: 0`、sidebar/input/result 独立滚动、960px manager、820px/650px 降级和 reduced-motion；普通浏览器预览因缺少 Tauri Git IPC 无法构造真实冲突数据，未获得端到端截图。

## Residual Risk

- `@codemirror/merge` 只比较 Incoming 与 Current；它不生成三路结果，逐块接受仍需后续独立冲突模型。
- 建议在可运行 Tauri 的真实多冲突仓库中补一次 960px、820px 和低高度窗口点测，确认平台字体下的面板密度与滚动手感；该项不影响当前自动化验收结果。
