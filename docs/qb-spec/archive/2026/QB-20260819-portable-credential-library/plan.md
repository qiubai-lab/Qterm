---
id: QB-20260819-portable-credential-library
status: archived
archived: 2026-09-02
legacy: true
---
# Portable Credential Library — Strict Plan

## Background

现有 vault 按 profile ID 保存密码，profile 仍保存本机私钥路径，连接时前端会读取密码并构造认证请求。新设计需要可复用凭证实体、Rust-only 私钥材料、跨设备 profile schema 和独立凭证管理 UI。

## Requirement

- 实现规格 `docs/qb-spec/archive/2026/QB-20260819-portable-credential-library/spec.md` 的全部 acceptance。

## Architecture Impact

- `domain/credential` 定义 credential ID/kind/summary/material；`CredentialVault` port 负责加密实体生命周期。
- credential application service 生成 ID、验证名称并编排 vault。
- profile domain 只持有可空 credential reference；repository 原子维护引用清理。
- session command 接受 stored credential 引用并在 Rust 内解析为 `AuthRequest`。
- React credential dialog 只经窄 IPC 管理元数据与单条密码 reveal。

## API Impact

- 增加 credential list/create-password/import-private-key/delete/reveal commands。
- session auth 增加 `storedCredential` variant。
- profile DTO 用 `credentialId` 替代 `privateKeyPath`。

## Database Impact

- profiles v4：移除 `privateKeyPath`，增加 `credentialId`。
- vault v2：envelope encryption、通用 credential records；兼容迁移 v1 密码记录。
- 默认 portable root 为 `~/.qterm`。

## Implementation Tasks

1. 先添加 credential domain、vault round-trip/tamper/migration、profile v4/ref cleanup 和 stored-session-auth 失败测试。
2. 实现 credential domain/port/service 及 envelope JSON vault。
3. 实现 profile reference、v4 migration 和引用清理。
4. 实现 Rust-only 私钥导入、credential commands 和 SSH byte-material 认证。
5. 实现前端 IPC、凭证管理弹窗、右侧入口和连接 credential selector。
6. 更新旧连接保存/显示/自动连接逻辑及对应测试。
7. 更新长期架构、决策和 Directory Map。

## Test Plan

- 每层先运行新增 focused test 确认失败，再实现到通过。
- vault 测试必须确认 JSON 不包含主密码、密码、私钥或口令，并覆盖错误密码、密文调换和旧 schema。
- profile 测试覆盖旧路径丢弃、密码引用迁移、共享引用与删除解除。
- UI 测试覆盖初始化/解锁、两种新增、选择引用、删除确认和锁定状态。
- 最后执行前后端完整门禁；无需发行包构建。

## Rollback Plan

- 保留 v1/v3 reader；若 UI 回滚，v4 profile 和 v2 vault 仍由后端读取。不得用回滚覆盖用户新 vault。

## Risks

- 跨文件删除无法原子提交：采用先解除引用、后删除密文的安全顺序。
- 私钥解密产生内存副本：使用 zeroizing buffer，限定生命周期；russh 内部副本残留作为已知风险。
- 同步工具并发覆盖：本阶段依赖原子单文件写入，不承诺自动冲突合并。
- `~/.qterm` 旧目录或权限异常：返回稳定 storage unavailable 错误，不回退写入不透明路径。

## Documentation Updates

- 更新 `ARCHITECTURE_SPEC.md`、`DECISIONS.md`、`PRODUCT_SPEC.md` 与 `DIRECTORY_MAP.md`。
