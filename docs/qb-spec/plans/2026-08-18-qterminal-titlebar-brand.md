# QTerminal 顶栏品牌与右侧窗口控件实施计划

## Status

Completed on 2026-08-18. `pnpm check`、`pnpm tauri build` 与最终标题栏截图验证通过。

## Requirement

把窗口控件从左侧移动到右侧，并在左侧加入终端图标与 `QTerminal`，同时保持窗口拖动与 Workspace 导航行为。

## Scope

调整现有 Shell DOM/CSS、窗口标题和交互测试；不新增组件目录、图片资产或平台分支。

## Affected Files

- `src/workspace/WorkspaceShell.tsx`
- `src/app/app.css`
- `src/app/App.test.tsx`
- `src-tauri/tauri.conf.json`
- `README.md`
- `docs/qb-spec/context/DECISIONS.md`
- 本 task spec 与 plan

## Design

Header 使用三段 flex：固定品牌、可收缩/滚动的 Workspace navigation、固定窗口控制。品牌区使用已有终端 SVG 与 12px 半粗体标题；窗口按钮保持 46×40px 命中区并新增轻微 `:active` 缩放，不为高频动作添加进入动画。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 左品牌、中导航、右控件 | RTL DOM 顺序测试。 |
| QTerminal 图标与文字 | 品牌区域内容测试和 release 截图。 |
| 拖动/按钮/标签行为 | 更新现有拖动正负向测试与窗口动作测试。 |
| 原生窗口标题同步 | 配置审查和 Tauri release build。 |

## Test / Verification

1. 先更新 App 测试，使当前左置 controls 实现失败。
2. 调整 Shell 与 CSS 后运行聚焦 App 测试。
3. 运行 `pnpm check`。
4. 运行 `pnpm tauri build` 并进行 release 离屏截图。

## Documentation Updates

更新 README 与 Decision 中稳定的统一标题栏布局描述；Directory Map 无需修改。
