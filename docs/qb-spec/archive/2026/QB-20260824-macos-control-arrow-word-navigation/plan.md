---
id: QB-20260824-macos-control-arrow-word-navigation
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

修复 macOS 外接键盘使用 `Ctrl+左/右方向键` 时终端显示 `;3D` / `;3C` 等输入残片的问题，并提供稳定的按单词导航行为。

## Scope

仅修改前端终端输入适配与对应测试；不改变 xterm 依赖、Workspace 状态、PTY/SSH 后端或系统快捷键。

## Affected Files

- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `docs/qb-spec/archive/2026/QB-20260824-macos-control-arrow-word-navigation/spec.md`
- `docs/qb-spec/archive/2026/QB-20260824-macos-control-arrow-word-navigation/plan.md`

## Design

扩展现有 custom key handler：先处理现有复制粘贴，再在 macOS `keydown` 且 Ctrl 或 Option 修饰二选一时识别左右方向键，通过当前 view 的 writer 分别发送 `ESC b` / `ESC f`，返回 `false` 让 xterm 停止二次编码。报告中的 `;3D` 对应 xterm Alt 修饰序列，因此 Option 路径也纳入兼容。其他事件返回 `true`，保持 xterm 默认协议。

## Acceptance To Verification

- macOS Ctrl/Option 左右按单词移动：测试断言 `ESC b` / `ESC f` 写入和事件被消费。
- 单次发送：测试断言 `keyup` 不写入。
- 平台及修饰键隔离：测试断言非 macOS、普通方向键及额外修饰键不被消费。
- 现有输入行为：运行完整 `TerminalPanel` 测试与 `pnpm check`。

## Test / Verification

1. 先新增 macOS Ctrl+方向键的失败回归测试，并确认旧实现失败。
2. 在终端输入适配层实现精确映射。
3. 运行 `pnpm vitest run src/terminal/TerminalPanel.test.tsx`。
4. 运行 `pnpm check`。
5. 运行 `git diff --check`，并核对未覆盖用户已有工作区改动。

## Documentation Updates

新增本 task spec 和 Standard plan。无需更新长期项目上下文或 Directory Map。
