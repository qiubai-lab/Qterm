---
id: QB-20260824-connection-manager-theme-hover
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

连接管理中的分组与连接行在 hover 时形成统一、由当前主题驱动的视觉状态，展开箭头不再出现脱离整行的黄色高亮。

## Scope

- 让分组展开箭头跟随分组行的文字 hover 状态。
- 保持分组和连接行继续使用现有主题语义 token。
- 增加 CSS 契约回归保护。

## Constraints

- 不修改 Dark、Light、Cyberpunk 的全局 palette。
- 不改变选中、拖放、焦点或展开/折叠行为。
- 保留现有紧凑布局与 120–150ms 状态过渡。

## Non-Goals

- 不重设计连接管理侧栏。
- 不改变其他组件对 `--icon-hover` 的使用。
- 不调整连接选中状态的主题强调色。

## Acceptance

- hover 分组时，展开箭头与分组文字使用同一文字状态，不单独消费黄色 `--icon-hover`。
- 分组容器和连接行 hover 继续分别使用 `--hover`、`--text` 等主题语义 token。
- 现有展开、选择、拖放和键盘焦点样式保持不变。

## Acceptance To Verification

- CSS 契约测试断言箭头继承整行颜色，并拒绝 `--icon-hover` 绑定。
- CSS 契约测试断言分组与连接 hover 仍使用主题语义 token。
- 运行相关 Vitest，再运行 `pnpm check`。

## Open Questions

无。

## Recommended Approach

推荐让箭头在默认态以透明度表达次级层级、hover 时继承父按钮文字颜色；这能使整行状态一致且自动适配所有主题。备选方案是修改 Cyberpunk 的全局 `--icon-hover`，但会影响无关图标并削弱该主题既有的品牌强调，因此不采用。

## Next Skills

- `writing-qb-plans`：使用 Standard 计划，因为改动包含样式与自动化回归保护。
- `protecting-critical-behavior`：为已出现的视觉回归补聚焦 CSS 契约。
- `verifying-before-completion`：运行相关测试与完整前端检查。
- Project Context：不需要，未改变长期产品或架构约束。
- Directory Map：不需要，未发生结构或职责变化。
