---
id: QB-20260818-centered-workspace-tab-content
status: archived
archived: 2026-09-02
legacy: true
---
# Workspace 标签内容居中 Task Spec

## Status

Completed on 2026-08-18。显示态内容中心偏差小于 0.01px，编辑容器中心偏差为 0px；输入居中、关闭按钮独立定位和完整前端检查均通过。

## Goal

Workspace 标签的显示内容和编辑输入在固定宽度标签内保持视觉居中。

## Scope

- 显示态的 Workspace 图标与名称组合居中。
- 编辑态保留图标，并让输入文字居中。
- 关闭按钮固定在标签右侧，不参与内容居中计算。
- 保持既有 150px 固定宽度与长文本截断行为。

## Constraints

- 不改变标签高度、宽度、交互或 Workspace 状态。
- 内容与右侧关闭按钮不能重叠。

## Non-Goals

- 不改变图标、关闭按钮尺寸或标签颜色。
- 不添加动画。

## Acceptance

1. 显示态内容相对完整标签水平居中。
2. 编辑输入文字居中，标签仍为 150px。
3. 关闭按钮保持在右侧且不挤偏内容。
4. 长名称仍正确截断，完整前端检查通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1–3 | 本地浏览器读取元素中心坐标并截图检查显示态与编辑态。 |
| 4 | 长名称视觉检查、`pnpm check`、`git diff --check`。 |

## Open Questions

无。

## Recommended Approach

仅给现有 flex 内容增加 `justify-content:center` 会被仍在布局流内的关闭按钮向左挤偏。推荐将关闭按钮绝对定位到右侧，并为显示态和编辑态设置对称安全留白，使内容以完整标签中心为基准。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Project Context: not needed；这是局部视觉调整。
- Directory Map: not needed；没有结构变化。
