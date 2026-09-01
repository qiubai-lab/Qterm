---
id: QB-20260822-rsa-private-key-risk-exception
status: archived
archived: 2026-09-02
legacy: true
---
# RSA Private Key Risk Exception Plan

Status: Complete (2026-08-22)

## Background

Qterm 当前编译时关闭 RSA，因为 `russh 0.62.6` 的 RSA feature 固定依赖受 RUSTSEC-2023-0071 影响且尚无修复版本的 `rsa 0.10.0-rc.18`。用户明确接受这一风险例外，并要求 RSA 凭证持续显示“不安全”标签。

## Requirement

在保留私钥安全边界、不使用外部工具且禁止 SHA-1 降级的前提下，支持 RSA 私钥导入、派生公钥和 SSH 认证，并在凭证管理器中明确标记风险。

## Non-Goals

- 不生成 RSA 私钥。
- 不支持 SHA-1 `ssh-rsa` 签名降级。
- 不增加 vault/profile schema。
- 不扩展 DSA、FIDO/U2F 或弱私钥加密算法。

## Architecture Impact

`domain/auth.rs` 表达稳定 RSA 算法；`infrastructure/ssh/auth.rs` 负责解析、签名算法协商和第三方风险边界；credential command 只映射摘要名称；React 只根据摘要元数据渲染风险标签。现有层次与依赖方向不变。

## Domain Model Impact

`PrivateKeyAlgorithm` 增加 `Rsa`。这是运行时算法元数据，不改变生成算法枚举，也不改变持久化结构。

## API Impact

无字段或命令变化。既有 `CredentialSummary.detail` 对 RSA 返回 `rsa`，属于现有字符串元数据值扩展。

## Database Impact

无 schema 变化。新导入 RSA 凭证沿用现有私钥正文、可选口令与算法摘要存储。

## Implementation Tasks

1. 先增加失败测试：RSA OpenSSH 解析/公钥派生、RSA hash 策略、command 算法标签、CredentialDialog 风险标签。
2. 启用 `russh` RSA feature并更新 lockfile。
3. 扩展 domain RSA 算法映射与 credential summary 名称。
4. 在私钥认证路径复用 RSA-SHA2 协商，明确拒绝服务端仅支持 SHA-1。
5. 在凭证列表和详情标题增加紧凑警示标签，并通过不受列表裁剪的浮层解释风险，不影响长名称截断。
6. 更新长期决策、安全模型、架构说明和排障文档。
7. 运行聚焦测试与全量质量闸口，确认依赖树和无外部工具调用。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| RSA 私钥可解析并记录 `rsa` | Rust RSA fixture round-trip 与映射测试 |
| RSA 公钥和指纹可派生 | `LoadedPrivateKey` 公钥/指纹断言 |
| RSA 只使用 SHA-2 | RSA hash 决策单元测试；私钥认证代码检查 |
| RSA 名称带“不安全”标签 | CredentialDialog 列表/详情行为测试与 CSS 断言 |
| 风险例外明确记录 | Cargo/docs/context diff 检查 |
| 既有能力不回归 | Rust 全量测试和 `pnpm check` |

## Test Plan

- Rust 聚焦：`cargo test infrastructure::ssh::auth --all-features` 与 credential command tests。
- Frontend 聚焦：`pnpm vitest run src/components/dialogs/CredentialDialog.test.tsx src/app/appStyles.test.ts`。
- Rust 全量：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- Frontend 全量：`pnpm check`。
- 依赖检查：`cargo tree -e features -i rsa`，确认 RSA 仅由明确启用的 `russh/rsa` 路径引入。

## Rollback Plan

移除 `russh/rsa` feature、`PrivateKeyAlgorithm::Rsa`、认证协商和 UI 标签，并恢复 RSA unsupported 行为。无 schema 迁移；已保存的 RSA 凭证在回滚版本中会重新返回 unsupported-key，但 vault 数据不会损坏。

## Risks

- 已知且接受：RUSTSEC-2023-0071 可能通过网络可观察的签名时序泄漏 RSA 私钥。
- RSA 摘要值是既有开放字符串，旧版本会展示 `rsa` 但无法使用该凭证。
- 服务端未发布 `server-sig-algs` 时默认尝试 RSA-SHA2-512，极旧服务器可能认证失败；这是禁止 SHA-1 降级的预期结果。

## Documentation Updates

- 更新 `docs/qb-spec/context/DECISIONS.md`、`ARCHITECTURE_SPEC.md`。
- 更新 `docs/security-model.md` 与 `docs/troubleshooting.md`。
- Directory Map 不需要更新。
