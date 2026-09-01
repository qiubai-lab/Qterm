---
id: QB-20260818-flat-workspace-tabs
status: archived
archived: 2026-09-02
legacy: true
---
# 顶部 Workspace Tab 扁平化 Task Spec

## Status

Completed on 2026-08-18. 已交付前端与 Rust 扁平模型、schema v1 → v2 迁移、顶部 Workspace 标签及回归保护。

## Goal

顶部每一个 Tab 就是一个独立 Workspace。用户直接在顶部创建、切换、重命名、排序和关闭 Workspace；应用不再存在 Workspace 下拉框，也不再存在 Workspace 内部的独立终端 Tab 层级。

## Scope

- 将导航与持久化模型从 `Workspace → Tab → Terminal Block` 扁平化为 `Workspace → Terminal Block layout`。
- 顶部 Workspace Tab 支持创建、切换、双击重命名、拖动排序和关闭，并始终至少保留一个 Workspace。
- 每个 Workspace 直接拥有 `activeBlockId` 与二叉 split layout；Workspace 内继续支持多个 Terminal Block、独立 SSH session、分割、resize、最大化和拖动重排。
- 删除 Workspace 下拉框及其弹出管理界面。
- Workspace 切换不卸载 xterm、不终止后台 SSH session。
- Workspace 持久化升级为 schema v2；读取 schema v1 时把每个旧 Tab 迁移成一个新 Workspace，保留布局、Block ID 和 profile 引用。
- 关闭包含活动 session 的 Workspace 时继续展示影响数量并在确认后级联关闭。

## Constraints

- 保持 Tauri 2、React、TypeScript、Rust 和现有 SSH/SFTP command surface。
- 高频终端数据仍按稳定 `blockId` 直接路由，不进入 Workspace reducer 或持久化文档。
- 迁移不得保存或引入密码、口令、session ID、终端输出或私钥正文。
- 顶部栏继续与 macOS overlay title bar 合并，最小窗口不得出现页面级横向滚动。
- v2 文档至少包含一个 Workspace，每个 Workspace 至少包含一个 Terminal Block。

## Non-Goals

- 不引入新的项目/会话集合层替代被移除的内部 Tab。
- 不实现 Web、AI 或其他非 Terminal Widget。
- 不改变 SSH 认证、host-key、SFTP 或 profile 安全规则。
- 不实现跨设备同步或重启自动重连。

## Acceptance

1. 顶部只显示 Workspace Tab 与新增按钮，不显示 Workspace 下拉框或内部 Terminal Tab。
2. 新建 Workspace 会生成一个未连接 Terminal Block；Workspace 可切换、重命名、排序和关闭，且不能关闭最后一个 Workspace。
3. 每个 Workspace 独立保存和恢复布局、active Block 与 profile 引用；切换后活动 SSH session 和 xterm buffer 保留。
4. schema v1 文档可以无损迁移：每个旧 Tab 对应一个 v2 Workspace，布局和 Block ID 不变，当前活动项映射正确。
5. schema v2 继续拒绝敏感字段、运行时字段、无效引用、重复 ID、过深或过大的布局。
6. Workspace 关闭确认准确统计活动 session；取消不改变状态，确认后相关 session 全部关闭。
7. 顶部栏在 macOS 原生 overlay 窗口中保持单层，并在最小窗口允许 Workspace Tab 横向滚动而不挤压终端画布。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 单层 Workspace Tab 导航 | Shell 组件测试、真实 debug `.app` 截图和 DOM/AX 检查。 |
| Workspace CRUD/排序 | reducer 单元测试与顶部交互测试。 |
| 布局与 session 隔离 | layout 测试、多 block provider 路由测试、切换 Workspace 可见性检查。 |
| v1 → v2 迁移 | Rust repository migration fixture 与前端 v2 IPC round-trip 测试。 |
| 安全持久化 | Rust unknown/sensitive/runtime 字段拒绝测试与生成文件内容断言。 |
| 关闭生命周期 | active session 计数、取消/确认和级联 close 组件测试。 |
| 标题栏与最小窗口 | macOS debug bundle 视觉检查、720×520 尺寸检查。 |

## Open Questions

无阻塞问题。迁移命名采用：旧 Workspace 只有一个 Tab 时沿用 Workspace 名称；有多个 Tab 时生成 `Workspace · Tab`，避免重名和语义丢失。

## Recommended Approach

采用真正的扁平领域模型和 schema v2，而不是仅在 UI 隐藏旧 Workspace 层。前端 reducer 直接管理 Workspace 的 layout；runtime registry 继续以 `blockId` 为键。Rust domain、DTO 和 persistence record 同步移除 Tab，repository 对 schema v1 做一次纯数据迁移并在下一次结构变更时写回 v2。

## Next Skills

- `writing-qb-plans`：规划跨前端 reducer、runtime、Rust schema、迁移与视觉验证的执行顺序。
- `maintaining-project-context`：导航和领域层级是长期产品决策，需要更新产品、架构与决策记录。
- `checking-architecture-boundaries`：确保扁平化不会把 layout 规则重新堆回 shell 或 IPC adapter。
- `protecting-critical-behavior`：优先保护 v1 迁移、布局 ID、session 隔离和级联关闭。
- `verifying-before-completion`：执行前端、Rust、迁移、真实窗口和 release bundle 门禁。
- `updating-directory-map`：共享模型与入口职责发生变化，完成后更新结构索引。
