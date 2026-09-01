---
id: QB-20260818-centered-workspace-tab-content
status: archived
archived: 2026-09-02
legacy: true
---
# Workspace 标签内容居中实施计划

## Goal

Plan Level: Tiny。通过局部 CSS 调整显示态、编辑态和关闭按钮的排版关系。

## Affected Files

- `src/app/app.css`
- `docs/qb-spec/archive/2026/QB-20260818-centered-workspace-tab-content/spec.md`
- 本计划

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 显示与编辑内容居中 | 浏览器截图及元素中心坐标检查。 |
| 关闭按钮不挤偏内容 | 检查关闭按钮绝对定位及内容对称留白。 |
| 固定宽度与截断不回归 | 浏览器测量 150px，运行 `pnpm check`。 |

## Verification

1. 检查显示态、编辑态和长名称状态。
2. 运行 `pnpm check`。
3. 运行 `git diff --check`。
