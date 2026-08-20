# Network Rule Type Onboarding Plan

## Requirement

将网络规则创建改为“先理解和选择类型，再配置端点”的两步交互，同时保持编辑、持久化和运行时语义不变。

## Scope

- 新增类型选择弹窗与三个说明入口。
- 新建表单接收明确的初始类型，并让返回按钮、右上角关闭和 Escape 统一返回模式选择。
- 编辑流程继续直接打开原配置表单。
- 不修改 Rust、IPC、持久化模型或运行时管理器。

## Affected Files

- `src/network/NetworkRuleTypeDialog.tsx`
- `src/network/networkRuleTypes.ts`
- `src/network/NetworkPane.tsx`
- `src/network/NetworkRuleDialog.tsx`
- `src/network/*.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

- `NetworkPane` 分别管理类型选择、新建类型和编辑规则状态，避免使用一个含多重语义的 editor sentinel。
- `NetworkRuleTypeDialog` 使用三个语义按钮呈现方向、标题和描述；点击后回传 `NetworkRuleInput["type"]`。
- `NetworkRuleDialog` 对新建接收 `initialType`，以只读摘要替代类型下拉框；仅新建流程显示“返回选择”。

## Acceptance To Verification

- 创建先进入类型选择：`NetworkPane.test.tsx`。
- 三种描述和选择结果正确：`NetworkPane.test.tsx` 与类型选择组件测试。
- SOCKS5 默认值与字段裁剪正确：`NetworkRuleDialog.test.tsx`。
- 返回按钮、关闭和 Escape 返回选择，以及编辑直达、退出和类型不可变：`NetworkPane.test.tsx`、`NetworkRuleDialog.test.tsx`。
- 紧凑布局、焦点和 reduced-motion：`appStyles.test.ts`。

## Test / Verification

1. 先更新交互测试，使其在旧实现上失败。
2. 运行 `pnpm exec vitest run src/network/NetworkPane.test.tsx src/network/NetworkRuleDialog.test.tsx src/app/appStyles.test.ts`。
3. 实现组件与样式并重复聚焦测试。
4. 运行 `pnpm check` 与 `git diff --check`。

## Documentation Updates

- 新增本 task spec 与 Standard plan。
- 无长期项目上下文或 Directory Map 更新需求。
