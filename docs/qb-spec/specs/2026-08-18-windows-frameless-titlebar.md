# Windows 无边框标题栏 Task Spec

## Status

Completed on 2026-08-18，随后由 `2026-08-18-unified-frameless-titlebar.md` 取代平台专属策略。Windows release 成品曾确认无可见原生标题栏。

## Goal

Windows 桌面应用不再显示系统默认标题栏，Workspace 顶部栏成为窗口最上层，同时用户仍能拖动、最小化、最大化/还原和关闭窗口。

## Scope

- 仅在 Windows Tauri 配置中关闭原生窗口 decorations。
- 在现有应用顶部栏右侧增加 Windows 风格的最小化、最大化/还原和关闭按钮。
- 通过独立的 Tauri window 前端适配器调用窗口 API，并授予最小权限。
- 保持 Workspace 标签横向滚动、拖拽排序、点击切换和 macOS overlay 行为。

## Constraints

- Windows 最小窗口仍为 720×520，且窗口保持可调整大小。
- macOS 继续使用原生 decorations、Overlay title bar、隐藏标题和交通灯位置。
- 浏览器开发模式不得因缺少 Tauri runtime 抛错。
- 窗口控制权限仅限主窗口需要的 minimize、toggle maximize、close 和 start dragging。

## Non-Goals

- 不重做整个顶部导航视觉系统。
- 不改变 Linux 窗口装饰策略。
- 不改变应用退出时的 SSH session 生命周期规则。

## Acceptance

1. Windows 原生标题栏被移除，应用内容从窗口顶部开始。
2. Windows 顶部栏显示最小化、最大化/还原和关闭按钮，并调用对应窗口能力。
3. Workspace 标签仍可使用，狭窄窗口下可滚动且不会被窗口按钮覆盖。
4. macOS 与 Linux 的现有窗口配置不受 Windows override 影响。
5. Tauri 权限清单只增加所需窗口控制与拖动命令，配置可通过原生构建验证。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| Windows 无原生标题栏 | 检查 `tauri.windows.conf.json` 的 `decorations: false`，运行 Windows Tauri build，并启动成品目视验证。 |
| 窗口控制可用 | App 组件测试 mock window adapter，分别断言三个按钮调用对应能力。 |
| Workspace 布局不受影响 | 既有 Workspace 交互测试与 720px CSS/DOM 检查。 |
| 其他平台不受影响 | 基础 `tauri.conf.json` 保留 decorations/Overlay 配置，Windows override 独立存在。 |
| 权限与构建有效 | 检查 capability 并运行 `pnpm check`、`pnpm tauri build`。 |

## Open Questions

无阻塞问题。默认采用 Windows 11 风格的紧凑控制按钮，关闭按钮悬停使用危险色。

## Recommended Approach

采用 `tauri.windows.conf.json` 平台覆盖配置，而不是全平台关闭 decorations；在 `src/lib/tauri/window.ts` 隔离 Tauri Window API，Shell 只负责展示控制按钮。相比运行时统一调用 `setDecorations(false)`，该方案不会在窗口创建后产生闪烁，平台策略也能在打包配置中直接审查。

## Next Skills

- `writing-qb-plans`：使用 Strict 计划覆盖平台配置、权限、UI 与原生构建。
- `maintaining-project-context`：记录长期跨平台窗口装饰策略。
- `checking-architecture-boundaries`：窗口 API 保持在 Tauri adapter，Shell 不直接依赖底层 invoke。
- `protecting-critical-behavior`：保护三个窗口控制动作及 Windows-only 显示规则。
- `verifying-before-completion`：运行前端检查与 Windows Tauri build，并做原生窗口目视检查。
- `updating-directory-map`：记录新增 window adapter 和 Windows 配置入口。
