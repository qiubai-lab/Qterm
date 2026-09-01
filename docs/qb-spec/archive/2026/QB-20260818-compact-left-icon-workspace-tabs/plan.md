---
id: QB-20260818-compact-left-icon-workspace-tabs
status: archived
archived: 2026-09-02
legacy: true
---
# 紧凑左侧图标 Workspace 标签实施计划

## Goal

Plan Level: Tiny。缩短固定宽度，并把 Workspace 图标从中央内容流移到左侧固定位置。

## Affected Files

- `src/app/app.css`
- `docs/qb-spec/archive/2026/QB-20260818-compact-left-icon-workspace-tabs/spec.md`
- 本计划

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 标签为 128px | 浏览器读取 `.workspace-tab` 计算宽度。 |
| 图标左置、文本居中 | 浏览器检查显示态和编辑态几何位置并截图。 |
| 长内容不扩宽 | 输入长名称后重新测量，运行 `pnpm check`。 |

## Verification

1. 检查短名称、长名称和编辑状态。
2. 运行 `pnpm check`。
3. 运行 `git diff --check`。
