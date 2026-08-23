## Requirement

> 实施状态：已完成（2026-08-23）。

让 Light 采用与 Dark 相同的透明设计逻辑，通过共享材质契约恢复原生窗口材质透出，并保留内容可读性与无障碍实色回退。

## Scope

- 增加双主题 shell/chrome/rail/workspace/floating 材质变量。
- 调整 shell、workspace、dialog 等结构样式消费材质变量。
- 收缩 Light compatibility 中的不透明覆盖。
- 保持现有 native theme 同步与终端渲染刷新逻辑。

非目标：不改 persistence/IPC/domain，不增加自定义透明度，不做全组件玻璃化。

## Affected Files

- `src/app/styles/themes/dark.css`
- `src/app/styles/themes/light.css`
- `src/app/styles/themes/lightOverrides.css`
- `src/app/styles/shell.css`
- `src/workspace/workspace.css`
- `src/components/dialogs/dialogFrame.css`
- `src/components/dialogs/connectionDialog.css`
- `src/files/fileBrowser.css`
- `src/network/network.css`
- `src/terminal/terminalChrome.css`
- `src/terminal/terminalSurface.css`
- `src/app/styles/lateOverrides.css`
- `src/app/appStyles.test.ts`
- `src/app/themeStyles.test.ts`
- 本 spec 与 plan

## Design

Theme preset 拥有材质值，结构 CSS 拥有材质使用位置。Light 采用更高 alpha 的白灰材质；Dark 保留现有低 alpha 深色层级。内容 surface 通过高不透明 `--workbench-panel` 保证终端与编辑器可读性。`prefers-reduced-transparency` 和 `prefers-contrast: more` 继续使用 `--canvas/--chrome/--surface/--raised` 实色回退。现有 `AppThemeProvider` 已调用 `setNativeWindowTheme`，本任务只验证而不改写该边界。

## Acceptance To Verification

- A1/A2 → `themeStyles.test.ts` 检查双 preset 材质 token、结构消费与 Light override 禁止实色根覆盖。
- A3/A4 → `appStyles.test.ts` 检查 chrome/rail/workspace/dialog 材质与内容 panel 层级；本地 computed style/桌面窗口检查。
- A5 → 运行 `AppThemeProvider.test.tsx` 与 Settings theme tests。
- A6 → 样式断言 reduced-transparency/increased-contrast 的实色回退。
- A7 → 完整 Vitest、lint、typecheck、Vite build。

## Test / Verification

1. `pnpm vitest run src/app/appStyles.test.ts src/app/themeStyles.test.ts src/app/theme/AppThemeProvider.test.tsx --maxWorkers=1`
2. `pnpm vitest run --maxWorkers=1`
3. `pnpm lint`
4. `pnpm build`
5. Dark/Light 本地窗口检查 chrome、rail、双分栏、对话框以及 reduced-transparency 回退；无法覆盖的平台明确记录。

## Documentation Updates

新增本 task spec/plan。既有 architecture context 与 Directory Map 无需更新，因为主题所有权、adapter 边界和目录职责均未改变。

Plan Level：Standard。
