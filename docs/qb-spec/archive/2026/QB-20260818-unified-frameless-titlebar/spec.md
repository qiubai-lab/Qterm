---
id: QB-20260818-unified-frameless-titlebar
status: archived
archived: 2026-09-02
legacy: true
---
# 全平台统一无边框标题栏 Task Spec

## Status

Completed on 2026-08-18；其左侧窗口控件布局随后由 `docs/qb-spec/archive/2026/QB-20260818-qterminal-titlebar-brand/spec.md` 更新为左侧 QTerminal 品牌、右侧窗口控件。统一无边框与显式拖动规则继续有效。

## Goal

Windows、macOS 和 Linux 使用同一套应用内标题栏；窗口可可靠拖动，关闭、最小化和最大化/还原按钮统一位于左上角。

## Scope

- 在通用 Tauri 窗口配置中关闭 decorations，移除 Windows 专属窗口配置和 macOS overlay/交通灯配置。
- 所有桌面平台始终渲染同一组窗口控制，顺序为关闭、最小化、最大化/还原。
- 窗口控制位于 Workspace 标签之前的左上角，样式跨平台一致。
- 为标题栏空白区域提供显式 `startDragging` 调用，不依赖 drag-region 属性在子元素间传播。
- 保持 Workspace 标签点击、重命名、排序和横向滚动。

## Constraints

- 点击窗口控制、Workspace 标签、关闭标签、新建标签或重命名输入框时不得触发窗口拖动。
- 浏览器开发/测试环境缺少 Tauri runtime 时窗口动作安全 no-op。
- 继续使用 Tauri 内置 Window API 和现有最小权限；不新增自定义 Rust command。
- 最小窗口保持 720×520。

## Non-Goals

- 不保留 macOS 原生交通灯或 Windows 原生 caption。
- 不为任一平台设计独立的窗口按钮皮肤。
- 不改变 Workspace、SSH session 或关闭生命周期规则。

## Acceptance

1. 三个平台的通用配置均为 `decorations: false`，且不存在平台专属窗口 chrome override。
2. 关闭、最小化、最大化/还原按钮在顶部栏左侧、Workspace 标签之前，所有平台始终显示。
3. 在顶部栏或 Workspace 导航空白区域按下主指针会调用当前窗口 `startDragging`。
4. 在窗口按钮或 Workspace 标签上按下不会触发窗口拖动，既有标签切换仍正常。
5. 前端检查与当前平台 Tauri release build 通过；release 窗口实际可见 chrome 符合统一布局。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 通用无边框配置 | 配置测试/审查确认基础配置 `decorations: false`，Windows override 已删除。 |
| 控件左置且全平台显示 | App 测试断言控件位于 navigation 之前，不再 mock 平台判断。 |
| 空白区域可拖动 | App 测试在 navigation 空白处 pointer down，断言 `startDraggingCurrentWindow`。 |
| 交互区域不误拖 | App 测试在 Workspace 标签和窗口按钮 pointer down，断言未触发 dragging；往返切换测试继续通过。 |
| 原生交付有效 | `pnpm check`、`pnpm tauri build` 和 release 截图/拖动目视检查。 |

## Open Questions

无阻塞问题。统一按钮沿用当前深色矩形风格，并按 macOS 熟悉的左侧顺序放置：关闭、最小化、最大化/还原。

## Recommended Approach

使用单一通用无边框配置与单一 React 标题栏，通过 window adapter 暴露 `startDragging`。相比继续依赖 `data-tauri-drag-region`，显式调用可以测试命中规则，避免铺满 header 的 nav 子元素吞掉拖动区域；相比按平台渲染不同 DOM，此方案没有平台分叉。

## Next Skills

- `writing-qb-plans`：以 Strict 计划覆盖原生配置、权限、UI 和 release 验证。
- `maintaining-project-context`：用统一无边框决策取代平台差异策略。
- `checking-architecture-boundaries`：拖动/窗口操作继续位于 Tauri adapter，Workspace 状态不感知平台。
- `protecting-critical-behavior`：新增拖动命中与排除交互区域的回归测试。
- `verifying-before-completion`：运行前端与原生构建并检查 release 窗口。
- `updating-directory-map`：删除 Windows 专属配置入口并更新通用配置职责。
