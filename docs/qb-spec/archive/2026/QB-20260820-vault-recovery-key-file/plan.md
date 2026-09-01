---
id: QB-20260820-vault-recovery-key-file
status: archived
archived: 2026-09-02
legacy: true
---
# Vault Recovery Key File Implementation Plan

## Background

当前 `secrets.vault` v2 使用 Argon2id 派生 KEK 包装随机 data key，修改主密码只重新包装该 data key。新增恢复文件可以复用这一 envelope encryption 边界，但会改变 vault schema、敏感文件生命周期与初始化/重置 IPC。

## Requirement

初始化 vault 时必须先由用户保存恢复密钥文件；忘记主密码后可选择该文件设置新主密码并保留全部凭证。恢复成功后轮换恢复文件并使旧文件失效。旧版 vault 不迁移，可在重新初始化时定向清除。

## Non-Goals

- 不恢复旧主密码，不提供云端托管、多恢复文件、硬件密钥或日常恢复文件解锁。
- 不迁移 v2 credential ciphertext。
- 不改动 SSH/session 认证协议、profile schema 或现有凭证逐条加密格式。

## Architecture Impact

- `CredentialVault` port 扩展恢复文件准备、带恢复材料初始化、恢复重置和旧版清理能力；仍不依赖 Tauri/UI。
- `CredentialService` 与 `CredentialLifecycle` 编排恢复用例和成功后的解锁 session，不实现文件格式或系统对话框。
- `JsonCredentialVault` 升级为 v3，拥有 recovery document 格式、vault ID/generation 校验、双包装 data key、严格解析与原子 vault 写入。
- Tauri command 将恢复拆为“选择验证旧密钥”和“保存新密钥并提交”两个 IPC 阶段；阶段间材料只以 zeroizing Rust bytes 暂存在 `CredentialState`，关闭/返回由取消 IPC 清除。系统对话框、受限文件 I/O、取消语义和失败回滚仍由 Rust 负责。
- React 使用现有 compact dialog 结构按“选择并验证旧密钥 → 输入新主密码 → 确认保存替代密钥”呈现恢复流程，不接收文件路径或恢复材料。

## Domain Model Impact

- `VaultStatus` 增加 legacy/unsupported 状态，使 UI 可提供定向清理并重新初始化，而不是尝试解锁。
- `CredentialError` 增加恢复文件无效、已过期/不匹配和恢复文件存储失败等稳定语义。
- 不改变 `CredentialMaterial`、`CredentialId` 或 profile domain。

## API Impact

- `credential_vault_initialize` 返回 `{ completed: boolean }`，取消保存时为 false 且 vault 保持未初始化。
- 新增无输入的 `credential_vault_prepare_master_password_reset` 选择并验证旧文件；`credential_vault_reset_master_password` 只在前端第二次确认后保存新文件并提交，输入仅含新主密码；`credential_vault_cancel_master_password_reset` 清除阶段间 Rust 暂存材料。
- 复用 `credential_vault_clear` 的精确确认契约，清除旧 vault 与全部 credential references，避免增加语义重复的破坏性 IPC。
- `credential_vault_status` 增加 `legacy: boolean`。
- 前端 bridge 对应更新；任何 IPC 返回均不包含恢复材料、文件正文或路径。

## Database Impact

- `secrets.vault` 从 schema v2 升为 v3，新增 `vaultId`、`recoveryGeneration` 与 `recoveryWrappedDataKey`。
- 新恢复文件使用独立 schema v1，包含 purpose、vaultId、generation 和随机 256-bit recovery key。
- v2 及其他旧 schema 不读取、不迁移；仅经显式重新初始化流程定向删除。

## Implementation Tasks

1. 先扩展 Rust fixture/tests，定义 v3 双包装、错误/过期文件、轮换、凭证密文不变、弱密码和失败不改 vault 行为。
2. 扩展 domain error/status、vault port、service 与 lifecycle；恢复成功复用 `begin_session`，失败不改变 runtime/session。
3. 实现 v3 persistence 与 recovery document 严格校验；AAD 绑定 vault schema、ID、generation 和用途，恢复 key 与中间明文使用 zeroizing wrapper。
4. 在 credential command 中实现受限恢复文件读写、保存/打开对话框、初始化取消、恢复轮换与旧版定向清理；注册新 commands 和稳定错误映射。
5. 更新 TypeScript bridge 与测试，新增 `RecoveryMasterPasswordDialog`；先通过准备 IPC 校验恢复密钥，成功后才显示新主密码表单，再为恢复轮换增加显式文件保存确认步骤；主动取消保持流程可重试且不显示错误。
6. 更新长期 product/architecture/decision 文档；仅在新增稳定模块/边界时更新 Directory Map。
7. 运行 focused tests，随后执行完整前端与 Rust 质量门禁。

## Acceptance To Verification

- A1：Rust command/helper 测试与 MasterPasswordDialog RTL 测试证明取消保存不初始化、成功保存后才完成。
- A2/A8：序列化 fixture 与 IPC 测试证明主密码、data key、凭证明文和 recovery bytes 不进入错误/DTO/普通文件字段。
- A3/A6/A9：vault/lifecycle 测试证明恢复后旧密码失败、新密码成功、credential ciphertext/引用不变且 session 重新计时。
- A4：vault 测试覆盖错误 vault ID、旧 generation、篡改、畸形、弱密码，逐项比较失败前后 vault bytes。
- A5：测试覆盖 recovery generation 提升、旧文件失效、替代文件保存取消/失败时 vault 不变。
- A7：command/profile 测试覆盖旧 vault 定向清理和非目标配置保留；不得调用 migration reader。
- A10/A11：React 测试证明旧密钥选择与新密钥保存之间必须返回应用并二次确认，取消后当前确认弹窗保持且无错误，返回会调用清理 IPC；Rust 状态测试证明暂存材料可消费、覆盖和清除。Rust helper 测试锁定 `qterm-recovery-{timestamp}.key` 命名。

## Test Plan

- Frontend focused：`pnpm vitest run src/lib/tauri/credentials.test.ts src/components/dialogs/MasterPasswordDialog.test.tsx src/components/dialogs/RecoveryMasterPasswordDialog.test.tsx src/components/dialogs/CredentialDialog.test.tsx`。
- Rust focused：`cargo test json_credential_vault`、credential lifecycle/command tests。
- Full frontend：`pnpm check`。
- Full Rust：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Rollback Plan

- 代码回滚时同时回滚 v3 schema 与新 IPC；尚未发布阶段允许删除生成的 v3 `secrets.vault` 并重新初始化。
- 实现不得自动降级或把 v3 写回 v2。

## Risks

- 两个用户选择文件之间无法获得跨文件系统事务；采用“先以 create-new 写替代恢复文件，再原子提交 vault”，提交失败时旧 vault/旧恢复文件仍有效，新文件作为可删除孤立文件。
- 恢复文件与 vault 放在一起会削弱安全性；默认文件名和 UI 明确提示分开离线存储，但不越权禁止用户选择的位置。
- 清理旧 vault 是破坏性操作；必须精确确认并将范围限制到 vault 与 credential references。

## Documentation Updates

- 更新 `PRODUCT_SPEC.md` 的恢复流程与用户保管责任。
- 更新 `ARCHITECTURE_SPEC.md` 的双包装、恢复文件信任边界与 IPC 约束。
- 更新 `DECISIONS.md` 记录 v3、不兼容旧 vault 和恢复后轮换决策。
- 若未新增目录/稳定模块边界，则 Directory Map 不变。
