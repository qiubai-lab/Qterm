## Requirement

在连接右键菜单中复制当前连接，并让副本留在当前分组且可立即编辑。

## Scope

包含菜单入口、唯一副本名称、复用现有 profile 创建/刷新/选择流程，以及成功和失败测试。不包含 schema、后端命令、凭证实体或 Workspace 复制。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `docs/qb-spec/specs/2026-08-21-copy-connection-profile.md`
- `docs/qb-spec/plans/2026-08-21-copy-connection-profile.md`

## Design

- 在连接菜单的非破坏性操作区增加“复制连接”，删除项继续由分隔线隔开。
- 由连接弹窗将 `ConnectionProfile` 映射为现有 `ProfileInput`，仅替换为不重名的副本名称；调用 `createProfile` 后刷新列表并复用选择目标的交互。
- 复制命名只属于管理界面的便捷展示规则；profile 校验、ID 生成和持久化保持在现有后端边界，不引入新抽象。

## Acceptance To Verification

- 菜单顺序与键盘可用性：Testing Library 查询 menuitem 并触发操作。
- 字段、凭证引用与分组完整复制：断言 `createProfile` 输入。
- 名称重名与编辑状态：准备已有“副本”，断言递增名称及表单/当前目标。
- 失败不产生伪选择：mock 创建失败，断言错误反馈和未刷新/未切换。
- 既有编辑、Escape、删除确认：保留并运行现有上下文菜单测试。

## Test / Verification

1. `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx`
2. `pnpm check`

## Documentation Updates

新增本 task spec 与 Standard plan；不更新长期 project context 或 Directory Map，因为产品边界和目录结构未变化。
