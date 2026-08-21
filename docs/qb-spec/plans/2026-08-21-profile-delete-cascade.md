# Profile Delete Cascade Strict Plan

## Background

profile 删除 command 当前在 Network repository 存在引用时返回 `ProfileHasNetworkRules`。连接管理只在提交后把错误放入编辑区，且确认文案错误声称会删除凭证。实际用户连接被 4 条持久化规则引用，因此所有删除入口都会被拒绝。

## Requirement

将连接删除改为显式确认后的安全级联：删除 profile、其全部网络规则并关闭相关 Network session，保留共享 credential；失败时避免静默半删除。

## Non-Goals

- 不改变持久化 schema 或凭证生命周期。
- 不由 React 逐条实现跨 repository 事务。
- 不重构无关 Workspace、Terminal 或 Files session。

## Architecture Impact

- `ProfileService` 所在 application 边界增加跨 Profile/Network service 的删除协调函数。
- `NetworkService` 与 `NetworkRepository` 增加按 profile 批量删除的窄接口；JSON adapter 在一次锁定和一次原子保存中完成过滤。
- Tauri profile command 调用 application 协调函数，成功后要求 SSH manager 关闭相应 Network purpose session。
- React 只展示确认、提交 id、刷新状态与呈现结果数量。

## Domain Model Impact

无模型或不变量变化。profile id 与 network rule profile id 保持独立类型；级联是 application use case。

## API Impact

`profile_delete` 从空返回改为 `{ deletedNetworkRules: number }`。输入仍只接受 profile id。

## Database Impact

无 schema 变化。两个 JSON 文件各自原子更新；application 在网络文件写入失败时尽力恢复 profile。

## Implementation Tasks

1. 为 Network repository/service 增加 `delete_by_profile`，测试只删除目标规则并返回数量。
2. 在 application 层实现 profile + rules 协调删除和 profile 回滚，先写成功、无规则和失败测试。
3. 扩展 SSH manager 关闭指定 profile 的 Network session，并补 runtime 单元测试。
4. 更新 profile command/TS adapter 返回删除摘要，移除旧的引用冲突分支。
5. 修正 ConnectionDialog 确认文案、忙碌状态、右键/编辑器统一流程和结果反馈。
6. 更新长期 product/architecture/decision 文档并执行完整验证。

## Acceptance To Verification

| Acceptance | Test / check |
| --- | --- |
| 无规则与有规则级联 | profile deletion application tests |
| 仅删除目标 profile 的规则 | JsonNetworkRepository tests |
| 第二步失败恢复 profile | faulting NetworkRepository application test double |
| 关闭 Network session | SshSessionManager focused unit test |
| 两个 UI 入口、准确确认与反馈 | ConnectionDialog Testing Library tests |
| IPC 返回契约 | profiles adapter test + Rust DTO/command helper tests |

## Test Plan

- 先写 Rust application/repository 与前端交互失败测试。
- 聚焦运行相关 Vitest 与 Cargo module tests。
- 完整运行 `pnpm check`、Rust fmt、clippy、all-targets tests。
- 不运行 `pnpm tauri build`：无依赖、配置或打包变化。

## Rollback Plan

恢复 `profile_delete` 的 Network 引用冲突检查，移除批量删除接口和返回摘要，并恢复前端阻止删除文案。无 schema 或数据迁移需要回滚。

## Risks

- 跨两个 JSON 文件无法提供崩溃级事务；通过每库原子写入和第二步失败时恢复 profile 降低风险。
- 正在运行的 Network rule 若只删除持久化记录会残留 listener；成功级联后必须关闭该 profile 的 Network session。
- 删除确认必须明确关联规则也会永久删除，避免用户误解。

## Documentation Updates

- `docs/qb-spec/context/PRODUCT_SPEC.md`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`
- Directory Map 不需要更新。
