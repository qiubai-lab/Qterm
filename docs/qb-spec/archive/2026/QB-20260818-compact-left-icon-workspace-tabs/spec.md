---
id: QB-20260818-compact-left-icon-workspace-tabs
status: archived
archived: 2026-09-02
legacy: true
---
# 紧凑左侧图标 Workspace 标签 Task Spec

## Status

Completed on 2026-08-18。标签实测为 128px，显示与编辑图标距左侧约 9px；名称和输入居中、右侧关闭按钮及完整前端检查均通过。

## Goal

Workspace 标签更紧凑，同时图标稳定停靠在左侧，名称与编辑输入保持中央对齐。

## Scope

- 标签固定宽度由 150px 缩短为 128px。
- 显示态和编辑态的 Workspace 图标固定在左侧 8px。
- 名称与输入继续在中央安全区域居中。
- 关闭按钮继续固定在右侧，长内容继续截断或内部滚动。

## Constraints

- 左侧图标与右侧关闭按钮不能覆盖中央内容。
- 普通、长名称和编辑状态都必须保持 128px。

## Non-Goals

- 不改变标签高度、图标尺寸或 Workspace 行为。
- 不添加动画或可配置宽度。

## Acceptance

1. 所有 Workspace 标签宽度为 128px。
2. 显示态和编辑态图标固定在标签左侧。
3. 名称与输入文字保持居中，关闭按钮保持右侧。
4. 长内容不会撑大标签，完整前端检查通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1–3 | 本地浏览器测量标签、图标、文字和关闭按钮的几何位置并截图。 |
| 4 | 长名称检查、`pnpm check`、`git diff --check`。 |

## Open Questions

无。

## Recommended Approach

若让图标继续参与 flex 排版，缩短标签后会挤压并偏移名称。推荐将左右图标都固定定位，只让名称或输入参与中央区域排版，使紧凑尺寸下的视觉中心保持稳定。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Project Context: not needed；这是局部视觉调整。
- Directory Map: not needed；没有结构变化。
