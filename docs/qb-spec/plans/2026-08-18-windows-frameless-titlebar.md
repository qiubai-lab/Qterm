# Windows 无边框标题栏实施计划

## Status

Completed on 2026-08-18，随后由 `2026-08-18-unified-frameless-titlebar.md` 取代平台专属策略。原 Windows 构建与截图验证记录保持有效。

## Background

基础 Tauri 配置使用 `decorations: true` 与 `titleBarStyle: Overlay`。该组合满足 macOS 单层标题栏，但 Windows 仍显示一层系统标题栏，导致 Workspace 顶部栏下移并形成重复窗口 chrome。

## Requirement

Windows 使用无边框窗口，现有 Workspace 顶部栏接管窗口控制；macOS 和 Linux 保持原配置。

## Non-Goals

- 不更换 Workspace 导航或工具轨布局。
- 不实现自定义系统菜单、吸附布局菜单或主题设置。
- 不修改 Rust domain、application、commands 或 persistence。

## Architecture Impact

- 新增 `src/lib/tauri/window.ts` 作为前端 Window API adapter，负责 runtime/platform 检测和窗口命令。
- `WorkspaceShell` 只渲染 Windows 控件并调用 adapter，不直接构造 Tauri invoke。
- 新增 `src-tauri/tauri.windows.conf.json`，把平台窗口创建策略与通用配置分开。
- `src-tauri/capabilities/default.json` 显式授予三个窗口操作与标题栏拖动权限。

## Domain Model Impact

无。Workspace、layout、session 和 persistence 模型不变。

## API Impact

不新增应用业务 IPC。仅使用 Tauri 2 内置 Window API：minimize、toggle maximize 和 close。

## Database Impact

无。

## Implementation Tasks

1. 添加 Windows 平台配置，复制主窗口尺寸约束并设置 `decorations: false`。
2. 在 capability 中加入最小窗口控制与拖动权限。
3. 新增 Tauri window adapter，并使浏览器模式安全 no-op。
4. 在顶部栏加入仅 Windows 显示的三个窗口控制按钮和紧凑样式。
5. 先补 adapter/UI mock 测试，验证每个按钮调用正确能力且既有 Workspace 切换继续通过。
6. 更新长期 Decision、Directory Map、本 spec/plan 状态。
7. 运行 `pnpm check` 和 `pnpm tauri build`；启动 Windows 成品进行标题栏、拖动、resize 和按钮目视检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| Windows decorations 关闭 | 配置审查、Tauri build、成品截图。 |
| 三个窗口动作可用 | App 测试 mock adapter 并断言 minimize/toggle/close。 |
| Workspace 标签不回归 | App 完整测试覆盖新建与往返切换；最小宽度目视检查。 |
| 平台隔离 | 确认通用配置未关闭 decorations，Windows override 单独生效。 |
| 权限最小且有效 | capability 审查与 Tauri build。 |

## Test Plan

- `pnpm exec vitest run src/app/App.test.tsx`
- `pnpm check`
- `pnpm tauri build`
- Windows 原生包：检查无系统标题栏、顶部可拖动、边缘可 resize、三个按钮有效。

## Rollback Plan

删除 Windows 平台配置、窗口控制 UI/adapter 和三项 capability 权限即可恢复 Windows 原生标题栏；通用 Tauri 配置始终保留原跨平台行为。

## Risks

- 无边框窗口可能失去原生控制：由自定义按钮与现有 drag region 补齐。
- 标签空间减少：窗口控制区固定宽度，tab strip 保持 `min-width: 0` 和横向滚动。
- 权限缺失导致按钮静默失败：显式 capability 与原生 build/启动检查保护。
- Windows 无边框 resize/shadow 的 WebView/WM 差异：原生成品目视检查，必要时后续单独处理阴影或 resize hit area。

## Documentation Updates

- `docs/qb-spec/context/DECISIONS.md`：记录 Windows frameless、macOS overlay、Linux native decorations 的平台策略。
- `docs/qb-spec/DIRECTORY_MAP.md`：登记 Windows 配置和 window adapter 入口。
- 本 task spec 与 plan：完成后记录实际验证状态。
