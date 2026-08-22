## Goal

连接路由节点气泡在连接名很短或节点靠近应用左右边缘时，仍完整显示在应用可视区域内。

## Scope

- 气泡位置根据实际节点和气泡尺寸计算。
- 气泡脱离终端 Block 的裁剪容器，并限制在视口安全边距内。
- 底部空间不足时允许气泡显示在节点上方。
- 为左侧、右侧及垂直边界补充回归测试。

## Constraints

- 保持气泡内容、视觉样式、悬停与键盘聚焦行为不变。
- 保持终端 Block 现有 `overflow` 裁剪规则。
- 不引入新的浮层依赖。

## Non-Goals

- 不改变连接名、路由节点或终端标题栏的尺寸。
- 不调整连接流程与状态模型。

## Acceptance

- 短连接名使节点靠近左侧时，气泡左边缘不越过应用可视区域。
- 节点靠近右侧时，气泡右边缘不越过应用可视区域。
- 气泡不受终端 Block 裁剪；底部空间不足时仍可完整显示。
- 鼠标悬停、键盘聚焦和无障碍描述关系保持有效。
- 前端相关测试与 `pnpm check` 通过。

## Acceptance To Verification

- 单元测试覆盖左侧和右侧坐标钳制，以及向上放置逻辑。
- 组件测试确认气泡通过全局浮层渲染，悬停、聚焦和 `aria-describedby` 行为不变。
- 运行聚焦测试与 `pnpm check`。

## Open Questions

无。

## Recommended Approach

推荐使用 React Portal 渲染固定定位气泡，并根据节点与气泡实测尺寸进行视口碰撞处理。这能同时解决终端 Block 裁剪和任意连接名长度下的左右越界。仅修改末节点的 CSS 展开方向实现更小，但无法覆盖不同窗口宽度、分屏位置及右侧边界。

## Next Skills

- `writing-qb-plans`：Standard 计划。
- `protecting-critical-behavior`：为已出现的边界回归补自动化保护。
- `verifying-before-completion`：运行聚焦测试与 `pnpm check`。
- Directory Map：不需要；没有目录、模块边界或入口变化。
