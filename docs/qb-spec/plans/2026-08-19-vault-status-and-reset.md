# 密码保险库状态与重置 Strict Plan

Status: Complete (2026-08-19)。

## Background

当前标题栏“密码管理”会通过主密码换取短期 manager token，再在独立弹窗逐条解密或删除密码。新需求将凭据查看收回到连接表单的临时密码输入，并把标题栏入口改为保险库状态与整体重置。

## Requirement

移除 manager 明文管理链路，提供状态驱动的初始化/信息/清除流程和表单密码显示切换。

## Non-Goals

不修改加密算法、vault schema、profile schema、认证连接流程或私钥口令策略。

## Architecture Impact

- `CredentialVault` port 新增整体 `clear` 能力，规则由应用服务编排，Tauri command 只转发。
- Json adapter 负责在持有运行时锁时删除 vault 文件并清除 zeroized 内存密钥。
- 删除 manager token/reveal API，前端不再获得已持久化密码明文。

## Domain Model Impact

- 删除只服务 manager 列表的 `SavedCredential` 和 `AuthorizationInvalid` 错误。
- `VaultStatus` 与其他凭据错误保持不变；clear 为幂等操作。

## API Impact

- 新增 `credential_vault_clear(): Promise<void>`。
- 删除 authorize/list/reveal/manager-delete/revoke IPC；这是本地未发布功能收敛，不提供兼容 shim。

## Database Impact

- vault schema 不变。
- clear 删除整个 `credential-vault.json`；profile/workspace 数据不受影响。

## Implementation Tasks

1. 先补 adapter 清除和前端状态/确认/显示密码回归测试。
2. 实现 port → application → command → Json adapter 的 clear 链路。
3. 删除 manager IPC、前端 adapter、弹窗和相关测试。
4. 重构 ConnectionDialog 状态按钮、状态弹窗、确认框和密码输入控件。
5. 更新长期安全/产品决策文档并执行完整验证。

## Acceptance To Verification

- 状态分支与显示密码：组件测试。
- 清除二次确认与失败保持状态：组件测试。
- 文件、密文和内存 key 同时清除；幂等；存储失败不伪报成功：Rust adapter 测试。
- manager API 完整移除：TypeScript/Rust 编译、IPC 测试和 `rg` 检查。

## Test Plan

- Frontend focused：ConnectionDialog、MasterPasswordDialog、credentials adapter、styles。
- Rust focused：json credential vault、credential command/service。
- Full：`pnpm check`；cargo fmt/clippy/test。

## Rollback Plan

回滚 clear command 与状态 UI，并恢复 manager 相关文件/API。保险库 schema 未迁移，未执行 clear 的用户数据可直接继续使用；已经确认清除的数据不可恢复。

## Risks

- clear 是不可恢复操作：必须二次确认并明确列出删除范围。
- 文件删除与并发 save：adapter 必须先持有 runtime 锁，避免已开始的 save 在 clear 后重建文件。
- 显示密码增加肩窥风险：只切换当前输入，不从 vault 加载，且切换按钮有明确状态。

## Documentation Updates

更新 Product/Architecture/Decisions 中长期有效的保险库交互、清除语义和前端明文边界；同步 Directory Map 中已移除的密码管理入口。

## Completion Evidence

- 状态按钮、初始化/状态分支、二次确认、失败保持状态与密码显示切换均有组件回归测试。
- adapter 覆盖整体清除、内存 key 释放、幂等与存储失败场景。
- 前后端完整质量门通过，旧 manager token、list、reveal、delete、revoke API 已从运行时代码移除。
