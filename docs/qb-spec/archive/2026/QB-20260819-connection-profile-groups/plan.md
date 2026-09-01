---
id: QB-20260819-connection-profile-groups
status: archived
archived: 2026-09-02
legacy: true
---
# 单层连接分组 Strict Plan

Status: Complete (2026-08-19)。

## Background

连接目前以扁平 profile 数组保存在 `profiles.json` schema v2 中。分组需要独立身份以保存空分组和支持稳定重命名，同时 profile 与 group 引用必须在一次原子写入中保持一致。

## Requirement

实现仅一层的连接分组，支持创建、重命名、删除、组内创建连接与移动连接；删除分组时保留连接并回退到“未分组”。

## Non-Goals

不支持子分组、排序、拖拽、批量连接或改变认证/会话生命周期。

## Architecture Impact

- Domain 增加 `ProfileGroupId` 与 `ProfileGroup`；`ConnectionProfile` 只持有可空 group id。
- Application 的 `ProfileService` 负责 group CRUD 与 profile 分组输入编排。
- `ProfileRepository` port 扩展 catalog 操作；JSON adapter 在同一锁和原子文件写入内维护引用完整性。
- Tauri commands 只映射 group/profile DTO，不承载删除回退规则。
- React dialog 只管理编辑状态与呈现，所有持久化规则通过 IPC。

## Domain Model Impact

- group 名称规范化后必填、长度上限 80。
- group 名称不区分大小写唯一。
- profile 可属于零或一个 group；不存在 parent/children 字段。
- 删除 group 会清空引用它的 profile `groupId`，不删除 profile。

## API Impact

- `ProfileDto` / `CreateProfileDto` 新增可空 `groupId`。
- 新增 `profile_group_list/create/update/delete` commands 与前端 adapter。
- 既有调用方需显式处理或传递 `groupId`，连接命令仍消费相同 profile 其他字段。

## Database Impact

- `profiles.json` 升级到 schema v3：顶层增加 `groups`，profile record 增加可选 `groupId`。
- schema v1/v2 缺失字段按空 groups 和 null groupId 读取；首次后续写入统一输出 v3。
- v3 加载校验 group/profile id 唯一及 profile group 引用存在。

## Implementation Tasks

1. 先写 domain、application、repository、DTO 与 React 失败回归测试。
2. 扩展 domain 与 repository port，完成 schema v3 adapter 和迁移。
3. 扩展 application service、错误码、Tauri commands 和组合根注册。
4. 扩展 TypeScript adapter；在 ConnectionDialog 实现分组列表、折叠、管理弹窗、组内新建与分组选择。
5. 更新长期产品、架构与决策上下文。
6. 执行前后端完整验证并更新文档状态。

## Acceptance To Verification

- 分组规则：domain/application focused tests。
- schema 与原子回退：`json_profile_repository` focused tests。
- IPC 契约：profile command DTO tests。
- UI 流程：`ConnectionDialog.test.tsx` 与样式测试。
- 全量回归：`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Test Plan

- 先确认新增测试在旧实现上失败。
- 覆盖正常创建/移动、重复名、空白名、删除非空组、旧 schema 迁移、悬空引用和敏感字段。
- UI mock 只模拟 IPC 边界，不在 mock 中复制分组规则。

## Rollback Plan

代码可回滚，但一旦写出 schema v3，旧版本会按 unsupported schema 拒绝打开而不会覆盖。若必须降级，需要先由新版导出或迁移回无分组的 schema v2；本任务不自动执行有损降级。

## Risks

- schema v3 降级不兼容；以明确拒绝和不覆盖保护数据。
- 多个 IPC 并发写可能造成竞态；repository 每个 catalog 操作必须在同一实例锁内完成加载、校验和原子保存。
- UI 当前 profile 列表来自 WorkspaceProvider、groups 来自 dialog；刷新顺序需避免短暂悬空展示。

## Documentation Updates

- 更新 `PRODUCT_SPEC.md` 的连接管理流程。
- 更新 `ARCHITECTURE_SPEC.md` 的 profile catalog 持久化边界。
- 在 `DECISIONS.md` 记录单层分组和删除回退决策。
- Directory Map 不变。

## Completion Evidence

- 分组 domain、application service、repository、IPC DTO 与 React UI 已按计划完成。
- `profiles.json` schema v3、旧版迁移、悬空引用保护及删除分组原子回退均有 Rust 回归测试。
- React 测试覆盖创建分组、组内新建、移动连接、重命名和二次确认删除。
- 前端 check 与 Rust fmt/clippy/test 全部通过；Directory Map 因无目录或职责边界变动无需更新。
