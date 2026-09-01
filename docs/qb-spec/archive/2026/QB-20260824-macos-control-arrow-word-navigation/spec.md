---
id: QB-20260824-macos-control-arrow-word-navigation
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

macOS 用户使用内置或外接键盘时，可以在 Qterm 终端中通过 `Ctrl+左/右方向键` 按单词移动命令行光标，不再把方向键控制序列的残片输入为可见文本。

## Scope

- 在 macOS 终端键盘适配层处理 `Ctrl/Option+ArrowLeft` 与 `Ctrl/Option+ArrowRight`；同时覆盖外接键盘或键位映射将物理修饰键报告为 Alt 的情况。
- 将组合键发送为 POSIX shell 行编辑器广泛支持的 Meta-B / Meta-F 单词导航输入。
- 本地终端与 SSH 终端复用同一行为。
- 为左右方向、按键阶段和平台隔离补充回归测试。

## Constraints

- 保持终端高频输入直接进入当前 block writer，不进入 Workspace reducer 或持久化状态。
- 只拦截 macOS 上 Ctrl 或 Option 二选一、且无 Shift/Meta 的左右方向键，避免改变普通方向键、Ctrl+Option 叠加组合和非 macOS 平台行为。
- 不新增依赖，不修改 PTY、SSH 或后端命令接口。

## Non-Goals

- 不修改 macOS 的 Mission Control / Spaces 系统快捷键设置。
- 不重新定义 Cmd+方向键、Ctrl+Option 叠加组合或终端应用程序的其他按键协议。
- 不升级或 fork xterm.js。

## Acceptance

1. macOS 上按 `Ctrl/Option+ArrowLeft` 向当前终端写入 `ESC b`，按 `Ctrl/Option+ArrowRight` 写入 `ESC f`，并阻止 xterm 再次编码同一按键。
2. 只在 `keydown` 阶段发送一次，`keyup` 不产生输入。
3. 普通左右方向键、带 Shift/Meta 或同时带 Ctrl+Option 的组合键继续交给 xterm.js。
4. Windows 与 Linux 上的 Ctrl+左右方向键继续交给 xterm.js。
5. 现有跨平台复制粘贴快捷键行为保持通过。

## Acceptance To Verification

- `TerminalPanel` 行为测试模拟 macOS Ctrl/Option+左右方向键，断言 writer 收到 `ESC b` / `ESC f` 且 handler 返回 `false`。
- 同一测试覆盖 `keyup`、额外修饰键、普通方向键和非 macOS Ctrl+方向键，断言没有自定义写入且 handler 返回 `true`。
- 运行 `TerminalPanel` 聚焦测试和 `pnpm check`，验证现有终端与前端行为回归。

## Open Questions

无。按用户描述将“快速移动”解释为 shell 命令行中按单词移动；该语义与 macOS 常见终端编辑体验一致。

## Recommended Approach

方案一是在 `TerminalPanel` 已有的 xterm custom key handler 中增加 macOS Ctrl/Option+左右方向键兼容映射，直接通过当前 block writer 发送 Meta-B / Meta-F；方案二是升级或 fork xterm.js 的键盘编码。报告中的 `;3D` 是 xterm 的 Alt 修饰序列残片，因此同时归一化 Option 路径。推荐方案一：它精确覆盖用户遇到的 WebView/外接键盘路径，兼容 readline、zsh line editor 等常见 shell，变更和回归面都更小。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Architecture: not needed; change remains inside the existing terminal I/O adapter boundary.
- Project Context: not needed; no durable product or architecture decision changes.
- Directory Map: not needed; no structure or ownership changes.
