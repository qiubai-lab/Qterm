---
id: QB-20260901-git-conflict-floating-file-list
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
---

# Git 冲突工作台大视野与悬浮文件列表实施计划

## Requirement

执行 spec 的 REQ-001 至 REQ-006：修复 dialog cascade，提升 conflict-local 信息密度，将文件列表重构为锚定文件夹按钮且不改变 editor 几何的悬浮 disclosure，并保护既有冲突处理流程。

## Scope

- 修改 `GitConflictResolver` 的 sidebar DOM、folder toggle 语义和成功选择后的收起行为。
- 修改 feature-local CSS 的高优先级尺寸、34px rail、floating panel material/motion、editor 字号与降级规则。
- 修改 resolver 与 style contract 测试，不改变 Git IPC/backend 或共享 DialogFrame。

## Affected Files

- `src/git/GitConflictResolver.tsx`
- `src/git/GitConflictResolver.test.tsx`
- `src/git/styles/gitConflictResolver.css`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/{specs,plans}`

## Design

- 使用 `.dialog-frame.dialog-wide.git-conflict-dialog` 三 class selector 覆盖后加载的共享 two-class selector，宽高为 `min(1480px, calc(100vw - 48px))` 与 `min(920px, calc(100vh - 48px))`。
- manager 继续 row flex；sidebar 固定 `flex: 0 0 34px` 且 `position: relative; overflow: visible`，editor 保持 `flex: 1 1 0; min-width: 0`。popover 绝对定位于 rail 右侧并覆盖 editor，不参与 flex sizing。
- popover 常驻 DOM。关闭态使用 `aria-hidden=true`、`visibility:hidden`、`pointer-events:none`、opacity/translate/scale；打开态恢复可见与命中。transform origin 固定为 left top，进入/离开共享同一 state-derived transition。
- toggle 复用 `files` folder glyph。直接选择无 dirty 文件后收起；dirty 文件先保留 popover 与 confirmation，确认放弃并切换后收起。
- `.git-conflict-dialog .cm-editor` 在 feature CSS 尾部局部设置 11px / 1.45，避免修改全局 terminal token。

## Implementation Tasks

- [x] 先更新 dialog cascade、固定 rail、popover motion/font contract 与 folder disclosure/选择收起行为测试，确认旧实现失败。
- [x] 重构 resolver sidebar markup 和选择状态编排，保留 dirty confirmation、自动下一项和关闭逻辑。
- [x] 实现 1480×920 高优先级尺寸、11px editor、悬浮 material、锚定开合与 accessibility/reduced-* 降级。
- [x] 运行聚焦测试、完整 `pnpm check` 和 `git diff --check`，记录 evidence 并归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001, AC-002 | `pnpm exec vitest run src/git/gitStyles.test.ts` 的 selector specificity、尺寸与局部字号 contract |
| AC-003, AC-005 | 同一 style test 的 34px rail、absolute popover、motion path、pointer/visibility 与 reduced-* contract |
| AC-004 | `pnpm exec vitest run src/git/GitConflictResolver.test.tsx` 的 folder glyph、aria disclosure、选择后收起与加载 |
| AC-006 | resolver 邻近回归后执行完整 `pnpm check` |

## Test / Verification

1. 修改 focused tests 并运行，证明旧实现无法满足新 contract。
2. 分别落地 DOM/状态和 CSS，重复运行 resolver/style tests。
3. 运行 `GitConflictResolver`、`GitPane.operations`、input comparison、editor extension 和 CodeEditor 邻近测试。
4. 执行 `pnpm check` 与 `git diff --check`；本次不修改 native dependency/config/packaging，不运行桌面打包或 Rust 门禁。

## Trigger Signals

- Architecture boundary：已检查；所有改动保留在现有 Git presentation/style owner，无额外架构 gate。
- Critical behavior：已触发；文件选择、dirty guard 和自动下一项通过 focused tests 保护。
- Directory Map：未触发；没有新增、移动或重命名稳定代码边界。

## Documentation Updates

- spec/plan 已依据用户明确授权进入 `active`；验证通过后追加 evidence，并通过 ordinary completion path 归档。
- Apple motion 原则影响本次 anchored origin、symmetric state transition、无 overshoot 和 reduced-motion 设计；不额外推广为全局项目 context。

## Execution Result

- 以高 specificity feature selector 修复共享 wide dialog 覆盖，实际最大工作区升级为 1480×920px，继续保留每侧 24px 安全边距。
- CodeMirror 在 resolver 内局部改为 11px / 1.45；全局 editor/terminal density 不变。
- sidebar 固定为 34px folder rail，文件列表改为 220px absolute floating material；开合只动画 opacity/transform，不再改变 CodeMirror 宽高，并支持 reduced-motion / reduced-transparency。
- 文件选择后面板收起并恢复可见焦点；dirty confirmation、自动下一项、最后关闭、失败停留、Base 与 binary fallback 均通过回归。
- 聚焦 6 文件 52 项测试、完整 `pnpm check`（75 文件 / 665 tests、lint、typecheck、production build）和 `git diff --check` 均通过。
