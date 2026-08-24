## Goal

Workspace 切换、分割或打开 Block 时，唯一的选中外框始终准确覆盖 active Block。

## Scope

- 统一 active Block 外框的视觉所有权。
- 让指示器的位置和尺寸始终共享工作区父容器坐标系。
- 修正不同尺寸 Block 间移动时的中间动画路径。
- 保留 active 标题栏、文字和连接状态反馈。
- 增加样式与几何回归断言，防止重复外框和位置错位再次出现。

## Constraints

- 保留共享移动指示器及其 300ms 空间连续性动画。
- 保留键盘焦点、ARIA、选中状态数据和布局几何行为。
- 兼容现有 dark、light 和 cyberpunk 主题。

## Non-Goals

- 不调整布局几何、分割比例或 Block 状态管理。
- 不改变主题色、标题栏样式或连接状态语义。
- 不进行桌面打包验证。

## Acceptance

- `.active-block-indicator` 是唯一绘制 active 外边框和外框阴影的元素。
- `.terminal-block.active` 不再绘制 active 外边框或 active 外框阴影。
- 水平或垂直分割后的指示器终点与 active Block 的父容器坐标一致。
- 从全高 Block 移向嵌套半高 Block 时，指示器边缘在动画中间帧不会越出工作区后再回弹。
- active 标题栏、文字和端点状态仍保持现有视觉反馈。
- 相关测试与 `pnpm check` 通过。

## Acceptance To Verification

- 样式测试断言 active Block 保留普通结构边框/阴影所有权，移动指示器保留 active 外框所有权。
- `LayoutView` 测试断言右侧 50% Block 使用父容器 `left` 坐标并补偿 divider 像素。
- 嵌套布局回归测试断言左侧全高到右下半高的 `left`、`top`、`width`、`height` 均使用同一父容器坐标系，且不再使用自尺寸百分比 transform。
- 运行 `pnpm vitest run src/app/appStyles.test.ts src/workspace/LayoutView.test.tsx`。
- 运行 `pnpm check`。

## Open Questions

无。

## Recommended Approach

方案 A（采纳）：保留移动指示器作为唯一 active 外框，Block 的 active 类只控制内部状态；直接用绝对定位元素的 `left`、`top`、`width`、`height` 表达布局几何。四个属性都以工作区父容器为百分比基准并使用相同 easing，因此嵌套尺寸变化时各边缘保持连续，不会因 transform 百分比随自身尺寸变化而越界。

方案 B：测量工作区像素尺寸并用像素 transform/FLIP。可以只用 transform 完成运动，但需要 ResizeObserver、布局测量和中断状态管理，复杂度和回归面明显更大，本次不采用。

方案 C：移除移动指示器，仅保留 Block 自身外框。实现更简单，但会失去 Block 间的空间连续性动画，不采用。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要，本次不改变长期产品或架构规则。
- Directory Map：不需要，本次没有结构或职责边界变化。
