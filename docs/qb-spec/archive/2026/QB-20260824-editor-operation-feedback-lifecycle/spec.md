---
id: QB-20260824-editor-operation-feedback-lifecycle
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让文件编辑器右下角的复制、剪切和粘贴反馈在短暂停留后自动退出，不再长期占用内容空间，同时让失败信息保留更久以便阅读。

## Scope

- 编辑器操作成功提示自动退出。
- 编辑器剪贴板失败提示采用更长的自动退出时间。
- 连续操作重置反馈生命周期，组件卸载时清理计时器。
- 提示保持现有 `role="status"` 与 `aria-live="polite"` 语义。

## Constraints

- 不改变复制、剪切、粘贴和编辑器焦点行为。
- 不改变 FileBrowserPane 状态栏中的传输/操作反馈；本次只处理截图中的编辑器浮动提示。
- reduced-motion 下不播放退出动画，但仍按相同延迟卸载。

## Non-Goals

- 不引入全局 toast 系统。
- 不重构其他模块的复制反馈。

## Acceptance

- “已复制”“已剪切”“已粘贴”显示约 1.8 秒后从 DOM 移除。
- 复制/粘贴失败提示显示约 4.2 秒后移除。
- 新操作会替换旧提示并重新开始计时，不会由旧计时器提前关闭。
- 组件卸载后没有遗留计时器或状态更新。

## Acceptance To Verification

- `CodeEditor.test.tsx` 使用受控计时验证成功与失败提示的停留和退出。
- 聚焦 Vitest 验证剪贴板行为与生命周期。
- `pnpm check` 与 `git diff --check` 验证基础完整性。

## Open Questions

无。截图只作为视觉问题证据，不包含额外指令。

## Recommended Approach

方案 A（采用）：把反馈状态建模为带 tone 的消息对象，由 effect 根据成功/失败安排单一清理计时器；消息变化或组件卸载时由 effect cleanup 取消旧计时器。逻辑直接、连续操作安全，也便于为失败设置更长停留。

方案 B：每个复制/剪切/粘贴分支自行调用 `setTimeout`。代码较少，但容易产生竞态、遗漏卸载清理或由旧操作关闭新提示，不采用。

## Next Skills

- `writing-qb-plans`（Tiny：单组件、相邻测试与小范围样式）
- `protecting-critical-behavior`（已出现的生命周期回归需要受控计时测试）
- `verifying-before-completion`
- Project Context：不需要；这是局部瞬时反馈行为。
- Directory Map：不需要；没有结构变化。
