## Requirement

修复终端中可见文本被报告为“无结果”的回归，并为真实 xterm 缓冲区搜索建立自动化保护。

## Scope

包含 SearchAddon/xterm 兼容性修正、真实依赖集成测试和现有 TerminalPanel 聚焦回归验证；不扩展搜索功能或调整视觉设计。

## Affected Files

- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/terminal/terminalSearch.test.ts`
- `docs/qb-spec/specs/2026-08-25-terminal-buffer-search-regression.md`

## Design

保留 `terminalSearch.ts` 作为 SearchAddon 生命周期适配层。在 Qterm 创建的 Terminal 实例上显式开启官方 SearchAddon 的 marker/decoration 能力；测试直接实例化真实 Terminal 和 SearchAddon，向 buffer 写入多行文本，再验证大小写不敏感命中和结果计数。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 可见 `system` 文本被命中 | 真实依赖测试断言 `findNext("system")` 返回 `true` |
| 默认大小写不敏感且计数正确 | 真实依赖测试搜索不同大小写并检查 `onDidChangeResults` |
| TerminalPanel 交互不回归 | 运行现有 `TerminalPanel.test.tsx` |
| 前端整体通过 | 运行 `pnpm check` 和 `git diff --check` |

## Test / Verification

1. 在当前配置下先运行真实缓冲区测试，确认 proposed API 异常。
2. 为 Qterm Terminal 实例开启 SearchAddon 所需能力，重跑真实缓冲区测试。
3. 运行 TerminalPanel 聚焦测试。
4. 运行 `pnpm check` 与 `git diff --check`。

## Documentation Updates

- 在 task spec 的 Verification Evidence 中记录最终证据。
- 长期项目上下文与 Directory Map 无需更新。
