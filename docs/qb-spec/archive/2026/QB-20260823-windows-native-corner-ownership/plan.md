---
id: QB-20260823-windows-native-corner-ownership
status: archived
archived: 2026-09-02
legacy: true
---
# Windows Native Corner Ownership Plan

## Requirement

消除 Windows 11 系统圆角与应用自绘圆角重叠造成的窗口边缘色彩缺口。

## Scope

调整平台外壳 CSS、Light 根背景、Tauri window effects 配置和相邻样式测试；不修改窗口行为、业务逻辑或内部工作区布局。

## Affected Files

- `src/app/styles/shell.css`
- `src/app/styles/themes/lightOverrides.css`
- `src-tauri/tauri.conf.json`
- `src/app/appStyles.test.ts`

## Design

Windows 平台覆盖把 `.app-shell` 外圆角与 inset 外缘归零，由 DWM 统一裁剪和绘制 shadow。Light 主题仅让 `.app-shell` 持有画布色，`body/#root` 始终透明。通用 Tauri 配置显式启用 shadow，并把 macOS-only 的 radius/state 留在既有 macOS override。

## Acceptance To Verification

- 单一 Windows 外轮廓：样式测试断言 Windows shell 的 `border-radius:0` 与 `box-shadow:none`。
- 透明根背景：样式测试断言 Light `body/#root` 透明而 shell 有画布色。
- 平台配置所有权：配置测试断言通用 shadow/effects 与 macOS radius/state。
- 完整性：运行 `pnpm check`。
- 原生像素表现：在 Windows 恢复、最大化与 Snap 状态目视检查。

## Test / Verification

1. `pnpm vitest run src/app/appStyles.test.ts`
2. `pnpm check`
3. 在 Windows 原生窗口检查 Light/Dark、普通/最大化/Snap 与常见 DPI。

## Documentation Updates

本 task spec 与 plan 记录本次修复；无需更新长期 context 或 Directory Map。
