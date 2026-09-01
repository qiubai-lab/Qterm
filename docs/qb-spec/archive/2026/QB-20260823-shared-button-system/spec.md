---
id: QB-20260823-shared-button-system
status: archived
archived: 2026-09-02
legacy: true
---
# Shared Button System

## Goal

统一 Qterm 的操作按钮语义、尺寸、主题角色和可访问状态，避免连接、凭证、设置及新增功能继续复制 feature-local 按钮样式。

## Scope

- 提供共享 `Button`、`IconButton` 与非交互 `StatusBadge`。
- Button variant 固定为 `primary | secondary | quiet | danger | dangerSolid`，尺寸固定为 `regular | compact`。
- IconButton 固定要求可访问名称，并支持 regular/compact 尺寸。
- 迁移连接管理、凭证管理、系统设置、DialogFrame 及通用弹窗操作。
- 旧 `primary-button | secondary-button | danger-button | icon-button` 类在迁移期保留视觉兼容，但不得继续拥有独立色板。

## Non-Goals

- 不把 segmented tabs、menu item、连接/分组列表行、选择卡片或 disclosure row 包装成 Button。
- 不改变连接、凭证、设置的业务状态、事件编排或弹窗层级。
- 不引入新的 UI 依赖或新的全局颜色系统。

## Acceptance

- 共享按钮覆盖 rest、hover、active、focus-visible、disabled 和 loading 状态，并只消费主题语义角色。
- 同一尺寸的文本按钮具有统一高度、圆角、字重与图标间距。
- 连接管理中的新建、导入、保存、删除和关闭动作使用共享类型；凭证与设置的通用动作同步迁移。
- 凭证库状态显示为不可交互 StatusBadge，不再表现为按钮。
- IconButton 必须通过类型接口提供可访问名称。
- Dark 与 Light 不再针对共享按钮依赖 `lightOverrides.css` 修补。
- 既有业务测试、样式契约、类型检查和生产构建通过。
