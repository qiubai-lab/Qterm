# macOS 原生标题栏任务规格

## Goal

让 Qterm 在 macOS 上使用符合系统习惯的原生窗口控制，并让 Workspace 顶栏与原生交通灯自然共存。

## Scope

- macOS 主窗口恢复原生 decorations，并使用 Overlay title bar。
- macOS 顶栏为左侧交通灯预留稳定空间，不再渲染应用内最小化、最大化与关闭按钮。
- Windows 与 Linux 继续使用当前应用内无边框标题栏和右侧窗口控制。

## Constraints

- 只改变桌面窗口 chrome，不修改 Workspace、session、布局树或持久化模型。
- 复用现有 40px 顶栏、颜色、标签和拖动行为，不新增 UI 或动画依赖。
- 平台差异通过 Tauri platform-specific config 和前端窗口 adapter 表达。

## Non-Goals

- 不重做 Workspace 标签交互。
- 不增加新的应用功能菜单或修改 macOS 系统菜单栏命令。
- 不改变 Windows/Linux 的外观和窗口动作。

## Acceptance

- macOS release 窗口显示系统原生红黄绿交通灯，且交通灯不遮挡 Qterm 品牌或 Workspace 标签。
- macOS 顶栏不显示应用内三枚窗口控制按钮，标题栏空白区域仍可拖动。
- Windows/Linux 仍显示并可使用现有右侧窗口控制。
- 标签切换、新建、重命名和终端锁定状态不因平台分流回归。

## Acceptance To Verification

- 原生交通灯与 Overlay 配置：校验 macOS 平台配置并运行 Tauri macOS build。
- macOS 顶栏结构与安全区：App 组件测试及 release 窗口目视检查。
- Windows/Linux 保持原状：App 组件测试覆盖非 macOS 分支及三项窗口动作。
- Workspace 行为不回归：聚焦测试与 `pnpm check`。

## Open Questions

无。

## Recommended Approach

使用 `tauri.macos.conf.json` 覆盖主窗口的 decorations、Overlay title bar 和交通灯位置；前端通过窗口 adapter 识别 macOS，只隐藏冗余的应用内窗口控制，并用顶栏 padding 为交通灯留出空间。相比继续自绘交通灯，该方案保留系统的全屏、双击标题栏、辅助功能与视觉状态。

## Next Skills

- `writing-qb-plans`：Standard 计划。
- `protecting-critical-behavior`：保护平台分流与既有窗口动作。
- `maintaining-project-context`：更新长期窗口 chrome 决策。
- `verifying-before-completion`：执行聚焦测试、`pnpm check` 与 Tauri build。
- `updating-directory-map`：登记新增的 macOS 平台配置入口。
