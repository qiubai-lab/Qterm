---
id: QB-20260901-git-merge-editor-workbench
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
---

# Git 冲突编辑器工作台实施计划

## Requirement

执行 spec 的 REQ-001 至 REQ-009：在不改变 Git/Tauri resolution 契约的前提下，补齐专用冲突入口、稳定三路空间布局、CodeMirror 冲突辅助扩展和按需双路差异输入。

## Scope

- 修改 Git conflict presentation、feature-local editor adapter、通用 CodeEditor 接缝、Icon vocabulary、相关 CSS/测试和前端依赖。
- 不修改 Rust、IPC DTO、SSH、本机 Git adapter 或逐块结果生成规则。

## Affected Files

- `src/git/GitPaneSections.tsx`
- `src/git/GitConflictResolver.tsx`
- `src/git/editor/*`
- `src/git/styles/gitConflictResolver.css`
- `src/components/Icon.tsx`
- `src/files/CodeEditor.tsx`
- 邻近 `*.test.ts(x)` 与 `src/git/gitStyles.test.ts`
- `package.json`、`pnpm-lock.yaml`
- `docs/qb-spec/{specs,plans}`；若新增目录职责需要稳定记录则更新 `DIRECTORY_MAP.md`

## Design

- 使用 Qterm manager dialog 的 sidebar + editor 骨架，确保 `.dialog-content` 拥有剩余高度，输入和结果各自 `minmax(0, ...)`。
- Incoming 左、Current 右、Result 下；Base 是显式 disclosure。整文件采用动作靠近对应输入，完成动作留在固定 footer。
- `GitConflictInputComparison` 是 `@codemirror/merge` 的 React lifecycle adapter，只创建两个只读 EditorView；GitConflictResolver 不直接管理其 DOM。
- `gitConflictExtension()` 组合 StateField、Decoration、gutter、theme 和 keymap；纯 parser 可脱离 DOM 测试。
- 通用 CodeEditor 只接受 `extensions?: Extension` 和 `onViewReady?`，不导入 Git 类型。
- marker count 是辅助状态；保存可用性仍由 dirty/revision 和后端真实冲突状态控制。

## Implementation Tasks

- [x] 为冲突列表语义图标、双输入/Base disclosure、冲突计数导航和 CodeEditor lifecycle 增加失败测试。
- [x] 新增 `mergeConflict` Icon，并让 Git change list 显式选择 action icon/label，消除 stage `+` 复用。
- [x] 将 resolver 重构为 Incoming/Current 输入头、按需 Base、持续 Result 和固定结果 footer，修复完整高度及响应式滚动。
- [x] 扩展 CodeEditor 的 Extension/view lifecycle 接缝，实现 marker parser、StateField、Decoration、gutter 与上下冲突命令。
- [x] 增加 `@codemirror/merge` 和 lazy `GitConflictInputComparison`，覆盖 text/text 与 fallback/destroy。
- [x] 更新样式契约和必要 Directory Map，执行聚焦测试、`pnpm check` 与 diff hygiene。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `pnpm exec vitest run src/git/GitPane.operations.test.tsx` 中的 conflict action 语义断言 |
| AC-002 | `pnpm exec vitest run src/git/GitConflictResolver.test.tsx` |
| AC-003 | `pnpm exec vitest run src/git/gitStyles.test.ts` 与受限视口 CSS review |
| AC-004 | `pnpm exec vitest run src/files/CodeEditor.test.tsx` |
| AC-005 | `pnpm exec vitest run src/git/editor/gitConflictEditorExtension.test.ts` |
| AC-006 | `pnpm exec vitest run src/git/editor/GitConflictInputComparison.test.tsx` |
| AC-007 | 上述聚焦回归后执行 `pnpm check` 和 `git diff --check` |

## Test / Verification

1. 先运行新增 parser/组件测试，确认旧实现失败。
2. 完成每个垂直切片后运行对应聚焦测试。
3. 运行全部受影响 Git/Files 测试和 CSS contract。
4. 最后运行 `pnpm check`；本次没有 native dependency/config/packaging 变化，不运行 desktop package build 或 Rust 全量门禁。

## Documentation Updates

- 实现开始时 spec/plan 保持 `active`；验证通过后记录 evidence 并由 ordinary completion path 归档。
- 仅当 `src/git/editor/` 形成稳定 owner 时更新 Directory Map，不改写长期产品或 UI context。

## Style Context

- 遵循 `.agents/skills/qterm-interface-design/references/qterm-ui-spec.md`：紧凑 manager、明确 scroll owner、持久核心动作、semantic tokens、可见 focus、窄窗口和 reduced-motion。
- 不引入新 UI/图标/动画依赖；冲突图标进入现有 `Icon` stroke vocabulary。

## Trigger Signals

- Architecture boundary：已检查；冲突解析/编辑器适配进入 `src/git/editor`，Git mutation 保持现有 application/IPC owner。
- Critical behavior：已触发；marker 边界、导航循环、草稿保持和整文件 resolution 需要聚焦自动化保护。
- Directory Map：新增稳定 `src/git/editor` owner 后需要最小更新。

## Execution Result

- 全部实施任务完成；没有修改 Rust、Tauri IPC、SSH 或 Git resolution 语义。
- 聚焦测试 46/46 通过，完整 `pnpm check` 的 659/659 测试、lint、typecheck 和 build 通过，`git diff --check` 通过。
- 普通浏览器缺少 Tauri Git IPC，真实冲突弹窗的端到端视觉截图留作 Tauri 环境点测；组件行为和 CSS contract 已覆盖布局、窄宽、滚动与 reduced-motion。
