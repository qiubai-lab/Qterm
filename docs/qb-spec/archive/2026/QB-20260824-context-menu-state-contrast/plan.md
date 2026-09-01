---
id: QB-20260824-context-menu-state-contrast
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

修复跨主题右键菜单中禁用项被亮色 hover 或 Light 兼容覆盖导致的低对比显示，并审计所有同类菜单。

## Scope

包含 Dark/Light/Cyberpunk menu semantic tokens、文件/编辑器/终端/网络/连接右键菜单的共享状态规则、Light 兼容层收敛、样式契约测试和主题长期说明；不包含菜单行为、定位、目标选择器或全局按钮 disabled 重构。

## Affected Files

- `src/app/styles/themes/dark.css`
- `src/app/styles/themes/light.css`
- `src/app/styles/themes/cyberpunk.css`
- `src/app/styles/lateOverrides.css`
- `src/app/styles/themes/lightOverrides.css`
- `src/app/themeStyles.test.ts`
- `src/app/appStyles.test.ts`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`

## Design

- 增加 menu text、secondary text、disabled text 与既有 hover background/text 的完整跨主题 token contract。
- 四类 context menu 的 enabled rest/hover/focus 由共享语义规则收口；danger hover 保持危险语义。
- disabled item 明确使用 `--menu-disabled-text`、透明背景和 `opacity:1`，并让快捷键与图标继承同一颜色，覆盖 feature legacy hover 与全局 disabled opacity。
- 删除 Light 兼容层对 file/connection/profile context-menu button 的通用覆盖，避免其以更高特异性越过 feature disabled state。

## Acceptance To Verification

- 三主题 token 完整且 disabled text 对 raised surface 至少 4.5:1：`themeStyles.test.ts`。
- 四类菜单 rest/hover/disabled、子元素继承与 Light override 移除：`appStyles.test.ts`。
- 多状态三主题视觉一致性：本地静态渲染样张。
- 基础完整性：`pnpm check`、`git diff --check`。

## Test / Verification

- 先更新契约断言并运行 `pnpm vitest run src/app/themeStyles.test.ts src/app/appStyles.test.ts`，确认旧实现失败。
- 实现后重跑同一聚焦测试。
- 运行三主题视觉样张，检查 disabled 无 hover、文字/快捷键/图标层级。
- 运行 `pnpm check` 与 `git diff --check`。

## Documentation Updates

新增本任务 spec 与 Standard plan；在 Architecture Spec 与主题决策中补充跨主题 context-menu 状态契约。Directory Map 不需要更新。
