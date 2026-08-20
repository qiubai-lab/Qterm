## Goal

让用户可从连接信息的右键菜单快速复制一份可独立编辑的连接配置。

## Scope

- 在连接右键菜单的“编辑连接”之后增加“复制连接”。
- 副本保留主机、端口、用户名、认证方式、凭证引用和原分组。
- 副本立即持久化，使用清晰且不与现有连接重名的“副本”名称，并在创建后进入该副本的编辑状态。
- 复制失败时在现有编辑器反馈区域显示错误，不留下伪副本。

## Constraints

- 复用现有 profile 创建、刷新和当前 Block 目标选择流程。
- 凭证仍按引用共享，不复制或暴露凭证内容。
- 菜单保留既有鼠标、ContextMenu 键、Shift+F10、Escape 和焦点行为。

## Non-Goals

- 不复制 Workspace、终端会话、连接状态或凭证实体。
- 不新增后端复制命令，不调整 profile 持久化 schema。
- 不重做连接管理菜单或列表样式。

## Acceptance

1. 已保存连接的右键菜单依次提供编辑、复制和删除操作。
2. 复制后创建一条新 ID 的 profile，除名称外完整保留原连接字段和 `groupId`。
3. 默认名称为“原名称 副本”；重名时使用递增编号，并在复制后选中副本供继续编辑。
4. 复制操作可从鼠标或键盘打开的同一菜单使用，既有关闭与删除确认行为不回归。
5. 创建失败时展示后端错误，且不切换到不存在的副本。

## Acceptance To Verification

- 1–5：使用 `ConnectionDialog.test.tsx` 的 Testing Library 行为测试覆盖菜单、复制输入、重名、编辑状态和失败反馈。
- 既有行为：运行连接弹窗聚焦测试。
- 前端完整性：运行 `pnpm check`。

## Open Questions

无阻塞问题。

## Recommended Approach

方案 A：菜单调用现有 `createProfile`，生成副本名称后立即保存、刷新并选中副本。方案 B：只把原配置装入一个未保存的新建表单，等待用户再次保存。推荐方案 A，因为“复制一份”的结果立即存在，用户随后编辑时不会因关闭弹窗丢失副本；同时复用现有创建边界，无需新增 IPC。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`：确认复制编排留在连接管理 UI，持久化仍由现有 profile application/repository 路径负责。
- `protecting-critical-behavior`：保护字段复制、分组归属、重名和失败行为。
- `verifying-before-completion`
- Directory Map: not needed；没有目录、入口或模块职责变化。
