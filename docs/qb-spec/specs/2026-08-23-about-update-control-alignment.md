> 实施状态（2026-08-23）：已完成。开关改为 quiet switch，统一 30px 控件盒；聚焦测试、实际页面测量与 `pnpm check` 均通过。

## Goal

让“关于”页的自动更新开关与“检测更新”主按钮在 Cyberpunk 等高对比主题下保持清晰、稳定且视觉对齐，同时保留紧凑的 30px 点击区域。

## Scope

- 修正更新控件组的统一高度契约。
- 将自动检测偏好从带强调色外框的次级按钮调整为安静的开关控件，只由开关轨道表达开关状态。
- 保留现有 switch 语义、忙碌状态、保存错误反馈和手动检测行为。

## Constraints

- 复用现有 `Button`、主题 token 与 focus 样式，不增加组件或依赖。
- 三种主题均使用语义颜色；关闭态不使用 accent 描边。
- 不降低 30px 指针/键盘交互区域，不改变控件顺序。

## Non-Goals

- 不修改自动检测的持久化、启动检查或更新弹窗逻辑。
- 不重做关于页其余信息结构。

## Acceptance

- A1：开关和手动检测按钮使用同一个 30px 高度契约，外接盒对齐。
- A2：开关关闭态无常驻 accent 外框，视觉上不再与高亮实心主按钮形成边缘高度错觉。
- A3：开关轨道继续呈现开/关状态，hover、focus-visible、disabled、busy 与 reduced-motion 状态可用。
- A4：既有更新偏好交互和手动检测测试保持通过。

## Acceptance To Verification

- A1/A2/A3：`aboutUpdateStyles.test.ts` CSS contract 测试与 Cyberpunk 页面人工检查。
- A3/A4：`InfoDialogs.test.tsx` 聚焦交互测试。
- 基础完整性：frontend lint、typecheck/build 与完整 `pnpm check`。

## Open Questions

无。

## Recommended Approach

方案一是继续保留开关的外框，只微调边框颜色或高度；成本低，但无法消除高对比主题中“描边按钮”和“实心按钮”的固有视觉重量差。方案二是将偏好控件改为 quiet switch：保留完整点击盒，在 hover 时给出中性表面反馈，常驻状态只由内部轨道表达。推荐方案二，因为它同时修正视觉错觉和控件层级：偏好开关是状态控制，手动检测才是主动作。

## Next Skills

- `writing-qb-plans`：Tiny plan。
- `protecting-critical-behavior`：仅更新现有样式契约与交互断言；无业务逻辑变化，不新增更重的行为测试。
- `verifying-before-completion`：运行聚焦测试和 `pnpm check`。
- Directory Map：不需要；目录与职责边界未变化。
