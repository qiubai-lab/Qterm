---
id: QB-20260824-single-active-block-outline
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

消除重复外框，并修正共享移动指示器在不同尺寸 Block 间切换时因 transform 百分比依赖自身动画尺寸而产生的越界回弹。

## Scope

调整 active Block 的外框样式所有权、指示器父容器坐标定位和相邻回归测试；不改变状态、布局树或主题定义。

## Affected Files

- `src/terminal/terminalChrome.css`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/workspace/layoutGeometry.ts`
- `src/workspace/layoutGeometry.test.ts`
- `src/app/styles/lateOverrides.css`
- `src/app/appStyles.test.ts`
- `src/app/themeStyles.test.ts`
- `docs/qb-spec/archive/2026/QB-20260824-single-active-block-outline/spec.md`
- `docs/qb-spec/archive/2026/QB-20260824-single-active-block-outline/plan.md`

## Design

由 `.active-block-indicator` 独占 active 外边框与 active 外框阴影。`.terminal-block.active` 不覆盖普通 Block 的结构边框与基础阴影，但继续通过既有子选择器提供标题栏、文字和端点反馈。

布局几何的 x、y、width、height 全部以 `.workspace-layout-surface` 为坐标系。指示器直接将它们映射到 `left`、`top`、`width`、`height`，并用相同 300ms easing 过渡四条边。这样中间帧的边缘位置是同一父坐标系中的线性插值，不再把正在变化的自身宽高作为 translate 百分比基准。

## Acceptance To Verification

- 唯一 active 外框所有权：更新 `appStyles.test.ts` 的样式契约并运行聚焦测试。
- 指示器准确覆盖 active Block：更新 `LayoutView.test.tsx`，验证右侧 Block 的父容器坐标定位。
- 嵌套尺寸切换路径不越界：新增左侧全高到右下半高回归场景，断言位置和尺寸共享父容器坐标系，样式契约不再过渡 transform。
- active 内部反馈不回归：保留并验证 active header 断言。
- 前端完整性：运行 `pnpm check`。

## Test / Verification

1. 先补嵌套尺寸切换的行为与样式契约，使现有自尺寸百分比 transform 实现失败。
2. 修改 `LayoutView.tsx`、`layoutGeometry.ts` 和 `terminalChrome.css` 后重跑聚焦测试。
3. 运行 `pnpm check` 覆盖 ESLint、Vitest、TypeScript 和生产构建。

## Documentation Updates

更新本任务已有的 spec 和 plan；不更新长期 Project Context 或 Directory Map。
