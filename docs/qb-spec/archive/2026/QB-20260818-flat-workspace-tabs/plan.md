---
id: QB-20260818-flat-workspace-tabs
status: archived
archived: 2026-09-02
legacy: true
---
# 顶部 Workspace Tab 扁平化实施计划

## Status

Completed on 2026-08-18. 前端检查、Rust 全量测试、严格 Clippy、浏览器可见性检查和原生 release bundle 均通过。

## Background

当前模型采用 `Workspace → Tab → Terminal Block`，顶部同时存在 Workspace 下拉切换器和内部 Terminal Tab。新的产品规则要求顶部 Tab 本身就是 Workspace，移除内部 Tab 层和下拉管理入口。

## Requirement

- 顶部 Workspace Tab 直接执行 Workspace CRUD、切换、排序和关闭。
- Workspace 直接拥有 active Block 与 layout。
- 保持多 Block、多 session、隐藏 Workspace 持续运行和安全持久化。
- schema v1 安全迁移到 schema v2。

## Non-Goals

- 不新增新的导航层、项目集合或 Widget 类型。
- 不改变 SSH、认证、host-key、SFTP 和 profile command。
- 不重写已稳定的纯布局树算法。

## Architecture Impact

- `WorkspaceShell` 删除 switcher/popover 和内部 Tab 渲染，顶部 tab-strip 改为 Workspace 集合。
- `WorkspaceProvider` 的 active derivation 和父级 block 集合从 Tab 改为 Workspace。
- `workspace/model` 与 `reducer` 移除 `WorkspaceTab`，Workspace 直接拥有 layout。
- Rust workspace domain/DTO/persistence record 同步扁平化；migration 仅属于 persistence adapter。
- `LayoutView` 从接收 WorkspaceTab 改为接收 Workspace，并继续只 dispatch 结构动作。

## Domain Model Impact

- v2 `WorkspaceDocument { activeWorkspaceId, workspaces }`
- v2 `Workspace { id, name, activeBlockId, layout }`
- 删除 persisted `WorkspaceTab` 和 `activeTabId/tabs`。
- 至少一个 Workspace、每个 Workspace 至少一个 block、全局 block id 唯一等规则保持不变。

## API Impact

`workspace_load/workspace_save` command 名称不变，payload schemaVersion 从 1 升为 2。前端只发送/接收 v2。Rust repository 可以读取 v1 并返回 v2 domain。

## Database Impact

`workspaces.json` 升级为 schema v2。读取 v1 时：单 Tab Workspace 沿用原 Workspace 名称；多 Tab Workspace 为每个旧 Tab 创建 `Workspace · Tab`；旧 layout、activeBlockId、blockId 与 profileId 原样保留。下一次保存写为 v2，原子替换且继续拒绝敏感字段。

## Implementation Tasks

1. 先更新前端 model/reducer/layout tests，删除 Tab actions，新增 Workspace reorder 与直接 layout actions。
2. 更新 Rust domain、DTO 与 repository v2，并先加入 v1 migration、安全字段和 round-trip 测试。
3. 调整 WorkspaceProvider 为 workspace-scoped runtime derivation，同时保持 blockId writer/session registry。
4. 重写 WorkspaceShell 顶部 tab-strip，删除 switcher/popover，迁移关闭、重命名、拖动和快捷键。
5. 调整 LayoutView、dialogs 和测试中的作用域引用。
6. 更新长期 context、README、安全模型、spec 状态和 Directory Map。
7. 执行前端、Rust、v1 fixture、真实 macOS debug `.app`、release bundle 门禁。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 顶部只剩 Workspace Tab | Shell RTL 测试与 debug `.app` AX/截图。 |
| Workspace CRUD/排序/最小不变量 | reducer 单元测试与交互测试。 |
| 布局和 session 保留 | layout/provider tests，切换后 mounted canvas DOM 检查。 |
| v1→v2 无损迁移 | Rust repository fixture，断言名称、active、layout/block/profile 不变。 |
| v2 安全持久化 | Rust DTO/repository sensitive/unknown/round-trip tests。 |
| 级联关闭 | Shell active session count 与 provider close 测试。 |
| 单层标题栏与紧凑布局 | debug `.app` 截图、720×520 browser/native 检查。 |

## Test Plan

- 前端：model/reducer/layout/workspace IPC/provider/shell 全套 Vitest。
- Rust：domain v2、DTO camelCase、repository v2 round-trip、v1 migration、敏感字段拒绝。
- 集成：`pnpm check`、`cargo fmt --check`、`cargo test`、严格 Clippy。
- 手工：新建两个 Workspace、分屏、切换、排序、关闭；确认顶部无下拉框和 Terminal 子 Tab。
- 发布：`pnpm tauri build`。

## Rollback Plan

- command 名称保持不变，可回滚前端与 Rust workspace 模块而不影响 profile/known-host/session 数据。
- migration 读取期间不覆盖 v1 文件；只有成功保存 v2 时才原子替换。
- `profiles.json` 与 `known-hosts.json` 独立，不参与迁移。

## Risks

- 多 Tab v1 数据扁平化后命名冲突：使用 `Workspace · Tab` 并保持稳定 ID 派生/复用策略。
- 活动项映射错误：针对 active Workspace/Tab 组合建立迁移测试。
- 删除 Tab 层时漏关或串流 session：所有生命周期继续从 layout blockIds 计算并用 provider 隔离测试保护。
- 旧文档未知/损坏时误覆盖：load 失败仍不写文件，repository 测试保护。

## Documentation Updates

- 更新 PRODUCT_SPEC、ARCHITECTURE_SPEC、DECISIONS 的长期导航规则。
- 更新 README 工作区操作、安全模型 schema v2 和 Directory Map 职责描述。
- 标记本 task spec 与 plan 的完成状态及迁移行为。
