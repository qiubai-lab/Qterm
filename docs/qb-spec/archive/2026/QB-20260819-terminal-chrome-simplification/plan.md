---
id: QB-20260819-terminal-chrome-simplification
status: archived
archived: 2026-09-02
legacy: true
---
# 终端标题栏与滚动条精简实施计划

Status: Complete (2026-08-19)

## Requirement

Plan Level: Standard。涉及多文件 UI 调整、组件状态删除和回归测试，但不触及后端、协议或持久化模型。

## Scope

轻量化连接触发器、主题化 xterm 滚动条并删除终端最大化能力；保持连接菜单、分割和会话行为不变。

## Affected Files

- `src/components/Icon.tsx`
- `src/workspace/TerminalTargetPicker.tsx`
- `src/workspace/TerminalTargetPicker.test.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Design

- 复用 Icon 组件新增三横线 `menu` 图标，替换选择器中的 chevron。
- 触发器回到 flex 布局和透明边框，菜单图标只用间距与颜色提示点击能力。
- 通过 `.terminal-surface .xterm-viewport` 定制 5px 滚动条；滑块默认透明，在 hover、focus-within 与 `.scrolling` 时切换为 accent 半透明色。
- 从 WorkspaceCanvas 到 TerminalBlock 删除 maximized 状态、派生类名、隐藏逻辑、回调和按钮。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 轻量选择器 | 组件结构测试与浏览器截图。 |
| 滚动条主题与显隐 | CSS 回归测试、浏览器计算样式和长内容视觉检查。 |
| 最大化完整移除 | WorkspaceCanvas 渲染测试、源码搜索和 TypeScript 检查。 |
| 无行为回归 | 聚焦测试及完整 `pnpm check`。 |

## Test / Verification

1. 先更新选择器、样式与 WorkspaceCanvas 测试，使旧实现失败。
2. 修改图标、DOM、CSS 和 LayoutView 状态链。
3. 运行聚焦 Vitest、`rg`、`git diff --check` 与完整前端检查。
4. 在本地页面检查默认、展开和长内容滚动条状态。

## Documentation Updates

完成后写入验证证据并标记 task spec、plan 状态；无需 Project Context 或 Directory Map 更新。
