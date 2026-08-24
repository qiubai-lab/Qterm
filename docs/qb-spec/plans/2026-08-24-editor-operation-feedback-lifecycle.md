## Goal

让编辑器操作反馈按成功/失败时长自动退出，并安全处理连续操作与组件卸载。

## Affected Files

- `src/files/CodeEditor.tsx`
- `src/files/CodeEditor.test.tsx`
- `src/files/fileBrowser.css`

## Acceptance To Verification

- 成功提示约 1.8 秒退出：`CodeEditor.test.tsx` fake timer 行为测试。
- 失败提示约 4.2 秒退出：既有失败测试扩展生命周期断言。
- 新消息/卸载清理旧计时器：effect cleanup 与组件测试清理验证。
- reduced-motion 保持延迟但不播放动画：CSS 契约检查与完整构建。

## Verification

- 先更新生命周期测试并运行 `pnpm vitest run src/files/CodeEditor.test.tsx`，确认旧实现失败。
- 实现后重跑聚焦测试。
- 运行 `pnpm check` 与 `git diff --check`。
