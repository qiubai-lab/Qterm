---
id: QB-20260818-fixed-workspace-tab-width
status: archived
archived: 2026-09-02
legacy: true
---
# 固定 Workspace 标签宽度 Task Spec

## Status

Completed on 2026-08-18。普通、超长名称和编辑态均实测为 150px；长名称省略、输入内部滚动与完整前端检查通过。

## Goal

所有 Workspace 标签在普通、长名称和编辑状态下保持一致宽度，避免标题栏布局跳动。

## Scope

- Workspace 标签统一固定为 150px 宽。
- 普通超长名称在标签内部省略显示。
- 编辑输入只能占用标签内部可用空间，不得撑大或压缩标签。
- 空间不足时继续使用现有标签栏横向滚动。

## Constraints

- 不改变标签高度、重命名行为或 Workspace 状态模型。
- 小窗口下也保持固定宽度，不通过响应式规则压缩标签。

## Non-Goals

- 不增加用户可配置的标签宽度。
- 不重新设计标签栏或关闭按钮。

## Acceptance

1. 多个标签的计算宽度均为 150px。
2. 短名称、超长名称和编辑输入不会改变标签宽度。
3. 超长普通名称保持单行省略，输入内容限制在标签内部。
4. 完整前端检查通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1–3 | 本地浏览器分别测量普通标签与编辑标签的计算宽度，并截图检查长名称。 |
| 4 | `pnpm check` 与 `git diff --check`。 |

## Open Questions

无。

## Recommended Approach

仅设置 `width` 仍允许 flex 布局压缩标签；推荐同时固定 `width`、`min-width`、`max-width` 和 `flex-basis`，并让名称节点与输入框在内部收缩。标签栏已有横向滚动，固定尺寸不会阻塞窄窗口使用。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Project Context: not needed；这是局部视觉规则。
- Directory Map: not needed；没有结构变化。
