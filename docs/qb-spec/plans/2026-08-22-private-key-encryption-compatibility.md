# Private Key Encryption Compatibility Plan

Status: Complete (2026-08-22)

## Background

凭证导入当前先以空口令调用通用解码器，只有收到 `KeyIsEncrypted` 才带用户口令重试。加密 PKCS#8 与 PPK 使用不同错误表示，导致已有底层能力无法到达并被误判为损坏或口令错误。

## Requirement

在不增加运行时依赖和外部工具的前提下，正确导入当前依赖支持的加密 OpenSSH、PKCS#8 与 PPK 私钥，并增加 ECDSA P-384/P-521 生成。

## Non-Goals

- 不启用 RSA/DSA/FIDO。
- 不兼容 DES/3DES/SHA-1 等弱格式。
- 不新增导出、转换或生成密钥口令。
- 不修改 vault/profile schema。

## Architecture Impact

私钥容器识别、解密分派和第三方错误归一继续由 `infrastructure/ssh/auth.rs` 所有；domain 仅表达稳定算法与认证失败；credential command 继续负责文件选择、受限读取和 DTO 映射；React 只扩展生成算法选项。

## Domain Model Impact

`GeneratedPrivateKeyAlgorithm` 增加 ECDSA P-384、P-521。既有 `PrivateKeyAlgorithm` 已包含对应导入/认证元数据，无持久化 schema 变化。

## API Impact

生成 DTO 的封闭枚举增加 `ecdsaP384`、`ecdsaP521`。既有字段、命令名和返回结构不变。

## Database Impact

无。私钥正文与可选导入口令继续作为现有 credential material 由 vault 加密保存。

## Implementation Tasks

1. 在 SSH infrastructure 先补失败回归测试，覆盖加密 PKCS#8、PPK 和现有 OpenSSH 口令路径。
2. 增加私钥容器识别与容器感知的解密分派，保持稳定安全错误。
3. 扩展 domain、command DTO、TypeScript 契约与 UI 的 P-384/P-521 生成选项。
4. 扩展生成 round-trip、DTO、IPC 和 UI 测试。
5. 更新长期决策与架构说明，记录支持边界和零外部工具规则。
6. 运行聚焦测试、Rust 全量质量检查和 `pnpm check`，检查依赖及敏感数据 diff。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 加密 OpenSSH 正确区分缺口令/错口令/成功 | `infrastructure::ssh::auth` 单元测试 |
| 加密 PKCS#8 正确口令可解析 | 内存生成 PKCS#8 fixture 的回归测试 |
| 加密 PPK 正确口令可解析 | PPK v3 Ed25519 fixture 回归测试 |
| 损坏和未支持算法继续拒绝 | 既有测试加聚焦失败测试 |
| P-384/P-521 可生成、解析和派生公钥 | Rust round-trip、DTO、IPC、RTL 测试 |
| 无新增依赖/工具/schema/秘密泄漏 | Cargo/diff 检查、clippy/test、`pnpm check` |

## Test Plan

- Rust：先运行 `cargo test infrastructure::ssh::auth --all-features`，再运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- Frontend：运行 CredentialDialog 与 credentials bridge 聚焦测试，最后运行 `pnpm check`。
- 静态检查：确认 `Cargo.toml`/lockfile 无依赖变化，私钥/口令不进入 DTO、日志或持久化摘要。

## Rollback Plan

回退容器分派、生成枚举和对应文档/测试即可；无数据迁移或 schema 回滚。新生成的 P-384/P-521 密钥仍是标准 OpenSSH 内容，即使 UI 回退也不会破坏 vault，但旧版本可能无法在 UI 中重新生成同类密钥。

## Risks

- 第三方格式错误类型不统一，必须避免把不支持的 KDF 永久误报为错误口令。
- PPK v3 Argon2 在解密前限制内存、轮次和并行度；PKCS#8 scrypt 参数仍由当前上游解码器验证，后续扩大真实 fixture 矩阵时需继续评估参数级资源上限。
- P-521 跨服务器兼容性弱于 Ed25519/P-256，因此 UI 不改变默认和推荐项。

## Documentation Updates

- 更新 `docs/qb-spec/context/DECISIONS.md` 与 `ARCHITECTURE_SPEC.md`。
- Task spec 与本计划记录本次范围；Directory Map 不需要更新。
