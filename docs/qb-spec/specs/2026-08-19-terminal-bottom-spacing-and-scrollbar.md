# 终端底部留白与滚动条细化 Task Spec

Status: Complete (2026-08-19)

## Goal

确保终端最后一行和光标完整可见，并让滚动条成为与品牌图标同色的纤细辅助元素。

## Scope

- 终端内容区底部安全距离从 2px 增加到 6px。
- xterm 滚动层宽度从 5px 收窄到 3px。
- 滑块默认、hover 和 active 颜色统一为品牌青色 `#75e6cf`，继续沿用既有显隐动画。

## Constraints

- 不修改终端字号、行高、行列计算、缓冲上限或会话逻辑。
- 不增加持续占用空间的额外滚动条 DOM。

## Non-Goals

- 不调整标题栏、分割间距或工作区布局。
- 不修改终端 ANSI 配色。

## Acceptance

1. 最后一行光标与 Terminal Block 底部之间存在可见安全间距，光标不被裁切。
2. xterm 纵向滚动层及滑块宽度均为 3px。
3. 滑块颜色与左上角终端图标使用同一青色 `#75e6cf`。
4. 现有滚动条显隐动画、终端缓冲和分割行为不回归。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1 | 样式测试断言底部 padding 为 6px；桌面终端光标截图检查。 |
| 2, 3 | TerminalPanel 配置测试与实际 xterm DOM 计算样式检查。 |
| 4 | 聚焦测试及 `pnpm check`。 |

## Open Questions

无。

## Verification Evidence

- 样式测试确认终端内容区使用 6px 底部安全距离。
- TerminalPanel 测试确认 xterm 滚动层为 3px，默认、hover、active 滑块色均为 `#75e6cf`。
- 桌面长输出截图确认滚动时显示青色细条、空闲后隐藏；最终提示符和光标与底部边框间距完整。
- `pnpm check`：14 个测试文件、35 项测试全部通过，Lint、TypeScript 与 Vite 构建通过。
- `git diff --check` 通过（仅现有 Windows 行尾提示）。

## Recommended Approach

推荐直接调整现有 `.terminal-surface` 内边距及 xterm `overviewRuler`/theme 配置；相比用定位偏移光标或自造滚动条，这种方案由 FitAddon 自动纳入可用尺寸计算，不引入同步和裁切风险。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Project Context: not needed；局部视觉参数调整。
- Directory Map: not needed；无结构变化。
