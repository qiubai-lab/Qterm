---
id: QB-20260823-dialog-theme-polish
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

> 实施状态：已完成（2026-08-23），并通过完整前端质量门。

统一 About、更新检测及相邻弹窗的主题视觉职责，重点补齐 Cyberpunk 的亮黄品牌/主动作层级，同时保持青色连接与安全语义。

## Scope

包含信息弹窗样式、更新状态样式、组件按钮 variant、样式契约与现有主题文档状态；不改变业务行为或弹窗结构。

## Affected Files

- `src/components/dialogs/InfoDialogs.tsx`
- `src/components/dialogs/infoDialogs.css`
- `src/components/dialogs/aboutUpdate.css`
- `src/components/dialogs/aboutUpdateStyles.test.ts`
- `src/app/themeStyles.test.ts`
- `docs/qb-spec/archive/2026/QB-20260823-dialog-theme-polish/spec.md`

## Design

DialogFrame 继续使用 floating/accent 构成浮层边界。About 产品 mark 使用 signature；检测更新和前往 Releases 使用 primary Button。更新状态图标按 `checking/latest -> accent`、`available -> signature`、`error -> danger` 映射。复制、重新检测等 utility action 使用中性 control surface 与 accent 图标。

## Acceptance To Verification

- A1 About 品牌与主动作层级：样式断言与组件测试。
- A2 更新状态三分语义：`data-status` 样式断言。
- A3 三主题继承且无专属补丁：主题契约测试与源码检查。
- A4 无回归：完整 `pnpm check`。

## Test / Verification

1. `pnpm vitest run src/components/dialogs/aboutUpdateStyles.test.ts src/components/dialogs/InfoDialogs.test.tsx src/app/themeStyles.test.ts --maxWorkers=1`
2. `pnpm check`
3. `git diff --check`

## Documentation Updates

完成后更新本 plan/spec 实施状态；无 Directory Map 变化。
