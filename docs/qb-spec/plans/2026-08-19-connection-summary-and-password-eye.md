# 连接摘要与密码眼睛图标 Standard Plan

Status: Complete (2026-08-19)。

## Requirement

连续显示连接地址与末尾认证方式，并把密码文字按钮替换为眼睛图标。

## Scope

只调整 ConnectionDialog 渲染、共享图标集合、相关 CSS 和测试，不改变认证或凭据业务逻辑。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/Icon.tsx`
- `src/app/app.css`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/appStyles.test.ts`

## Design

地址使用单一 `.connection-item-address` 负责收缩与省略，认证方式使用固定宽度末尾标签。密码按钮继续使用现有 aria 状态，只将视觉内容替换为共享 eye/eyeOff 图标。

## Acceptance To Verification

- 地址连续与认证映射：组件 DOM 断言。
- 眼睛图标与可访问名称：组件交互断言。
- 窄布局：样式契约断言 address 可收缩、auth 不收缩、按钮为方形图标控件。

## Test / Verification

- `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/app/appStyles.test.ts`
- `pnpm check`
- `git diff --check`

## Documentation Updates

仅记录当前 task spec/plan；无长期产品规则或目录边界变化。

## Completion Evidence

- 地址连续渲染及密码、私钥、SSH Agent 映射已有组件测试。
- 眼睛/闭眼图标、辅助名称与现有密码可见性行为已有组件测试。
- 完整前端质量门通过。
