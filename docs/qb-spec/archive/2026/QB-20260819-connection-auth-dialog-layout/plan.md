---
id: QB-20260819-connection-auth-dialog-layout
status: archived
archived: 2026-09-02
legacy: true
---
# 快速认证弹窗布局整理计划

Plan Level: Standard。改动涉及组件标记、共享 DialogFrame 的样式入口、CSS 与回归测试，但不修改认证业务逻辑。

## Requirement

快速认证弹窗应呈现更横向的比例、固定高度和连续的 Tab/内容切换反馈，并以更克制的层级呈现必要信息。

## Scope

只调整 `ConnectionAuthDialog` 的布局与文案层级，并为 `DialogFrame` 增加可选的 frame class；不改变认证数据与提交路径。

## Affected Files

- `src/components/dialogs/DialogFrame.tsx`
- `src/components/dialogs/ConnectionAuthDialog.tsx`
- `src/components/dialogs/ConnectionAuthDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

- 通过专用 frame class 设置约 470px 的常规宽度、390px 的固定高度和视口约束，并压紧可变内容间距。
- 表单使用稳定 Grid：认证方式选择、固定内容槽、状态槽、隐私说明、底部操作区。
- 将高强调 callout 改为上下文内的低强调安全提示；SSH Agent 保留推荐和“不读取私钥”的清晰反馈。
- Tab 使用共享指示器在三等分位置间连续移动；内容根据新旧 Tab 顺序，从对应方向短距离进入。
- 动画只使用 transform/opacity，不锁定输入；reduced-motion 下取消位移并改为短淡入。

## Acceptance To Verification

- 固定宽高、稳定内容槽与 motion 降级：`appStyles.test.ts` 检查专用 frame、Grid、指示器和关键帧契约。
- 三种认证方式、切换方向与原行为：`ConnectionAuthDialog.test.tsx` 覆盖正反向切换及提交。
- 可访问性与工程完整性：组件测试、lint、typecheck、Vite build。

## Test / Verification

1. `pnpm test -- src/components/dialogs/ConnectionAuthDialog.test.tsx src/app/appStyles.test.ts`
2. `pnpm check`
3. 聚焦检查小视口高度约束、底部稳定区域与 reduced-motion 规则。

## Documentation Updates

新增本 task spec 与 plan；无需更新长期 context 或 Directory Map。
