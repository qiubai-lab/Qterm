> 实施状态（2026-08-23）：已完成。

## Goal

消除自动检测开关与手动检测主按钮在高对比主题中的视觉高度错觉，并锁定统一控件尺寸。

## Affected Files

- `src/components/dialogs/InfoDialogs.tsx`
- `src/components/dialogs/aboutUpdate.css`
- `src/components/dialogs/InfoDialogs.test.tsx`
- `src/components/dialogs/aboutUpdateStyles.test.ts`
- `docs/qb-spec/specs/2026-08-23-about-update-control-alignment.md`

## Acceptance To Verification

- A1：样式测试断言控件组的 30px 共享高度及两个子控件继承该高度。
- A2：组件/样式测试断言开关使用 quiet 角色、透明外边界和无常驻阴影。
- A3：现有 switch 交互测试加上 quiet 角色断言；样式测试继续覆盖轨道、focus 与 reduced motion。
- A4：运行 InfoDialogs 与 aboutUpdate 聚焦测试，再运行 `pnpm check`。

## Verification

- `pnpm vitest run src/components/dialogs/InfoDialogs.test.tsx src/components/dialogs/aboutUpdateStyles.test.ts`
- `pnpm check`
- Cyberpunk 主题下人工检查静止、hover、开启与键盘 focus 状态。
