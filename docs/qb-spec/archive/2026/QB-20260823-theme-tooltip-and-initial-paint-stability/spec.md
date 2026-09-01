---
id: QB-20260823-theme-tooltip-and-initial-paint-stability
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

> 实施状态：已完成（2026-08-23）。

让连接状态提示在 Light/Dark 中保持一致且可读，并消除代理开关与设置菜单图标在对话框首帧出现的亚像素偏移和重绘抖动。

## Scope

- 将连接节点状态气泡迁移到共享 floating、text、accent、warning 主题角色。
- 保留连接中、已连接等状态区分，以及紧凑双行信息结构。
- 让对话框入场不再改变子控件几何坐标。
- 将 SOCKS 本地代理开关改为确定的绝对定位轨道，避免依赖 grid/individual translate 的首帧合成。
- 为气泡主题契约、对话框稳定入场和开关几何补充样式回归断言。

## Constraints

- 保持现有 DialogFrame、Icon 和 NetworkAccessDialog 组件结构与交互语义。
- 动画仍保持短暂且支持 reduced motion，但不移动精细图标和控制点。
- 不改变网络代理业务状态或设置持久化逻辑。

## Non-Goals

- 不重做对话框布局或图标系统。
- 不调整 SOCKS 代理业务流程。
- 不新增依赖或主题 preset。

## Acceptance

- Light 下连接状态气泡不再显示固定暗色底，并且标题、状态和端点文字清晰。
- Dark 下气泡继续保持足够层级和状态辨识度。
- SOCKS 本地地址开关在首次绘制、hover、checked 前后始终垂直居中。
- 设置侧栏图标在对话框入场结束时不发生水平重栅格化位移。
- 键盘焦点、选中状态和 reduced-motion 行为不回归。

## Acceptance To Verification

- 气泡主题与状态 → `appStyles.test.ts` 检查 floating/semantic token。
- 开关稳定几何 → `appStyles.test.ts` 检查 absolute inset 与单一 transform 轴。
- 对话框首帧稳定 → `appStyles.test.ts` 检查 opacity-only 入场与图标 block rendering。
- 整体回归 → focused Vitest、`pnpm check`。

## Open Questions

无。

## Recommended Approach

推荐从共享样式根因修复：保留对话框淡入但移除入场 translate/scale，并将开关滑块改为绝对定位。相比给 Light 或 hover 增加补丁，这一方案不会形成交互态与首帧两套几何规则，后续维护风险更低。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要，本次不改变长期产品或架构约束。
- Directory Map：不需要，本次无目录、模块边界或入口变化。
