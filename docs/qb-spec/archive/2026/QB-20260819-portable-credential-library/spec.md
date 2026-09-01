---
id: QB-20260819-portable-credential-library
status: archived
archived: 2026-09-02
legacy: true
---
# Portable Credential Library

Status: implemented on 2026-08-19. Frontend check and Rust fmt/Clippy/all-target tests pass; one existing OpenSSH-dependent integration test remains ignored by design.

## Goal

将连接认证改为可跨 Windows/macOS 迁移的独立凭证库：连接只引用凭证 ID，密码与私钥正文统一加密保存；应用每次启动保持锁定，用户解锁后才能使用需要凭证的连接。右侧工具栏提供独立“凭证管理”弹窗，用于新增、查看元数据和删除密码/私钥凭证。

## Scope

- 右侧工具栏新增“凭证管理”，与连接管理、设置和帮助平级。
- 凭证管理支持创建密码凭证、通过系统选择器导入私钥及可选口令、删除凭证。
- 已导入私钥在用户打开其详情时自动派生 OpenSSH 公钥并提供图标复制，用于配置服务器 `authorized_keys`；私钥正文仍不返回前端。
- 连接配置的密码/私钥认证改为引用一个可复用 `credentialId`；多个连接可以引用同一凭证。
- SSH Agent 不引用凭证库。
- 私钥文件只在 Rust 中读取，前端只获得名称、类型和算法等元数据。
- vault 每次进程启动均为锁定状态；初始化或解锁成功后仅在当前进程内复用解密密钥。
- 删除被引用凭证需要二次确认；删除后保留连接并清空对应引用。
- profile schema 从 v3 升级到 v4；旧密码记录沿用 profile ID 作为迁移凭证 ID，旧私钥路径不再持久化并在升级后要求重新导入。
- 默认可迁移数据目录为当前用户 `~/.qterm`，保存连接目录和加密凭证；known-hosts 与 workspace 继续留在设备本地应用数据目录。

## Constraints

- 主密码、派生密钥、vault data key、明文私钥和私钥口令不得序列化、记录日志或通过普通查询 IPC 返回。
- 主密码使用 Argon2id（64 MiB、3 passes、4 lanes）派生 KEK；随机 256-bit data key 使用 KEK 包装，凭证分别用 data key 与 AES-256-GCM 加密。
- 每个加密对象使用独立 96-bit nonce；AAD 绑定 schema、credential ID、credential kind 与字段名。
- 凭证名称必填、长度有界；ID 为后端生成 UUID；私钥文件最大 1 MiB。
- 连接执行通过 `credentialId` 让后端解析认证材料；私钥正文不经过 WebView。
- 凭证名称、类型与算法属于可在锁定状态读取的非敏感摘要，以便连接配置持续显示关联对象；密码、私钥正文和口令仍只允许在解锁后按用途读取。密码仅允许在连接编辑器中对当前引用凭证做显式单条查看；凭证管理列表不批量返回明文。
- 清除主密钥会删除完整 vault 并解除全部 profile 凭证引用，但不删除连接。

## Non-Goals

- 不实现多级凭证分组、云服务 API、冲突合并、主密码找回或明文导出。
- 不自动复制旧路径指向的私钥；升级后由用户显式重新导入。
- 不管理 SSH Agent 中的密钥。

## Acceptance

1. 右侧始终显示“凭证管理”按钮；点击后按 vault 状态进入初始化、解锁或独立管理弹窗。
2. 用户可新增密码凭证和私钥凭证；列表只显示安全元数据，文件正文不进入前端。
3. 连接的密码/私钥认证均可选择凭证；保存后 profile 只持有 `credentialId`，不含路径或敏感字段。
4. 已引用凭证可供多个连接使用；配置连接由后端直接解密并认证。
5. 应用重新启动后 vault 为锁定；未解锁时需要凭证的连接不会尝试提交秘密并提示解锁。
6. vault 锁定时，已关联连接仍显示凭证名称而不暴露秘密；用户尝试更改关联时先要求解锁，取消或解锁失败不修改连接草稿。
6. 删除凭证需二次确认，完成后所有引用该凭证的连接保留且变为未选择凭证。
7. 清空 vault 同时清除全部引用；失败时不得伪报成功。
8. v3 profile 与 v1 vault 可读取并安全迁移；旧私钥路径不会写入 v4。
9. `~/.qterm` 默认只承载可迁移的连接与 vault；设备状态不混入该目录。
10. 用户点击私钥凭证后无需额外操作即可查看并复制标准 OpenSSH 公钥；公钥区域填满详情剩余高度，长内容只在字段内部滚动。

## Acceptance To Verification

- 1、2、3、6：RTL 测试凭证弹窗、选择器、确认删除与工具栏入口。
- 3、4、5：command/application 测试和 session request 测试，确认 stored credential 只在 Rust 解析。
- 6、7、8：profile repository/vault migration 与引用清理回归测试。
- 2、4：Rust 私钥 fixture 验证加密落盘、解密认证材料和前端 DTO 不含正文。
- 9：composition-root/path 单元检查和手工桌面验证。
- 10：Rust SSH key fixture、窄化 IPC bridge、CredentialDialog 生成/复制行为测试与布局样式断言。
- 完整门禁：`pnpm check`，`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Open Questions

- 无。删除凭证采用安全默认：先解除 profile 引用再删除密文；若第二步失败，留下不可引用的孤立密文，避免产生指向已删除秘密的连接。
