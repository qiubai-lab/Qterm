---
id: QB-20260823-window-always-on-top-pin
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

在程序右上角新增可切换窗口置顶的图针按钮，激活时仅图针跟随主题色高亮。

## Scope

包含窗口 API 适配、Tauri 权限、图针图标、head bar 状态与样式；不持久化偏好。

## Affected Files

- `src/lib/tauri/window.ts`
- `src-tauri/capabilities/default.json`
- `src/components/Icon.tsx`
- `src/workspace/WorkspaceShell.tsx`
- `src/app/styles/shell.css`
- `src/app/App.test.tsx`
- `src/app/appStyles.test.ts`

## Design

启动时查询当前窗口置顶状态。按钮触发串行异步切换，成功后更新 `aria-pressed` 与动态标签。按钮始终位于右侧窗口控制组，非 macOS 平台继续渲染其余三个窗口按钮。窗口按钮采用 38×30、5px 圆角的紧凑反馈框；激活图针静止时仅复用 `--navigation-accent` 高亮图标，hover 时显示共享边框和背景并保持主题色图标。透明窗口上的 hover 描边使用真实 `border-color`，不使用动画 `box-shadow` 或按钮缩放，以避免 WebView2 局部重绘残留。

## Acceptance To Verification

- API 与切换行为：App 测试模拟查询、置顶和取消置顶。
- 跨平台排列：App 测试断言 Windows 与 macOS 控件集合。
- 主题样式与键盘焦点：CSS 样式断言。
- 权限最小化：配置文件断言两项 allow 权限。

## Test / Verification

- `pnpm vitest run src/app/App.test.tsx src/app/appStyles.test.ts`
- `pnpm check`

## Documentation Updates

新增本 task spec 与 Standard plan；无需更新长期上下文或 Directory Map。
