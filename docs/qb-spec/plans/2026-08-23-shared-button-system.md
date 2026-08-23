# Shared Button System Plan

## Requirement

按已确认的按钮分类方案建立共享组件与样式，先解决连接管理截图中的层级混乱，并让凭证、设置和通用弹窗复用同一维护边界。

## Scope

包含共享组件、语义样式、核心管理器迁移、兼容别名、测试和主题架构记录。不迁移 tabs、menu/list row 或 feature-specific choice card。

## Affected Files

- `src/components/Button.tsx`
- `src/components/button.css`
- `src/components/Button.test.tsx`
- `src/app/app.css`
- `src/components/dialogs/controls.css`
- `src/components/dialogs/DialogFrame.tsx`
- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/CredentialDialog.tsx`
- `src/components/dialogs/SettingsDialog.tsx`
- 相关普通 dialogs 与主题契约测试

## Design

- 共享组件只拥有按钮表现、原生 button props、loading/disabled 和可访问名称；业务事件继续由 feature owner 持有。
- `variant` 表达动作语义，`size` 表达密度，feature class 只负责布局和局部宽度。
- StatusBadge 是非交互展示组件；tabs、menu/list row 保留独立语义组件。
- 旧 class selector 暂作为兼容别名指向同一规则，避免一次迁移扩大到无关工作台控件。

## Acceptance To Verification

- 类型和可访问契约：`src/components/Button.test.tsx`。
- 主题角色与兼容层收敛：`src/app/themeStyles.test.ts`。
- 管理器行为无回归：Connection/Credential/Settings 聚焦测试。
- 全局完整性：`pnpm check`。

## Test / Verification

1. 先运行新增 Button 测试确认缺少实现。
2. 完成共享组件和核心迁移后运行 Button、themeStyles 与三个管理器测试。
3. 运行 `pnpm check`，覆盖 ESLint、全部 Vitest、TypeScript 和 Vite build。

## Documentation Updates

在 `ARCHITECTURE_SPEC.md` 记录共享按钮拥有视觉/可访问契约，feature 仅拥有业务语义和布局修饰。
