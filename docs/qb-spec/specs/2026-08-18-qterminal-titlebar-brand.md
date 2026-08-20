# QTerminal 顶栏品牌与右侧窗口控件 Task Spec

## Status

Superseded in part on 2026-08-18 by `2026-08-18-inline-workspace-rename.md`：品牌文本随后缩短为 `Qterm`；右侧窗口控件与拖动规则继续有效。

## Goal

统一标题栏在左上角显示终端图标与 `QTerminal` 品牌，窗口控制固定在右上角，Workspace 标签位于二者之间。

## Scope

- 新增左侧不可交互品牌区：终端图标 + `QTerminal`。
- Workspace navigation 保持中间弹性区域与横向滚动。
- 最小化、最大化/还原、关闭控件依次排列在最右侧，关闭动作固定在最右端。
- 品牌区和导航空白区域继续支持拖动窗口；按钮与标签不触发窗口拖动。
- Tauri window title 同步为 `QTerminal`。

## Constraints

- 保持统一跨平台无边框配置，不引入平台分支。
- 品牌区宽度固定且克制，不随 Workspace 数量伸缩。
- 最小窗口 720×520 下 Workspace 标签仍可滚动。
- 不添加高频标题栏动画；窗口按钮只保留即时 hover 与短按压反馈。

## Non-Goals

- 不修改 bundle `productName`、identifier 或安装包名称。
- 不设计新 logo 图片或替换应用打包图标。
- 不改变窗口动作、Workspace reducer 或 session 生命周期。

## Acceptance

1. 顶栏 DOM 顺序为品牌区、Workspace navigation、窗口控制区。
2. 品牌区显示现有终端图标与准确文本 `QTerminal`。
3. 窗口控制位于右上角并继续调用 close/minimize/toggle maximize。
4. 品牌区和 navigation 空白区域可触发 window dragging，窗口按钮和 Workspace 标签不会误触。
5. Tauri window title 为 `QTerminal`，前端与原生构建通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 品牌/导航/控件顺序 | App DOM 测试断言三个 header 子区域顺序。 |
| 品牌内容 | App 测试断言 `QTerminal` 和终端 SVG。 |
| 右侧窗口动作 | 既有窗口控制 mock 测试。 |
| 拖动不回归 | 品牌区与 nav 正向拖动断言、按钮/标签负向断言。 |
| 原生标题与视觉 | `pnpm check`、`pnpm tauri build` 和 release 截图。 |

## Open Questions

无阻塞问题。

## Recommended Approach

在 `WorkspaceShell` 的 header 中采用 `brand → nav → controls` 三段 flex 布局。品牌使用已有 `terminal` 矢量图标，不引入图片资产；nav 保持 `flex: 1; min-width: 0`；controls 固定在末端。品牌区不使用 button，因此自然属于现有显式拖动的非交互区域。

## Next Skills

- `writing-qb-plans`：Standard 计划覆盖 Shell、CSS、测试与 Tauri title。
- `maintaining-project-context`：更新长期标题栏布局与品牌规则。
- `protecting-critical-behavior`：保护拖动命中和窗口动作。
- `verifying-before-completion`：前端检查、原生构建和截图。
- Directory Map：不需要；没有入口或模块职责变化。
