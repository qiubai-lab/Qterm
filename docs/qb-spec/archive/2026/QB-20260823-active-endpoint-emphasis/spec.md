---
id: QB-20260823-active-endpoint-emphasis
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

> 实施状态：已完成（2026-08-23），并通过完整前端质量门。

> 回归修正：运行界面在连接流程完成后保留 `ConnectionRouteProgress`，可见地址由 `.connection-route-endpoint` 渲染，而不是 `TerminalTargetPicker > small`。实现与验证现已覆盖两条 endpoint 路径。

在 Cyberpunk 主题中让活动窗口已连接的 `user@host` 身份使用红色强调，同时不改变其他主题和非连接状态。

## Scope

- 为普通目标详情暴露 remote 与连接状态，并覆盖连接路由完成后保留的 endpoint 渲染路径。
- 新增活动连接身份文字的跨主题语义 token。
- 仅对活动、远程且已连接窗口的两类 endpoint 元数据应用该 token。

## Constraints

- Dark 与 Light 保持现有视觉。
- `closed/connecting/authenticating/failed` 文本不套用活动 endpoint 颜色。
- 不改变连接逻辑、标题结构或响应式隐藏行为。

## Non-Goals

- 不调整窗口名称、连接圆点或目标选择菜单的颜色。

## Acceptance

- Cyberpunk 活动窗口的 `user@host` 显示为主题红色。
- 未选中窗口、非 connected 状态及 Dark/Light 不发生视觉变化。
- 样式契约与完整前端质量门通过。

## Acceptance To Verification

- 组件/样式测试验证 `data-status`、活动 connected 选择器和三主题 token 映射。
- `pnpm check` 覆盖 lint、测试、类型与构建。

## Open Questions

无。

## Recommended Approach

直接写 Cyberpunk 根选择器成本最低，但会把主题判断泄漏到 feature CSS。推荐新增语义 token，并由共享选择器消费，使当前需求只改变 Cyberpunk，后续主题也可独立定义。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Directory Map: not needed
