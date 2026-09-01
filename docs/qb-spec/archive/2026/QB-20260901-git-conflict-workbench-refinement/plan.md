---
id: QB-20260901-git-conflict-workbench-refinement
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
---

# Git 冲突工作台尺寸与连续处理实施计划

## Requirement

执行 spec 的 REQ-001 至 REQ-006：只修改冲突工作台的前端布局、会话交互、连续导航和 CodeMirror 装饰，不改变既有 Git resolution 契约。

## Scope

- 修改 `GitConflictResolver` 的侧栏 disclosure 与成功 resolution 后的 path/focus 编排。
- 修改 feature-local CSS 的 dialog 上限、flex shrink、窄宽降级和 CodeMirror 单竖条覆盖。
- 修改冲突 editor extension 中重叠的行级 box-shadow。
- 补充 resolver 行为与 style contract 测试；复用既有 editor/input comparison 回归。

## Affected Files

- `src/git/GitConflictResolver.tsx`
- `src/git/GitConflictResolver.test.tsx`
- `src/git/editor/gitConflictEditorExtension.ts`
- `src/git/editor/GitConflictInputComparison.tsx`
- `src/git/styles/gitConflictResolver.css`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/{specs,plans}`

## Design

- dialog 上限提高到 1180×840px，viewport gutter 使用 48px 总扣减以保留每侧 24px。
- manager 使用 row flex；sidebar 展开为 `flex: 0 0 210px`，折叠为 34px rail，editor 使用 `flex: 1 1 0; min-width: 0`。不动画 flex-basis，避免布局位移动画。
- disclosure button 位于 sidebar title，折叠时仅保留该 button；列表和说明通过 `hidden` 从视觉和可访问树同时移除。
- 使用纯 `nextRemainingConflictPath` 按原顺序从当前项之后查找，并循环；snapshot `remaining` 决定候选集合。切换前清空旧 detail，下一结果 view ready 时一次性 focus。
- 通用 active-line gutter 是唯一活动行竖条 owner。comparison 显式禁用只读 active-line/gutter 指示，结果冲突 current/incoming/active 装饰只使用背景，不再绘制 inset shadow。

## Implementation Tasks

- [x] 先为侧栏 disclosure、连续前进/循环/聚焦和单竖条 style contract 增加失败测试。
- [x] 实现纯 next-path 选择与 resolver focus handoff，保留失败和零剩余路径行为。
- [x] 将 sidebar 改为 accessible disclosure rail，并更新提示文案为连续处理语义。
- [x] 扩大 dialog，完成 manager/sidebar/editor flex 与窄宽规则。
- [x] 消除 comparison/result 的重叠竖条，同时保留 diff/conflict 背景和 marker。
- [x] 运行聚焦测试、`pnpm check` 与 `git diff --check`，记录 evidence 后归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `pnpm exec vitest run src/git/gitStyles.test.ts` 中尺寸与 flex contract |
| AC-002 | `pnpm exec vitest run src/git/GitConflictResolver.test.tsx` 中 disclosure/dirty 流程 |
| AC-003 | 同一 resolver 测试中的 next、wrap、focus、close/error 场景 |
| AC-004 | `gitStyles.test.ts` 和 `gitConflictEditorExtension.test.ts` 的单竖条/marker 回归 |
| AC-005 | 受影响聚焦测试后执行 `pnpm check` |

## Test / Verification

1. 先运行新增 resolver/style 测试，确认旧实现对新 contract 失败。
2. 按状态逻辑、DOM 语义、布局、装饰四个切片分别运行聚焦测试。
3. 运行 resolver、input comparison、editor extension、GitPane operation 和 CodeEditor 邻近回归。
4. 执行完整 `pnpm check` 与 `git diff --check`；本次不改 native dependency/config/packaging，不运行桌面打包或 Rust 门禁。

## Trigger Signals

- Architecture boundary：未触发额外 gate；所有逻辑留在现有 Git presentation/editor owner，后端契约不变。
- Critical behavior：已触发；多文件连续顺序、失败不前进、最后关闭和 dirty 保护先由 focused tests 固化。
- Directory Map：未触发；没有新增或移动稳定目录职责。

## Documentation Updates

- 实现开始后 spec/plan 更新为 `active`；验证通过后写入 evidence，并通过 ordinary completion path 一并归档。
- 不推广长期 UI context；本次采用的 flex/viewport 规则已由 Qterm UI specification 覆盖。

## Execution Result

- dialog 上限由 960×720px 提高到 1180×840px，并继续通过 `calc(100vw/100vh - 48px)` 保留每侧 24px 安全边距。
- manager/sidebar/editor 已改为 flex shrink contract；侧栏默认 210px，可收起为 34px rail，并在 820/650px 断点下降为 175/150px。
- resolution 成功后依据后端 remaining snapshot 按原顺序前进、末尾循环并聚焦新结果 editor；错误停留当前项，零剩余关闭。
- comparison 只读 active gutter 和 result conflict inset shadow 已去重，保留单一通用活动行 rail、diff 背景与 conflict marker。
- 聚焦测试、完整 `pnpm check` 和 `git diff --check` 均通过；无需 Directory Map、Rust 门禁或 desktop package build。
