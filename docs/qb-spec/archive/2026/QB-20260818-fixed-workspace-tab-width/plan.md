---
id: QB-20260818-fixed-workspace-tab-width
status: archived
archived: 2026-09-02
legacy: true
---
# 固定 Workspace 标签宽度实施计划

## Goal

Plan Level: Tiny。通过局部 CSS 约束固定标签宽度，并验证普通、长名称和编辑状态。

## Affected Files

- `src/app/app.css`
- `docs/qb-spec/archive/2026/QB-20260818-fixed-workspace-tab-width/spec.md`
- 本计划

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 标签始终为 150px | 浏览器读取多个 `.workspace-tab` 的 `getBoundingClientRect().width`。 |
| 内容不改变尺寸 | 设置长名称并进入编辑态，重新测量并截图。 |
| 工程完整性 | `pnpm check`、`git diff --check`。 |

## Verification

1. 使用本地浏览器验证普通、长名称及编辑状态宽度。
2. 运行 `pnpm check`。
3. 运行 `git diff --check`。
