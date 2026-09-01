---
id: QB-20260819-connection-management-portable-vault
status: archived
archived: 2026-09-02
legacy: true
---
Status: implemented on 2026-08-19. Frontend full check, Rust fmt/Clippy/all-target tests pass; 1 existing OpenSSH-dependent integration test remains ignored by design.

## Background

连接管理需要固定高度、三种默认认证方式、受限 `.ssh` 私钥发现，以及基于主密码的可迁移本地密码保险库。密码管理每次打开必须重新验证主密码，并允许逐条查看原始密码。

## Requirement

- 固定连接管理外部高度，左右内容独立滚动。
- profile schema 支持 password/privateKey/sshAgent 并迁移 v1。
- 使用 Argon2id + AES-256-GCM 的独立 credential-vault JSON 保存密码。
- 左侧密码管理完成初始化、重新验证、逐条 reveal 与删除。
- 快速连接和连接管理支持保存/使用密码并显示风险提示。
- 用户主动扫描 `.ssh` 第一层，安全返回候选私钥元数据。

## Non-Goals

- 不实现主密码恢复/修改、云同步、明文批量导出、OpenSSH config 解析或 ssh-add。

## Architecture Impact

- 新增 domain credential 语义、credential vault port/application service、JSON crypto adapter 与 Tauri commands。
- 新增 SSH key discovery adapter；commands 只映射 DTO 和授权句柄。
- React 新增 master-password/password-manager 组件与窄 IPC client。

## Domain Model Impact

- `AuthPreference` 增加 `SshAgent`。
- credential id 绑定 profile id；vault 状态、错误和短期 manager authorization 使用稳定语义。

## API Impact

- 新增 vault status/initialize/unlock/lock/save/load/delete/manager authorize/reveal/revoke commands。
- 新增 `auth_scan_ssh_keys`。
- profile DTO 的 `authPreference` tagged value 增加 `sshAgent`。

## Database Impact

- profiles schema v1 自动读取并在写入时升级 v2；旧认证偏好不变。
- 新建独立 `credential-vault.json` schema v1；profiles 文件继续拒绝敏感字段。

## Implementation Tasks

1. 增加 crypto/profile migration/key discovery 失败测试。
2. 实现 vault domain/port/application/infrastructure 与 commands。
3. 实现 profile v2 与 SSH Agent 偏好。
4. 实现 `.ssh` discovery 和 selection registration。
5. 实现固定高度、风险提示、密码保存、密码管理与快速连接解锁 UI。
6. 更新长期上下文和 Directory Map。

## Acceptance To Verification

- 固定高度与内部滚动：RTL 结构测试、聚焦样式检查。
- 三种偏好与 v1 迁移：TS/Rust DTO、domain、persistence tests。
- vault 正常/错误密码/篡改/AAD/授权撤销：Rust crypto 与 command/service tests。
- 初始化/验证/reveal/删除/清理：RTL dialog tests。
- `.ssh` 扫描边界：临时目录 Rust tests 与 DTO tests。
- 完整性：`pnpm check`、Rust fmt/clippy/test。

## Test Plan

- 先运行新增 focused tests 确认失败，再逐层实现。
- 前端全部 Vitest；Rust unit/integration fixture；最后完整门禁。
- 实机主密码 UI 与系统 home `.ssh` 只做手工检查，不读取真实用户私钥内容。

## Rollback Plan

- 移除 vault/key-discovery commands 与 UI；profile reader 保留 v2 向后兼容或恢复只读 v1；删除 credential-vault 文件不影响 profiles/workspaces。

## Risks

- 主密码弱会导致离线猜测；使用 memory-hard KDF 并明确提示。
- GCM nonce 重用会破坏安全；每次写入使用 OS CSPRNG 并测试记录唯一性。
- 明文 reveal 会进入 WebView 内存；只返回单条、默认掩码、关闭/失焦清理并撤销授权。
- `.ssh` 包含特殊文件与 symlink；只处理 bounded regular files，不递归或跟随链接。

## Documentation Updates

- 更新 ARCHITECTURE_SPEC、DECISIONS、DIRECTORY_MAP 和任务规格实施状态。
