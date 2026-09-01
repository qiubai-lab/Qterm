---
id: QB-20260821-connection-manager-target-isolation
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

修复连接管理操作会切换当前终端目标的问题，确保连接只从 Block 左上角目标选择器发起。

## Scope

覆盖连接管理的列表选择、右键编辑、保存、新建与复制路径；保留删除 profile 时的失效引用清理。不同步改造 Workspace schema、认证流程或后端 IPC。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `docs/qb-spec/context/PRODUCT_SPEC.md`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/archive/2026/QB-20260821-copy-connection-profile/spec.md`
- `docs/qb-spec/archive/2026/QB-20260821-copy-connection-profile/plan.md`
- 本 task spec 与 plan。

## Design

- `chooseProfile` 仅拥有编辑器内部状态，不再接受或执行目标切换参数。
- `save` 在持久化与刷新后更新编辑器选中 ID，不触碰 Workspace。
- `duplicateProfile` 复用纯管理选择逻辑，不触碰 Workspace。
- ConnectionDialog 只在删除当前引用 profile 的完整性清理路径保留 Workspace target API；普通配置管理路径不得调用。
- 标题副文案改为“管理 SSH 连接配置”，强化操作边界。

## Acceptance To Verification

- 列表鼠标/键盘与右键编辑隔离：回归测试断言编辑器变化且 `selectBlockTarget` 未调用。
- 保存/新建隔离：现有保存测试增加零调用断言。
- 复制隔离：复制测试从“切换目标”改为明确断言零调用。
- 唯一连接入口不回归：运行 `LayoutView.test.tsx` 中目标选择器测试。

## Test / Verification

1. 先添加失败回归测试。
2. `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/workspace/LayoutView.test.tsx`
3. `pnpm check`
4. 如全量检查命中已知无关样式断言，单独运行 `pnpm lint` 与 `pnpm build`。

## Documentation Updates

更新产品与架构长期上下文，并修正上一任务中“复制后选择当前 Block 目标”的过时描述；Directory Map 不需要更新。
