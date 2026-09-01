---
id: QB-20260823-dialog-theme-polish
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

> 实施状态：已完成（2026-08-23），并通过完整前端质量门。

让信息类、更新类及相邻操作弹窗完整继承 Dark、Light 与 Cyberpunk 的主题层级，避免自定义弹窗仍呈现旧暗色青绿皮肤，并保持品牌、主动作、连接/安全、警告和失败状态职责清晰。

## Scope

- 优化 About 与更新检测弹窗的品牌标识、主动作、更新状态、命令复制和辅助操作。
- 复核共享 DialogFrame、终端锁定、连接/跃点选择、凭证、SSH Config 导入等弹窗的主题语义消费。
- 为弹窗自定义状态增加样式契约测试，降低未来主题新增时的回归风险。

## Constraints

- 弹窗边界与焦点仍使用主题 accent；Cyberpunk 不把全部弹窗染成亮黄。
- `signature/primary-action` 用于品牌和主要动作，`accent` 用于连接、安全、刷新和焦点，`warning` 用于提示，`danger` 用于失败与不可逆动作。
- 不改变弹窗业务流程、尺寸与滚动所有权，不增加组件依赖。

## Non-Goals

- 不重排连接管理或凭证管理的信息架构。
- 不新增自定义主题编辑器、动画特效或新的全局组件库。

## Acceptance

- About 的产品标识及“检测更新”主动作在 Cyberpunk 下使用亮黄职责，正文与结构面保持中性。
- 更新弹窗区分 checking/latest、available 与 error：前两类连接状态使用青色，可用更新与下载主动作使用亮黄，错误使用红色。
- 辅助按钮和命令复制保持可读且不会与主动作争夺视觉重点。
- 相邻弹窗继续使用 selection、warning、danger 等语义 token，不依赖 Cyberpunk 专属 selector 修补。
- 相关测试与完整 `pnpm check` 通过。

## Acceptance To Verification

- 样式契约测试验证 About/更新各状态及共享弹窗语义 token。
- InfoDialogs 组件测试验证主动作 variant 与更新状态 DOM 属性。
- `pnpm check` 覆盖 lint、全部 Vitest、TypeScript 与生产构建。

## Open Questions

无。

## Recommended Approach

方案一是为 Cyberpunk 增加页面级覆盖，成本低但会复制选择器并使后续主题继续补丁化。方案二是让自定义弹窗直接消费现有 semantic tokens，并由状态属性决定 signature/accent/danger；推荐方案二，因为三套主题自动继承，且不会扩大主题专属 CSS。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Directory Map: not needed（无目录或职责边界变化）
