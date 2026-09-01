---
id: QB-20260822-connection-route-tooltip-boundary
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

连接路由气泡不得因连接名短、节点靠边或 Block 裁剪而缺失。

## Scope

只调整路由气泡的渲染容器、坐标计算、边界适配及对应测试；不改变连接状态逻辑和标题栏布局。

## Affected Files

- `src/components/ConnectionRouteProgress.tsx`
- `src/components/ConnectionRouteProgress.test.tsx`
- `src/components/connectionRouteTooltipPosition.ts`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

把当前气泡 Portal 到 `document.body`，使用锚点与气泡实测尺寸计算固定坐标。水平方向在 8px 视口安全边距内钳制，垂直方向优先向下、空间不足时向上。

## Acceptance To Verification

- 左右不越界：定位函数单元测试覆盖两侧边界。
- 不受 Block 裁剪：组件测试确认气泡位于组件容器之外的全局浮层。
- 交互与无障碍不回归：保留现有悬停、聚焦与描述关系测试。
- 项目完整性：运行 `pnpm check`。

## Test / Verification

- `pnpm vitest run src/components/ConnectionRouteProgress.test.tsx src/app/appStyles.test.ts`
- `pnpm check`

## Documentation Updates

本 task spec 与 plan 已同步；无需更新长期项目上下文或 Directory Map。
