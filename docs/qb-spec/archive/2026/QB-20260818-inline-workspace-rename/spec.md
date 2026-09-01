---
id: QB-20260818-inline-workspace-rename
status: archived
archived: 2026-09-02
legacy: true
---
# Workspace 标签内联重命名与 Qterm 品牌 Task Spec

## Status

Completed on 2026-08-18。标签内编辑回归测试、完整前端检查、Tauri release 打包及本地浏览器视觉检查均通过。

## Goal

Workspace 名称编辑与标签本身保持视觉连续，并将产品可见品牌统一为 `Qterm`。

## Scope

- 双击 Workspace 标签时，只把名称文字区域切换为输入状态。
- 编辑期间保留 Workspace 图标、标签容器、选中态和关闭按钮。
- 保留 Enter 提交、Escape 取消和失焦提交行为。
- 将应用内品牌和 Tauri 原生窗口标题由 `QTerminal` 改为 `Qterm`。

## Constraints

- 编辑态不能改变标签的 30px 高度或生成独立的大号输入框。
- 输入框需要有可访问名称和清晰但克制的焦点提示。
- 不引入平台分支，也不改变 Workspace 数据模型或持久化格式。

## Non-Goals

- 不改变 Workspace 的创建、切换、排序或关闭规则。
- 不重新设计整个标题栏，也不增加重命名动画。

## Acceptance

1. 双击名称后，输入框位于原 Workspace 标签内。
2. 编辑期间 Workspace 图标和关闭按钮仍然可见，标签尺寸与选中样式保持稳定。
3. Enter、Escape 和失焦行为保持有效，重命名结果仍被保存到现有 Workspace 状态。
4. 顶栏品牌、无障碍标签及 Tauri window title 均显示 `Qterm`。
5. 前端检查和桌面打包通过，Windows 客户端截图没有独立的大号重命名输入框。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1–3 | App 回归测试双击标签、检查内联结构并提交新名称。 |
| 4 | App 品牌测试与 `tauri.conf.json` 配置检查。 |
| 5 | `pnpm check`、`pnpm tauri build` 和 Windows 客户端截图。 |

## Open Questions

无。

## Recommended Approach

方案 A 是保留现有标签容器，只将图标旁的名称节点替换成透明内联输入框；方案 B 是继续替换整个标签内容，再用尺寸约束模拟原布局。推荐方案 A，因为它天然保留图标、关闭按钮、选中态与拖动边界，DOM 和视觉状态都更稳定。

## Next Skills

- `writing-qb-plans`
- `maintaining-project-context`：品牌名是长期产品决策，需要同步现有决策记录。
- `protecting-critical-behavior`：为已发现的编辑态割裂问题增加回归测试。
- `verifying-before-completion`
- Directory Map: not needed；没有目录、模块边界或入口变化。
