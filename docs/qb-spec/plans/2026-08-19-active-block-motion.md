# 激活窗口高亮与切换动效 Standard Plan

Status: Complete (2026-08-19)。自动化质量闸口与本地渲染检查均通过。

## Requirement

增强 Terminal/File Block 激活状态，并让激活指示在窗口之间连续滑动。

## Scope

只调整 WorkspaceCanvas 的活动块测量、共享指示框及相关视觉样式；不改变选择 action、布局模型、终端会话或文件运行时。

## Affected Files

- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Design

- WorkspaceCanvas 保存画布 ref，并由 ActiveBlockIndicator 测量活动 `[data-layout-block]` 相对画布的矩形。
- 首次定位不产生位移；之后以 transform、width、height 重定向同一个 overlay。
- ResizeObserver 同时观察画布与活动块，覆盖 split resize。
- active Block 自身增强静态层次；overlay 使用 `pointer-events:none`。
- motion 曲线快速收敛且无弹跳；reduced-motion 关闭空间 transition。

## Acceptance To Verification

- 活动块视觉：CSS 契约断言更明确的 accent border、header 和 shadow。
- 空间切换：组件测试从第一个块切换到第二个块后，断言同一 indicator 更新到新 DOMRect。
- resize/交互安全：测试存在 ResizeObserver 观察与 `pointer-events:none` 样式；完整测试保护既有布局交互。
- reduced-motion：样式测试断言对应覆盖规则。

## Test / Verification

1. 先补组件和样式测试，确认旧实现失败。
2. 实现共享 indicator 与 active 样式后运行聚焦测试。
3. 运行 `pnpm check` 和 `git diff --check`。

## Documentation Updates

- 新增本 task spec 与 Standard plan。
- 无需更新长期 context 或 Directory Map。
