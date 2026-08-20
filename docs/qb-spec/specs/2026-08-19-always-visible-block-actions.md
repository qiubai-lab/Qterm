# 窗口操作图标始终可见 Task Spec

Status: Complete (2026-08-19)。终端和文件窗口操作区已改为始终可见。

## Goal

终端和文件窗口右上角操作图标无需 hover 或激活即可被发现和使用。

## Scope

- `.block-actions` 在激活与非激活的终端、文件窗口中始终可见。
- 保留单个按钮现有 hover、disabled、标题和可访问名称。

## Constraints

- 终端与文件窗口继续共用同一操作区样式。
- 不改变按钮功能、顺序、尺寸或激活窗口动效。

## Non-Goals

- 不新增或移除任何窗口操作。
- 不调整标题栏高度或目标选择器布局。

## Acceptance

1. 非激活且未 hover 的终端窗口仍显示全部右上角图标。
2. 非激活且未 hover 的文件窗口仍显示关闭图标。
3. 按钮 hover 和 disabled 状态保持现有行为。

## Acceptance To Verification

- 1、2：样式测试断言 `.block-actions` 默认 `opacity:1`，组件测试继续覆盖两类窗口按钮存在。
- 3：运行 `pnpm check` 覆盖现有组件与样式回归。

## Open Questions

无。

## Recommended Approach

直接将共享 `.block-actions` 默认设为可见并移除依赖 hover/active 的显隐选择器。相比在两个 React Block 中分别增加状态，该方案保持显示规则单一且不触碰交互逻辑。

## Next Skills

- `writing-qb-plans`（Tiny）
- `verifying-before-completion`
- Project Context: not needed（局部样式调整）
- Directory Map: not needed（无结构变化）
