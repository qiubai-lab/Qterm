## Requirement

在连接管理器中增加修饰键多选，并让拖拽和右键删除对整个选择集合生效，同时改善相邻选择项间距。

## Scope

包含连接列表选择集合、批量拖拽、批量删除确认、状态提示、ARIA 状态与样式间距；不包含后端 API、数据模型或 Shift 区间选择。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

保留 `selectedId` 作为编辑焦点，新增 ID 集合作为批量选择。普通选择重置集合，Command/Ctrl 激活切换集合；右键未选项先重置为单选。拖拽快照携带所选 profiles，批量动作跳过已经位于目标分组的连接。删除确认持有 profile 数组并统一刷新和汇总结果。

## Acceptance To Verification

- 多选增减与普通单选：组件行为测试。
- 多选右键和批量确认删除：组件行为测试，断言 API 调用、刷新次数及提示。
- 多选拖拽：组件行为测试，断言只更新需要移动的连接。
- 视觉余量：CSS 声明测试断言相邻项 `margin-top:2px`。

## Test / Verification

- `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/app/appStyles.test.ts`
- `pnpm check`

## Documentation Updates

本 plan 与对应 task spec 即为本次文档记录；无需更新长期项目上下文或 Directory Map。
