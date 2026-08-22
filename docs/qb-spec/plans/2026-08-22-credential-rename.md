# Credential Rename Plan

Status: Complete (2026-08-22)

## Background

凭证管理器目前只能创建、导入、查看和删除凭证。名称写入后无法修改，用户只能删除并重新创建，这会改变凭证 ID 并影响连接引用。

## Requirement

在不改变凭证身份和加密载荷的前提下，提供紧凑、可访问、可撤销的名称修改流程，并让列表、详情和持久化结果同步更新。

## Non-Goals

- 不修改凭证内容或算法。
- 不支持批量操作。
- 不增加 schema、依赖或外部工具调用。

## Architecture Impact

新增一条既有分层内的写路径：React 对话框调用 TypeScript bridge，Tauri command 委托 credential lifecycle/application service，service 执行名称规则，credential vault port 表达重命名能力，JSON adapter 原子更新元数据。业务校验不进入 UI、command 或 persistence。

## Domain Model Impact

无类型或身份模型变化。`CredentialId` 继续作为稳定身份，`CredentialSummary.name` 仍是可变展示元数据。

## API Impact

新增 Tauri 命令 `credential_rename`，请求 `{ credentialId, name }`，返回现有 `CredentialSummaryDto`。错误继续使用现有 credential error envelope。

## Database Impact

无 schema 或迁移。仅修改既有 credential record 的 `name` 字段；写入继续使用原子文件替换。

## Implementation Tasks

1. 增加失败测试：TypeScript IPC 参数、Rust vault 密文不变、command DTO，以及 CredentialDialog 编辑/保存/取消/错误行为。
2. 扩展 vault port、JSON adapter、application service 和 lifecycle，复用名称规范化。
3. 增加薄 Tauri command、命令注册和 TypeScript bridge。
4. 在详情标题实现与工作区一致的透明单线原位编辑，支持 Enter/失焦保存与 Escape 取消，保持 RSA 风险标签和操作槽位置稳定。
5. 运行聚焦测试并修正实现。
6. 执行 Rust 与前端全量质量闸口，更新任务文档状态。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 可发现、可访问的原位编辑 | CredentialDialog 角色/名称与焦点测试 |
| Enter/失焦保存与 Escape 取消 | CredentialDialog 用户行为测试 |
| 名称规则与稳定错误 | Rust service/command 测试，前端失败反馈测试 |
| 列表和详情同步 | bridge mock 返回更新摘要后的 UI 断言 |
| 仅名称发生变化 | JSON vault 重命名前后 document 对比 |
| RSA 标签和既有操作不回归 | CredentialDialog 现有及新增回归测试 |

## Test Plan

- Frontend 聚焦：`pnpm vitest run src/lib/tauri/credentials.test.ts src/components/dialogs/CredentialDialog.test.tsx src/app/appStyles.test.ts`。
- Rust 聚焦：credential lifecycle/service、command 与 JSON vault 模块测试。
- Rust 全量：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- Frontend 全量：`pnpm check`。

## Rollback Plan

移除前端编辑入口、TypeScript bridge、Tauri command、service/lifecycle 方法和 vault port 方法。无 schema 迁移；已经修改的名称仍是旧版本可读的普通元数据。

## Risks

- 重命名与自动锁定竞态可能失败；沿用锁定错误并让输入保留以便重试。
- 成功命令返回更新摘要，前端据此原子同步列表与详情，避免额外刷新造成视觉回跳。
- 长名称可能挤压风险标签或操作按钮；使用弹性输入、固定操作尺寸与现有截断规则约束。

## Documentation Updates

- 新增本 task spec 与 plan；无需更新长期架构、决策或 Directory Map。
