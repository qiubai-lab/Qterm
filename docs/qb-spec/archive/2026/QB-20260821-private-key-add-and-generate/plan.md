---
id: QB-20260821-private-key-add-and-generate
status: archived
archived: 2026-09-02
legacy: true
---
# Private Key Add And Generate Plan

## Background

现有凭证管理在私钥创建页内直接收集名称和口令，并通过底部按钮打开系统文件选择器。产品需要把“导入已有私钥”和“生成新私钥”提升为两个等权入口，同时继续禁止私钥正文进入 WebView。

## Requirement

交付 `docs/qb-spec/archive/2026/QB-20260821-private-key-add-and-generate/spec.md` 的全部 acceptance，支持本地文件导入、Rust 内 Ed25519/ECDSA P-256 生成、加密入库和成功后的公钥展示。

## Non-Goals

- 不粘贴、回显或导出私钥正文。
- 不支持 RSA、P-384、P-521。
- 不修改 vault schema 或重构无关凭证生命周期。

## Architecture Impact

- React 只拥有入口选择、名称、口令、算法和注释等 UI state。
- Command 只定义严格 DTO、映射算法、调用现有 lifecycle 与稳定错误映射。
- Domain 定义可生成算法白名单与注释约束，不依赖 Tauri/russh。
- SSH infrastructure 使用 CSPRNG 生成并编码 OpenSSH 私钥，返回 zeroizing 字节缓冲；第三方类型不越界。
- Persistence 继续使用现有 `save_private_key`，不改变 schema。

## Domain Model Impact

新增 `GeneratedPrivateKeyAlgorithm`（Ed25519、EcdsaP256）和有界注释值；不改变 `CredentialMaterial` 或持久化模型。

## API Impact

新增 `credential_generate_private_key({ name, algorithm, comment }) -> CredentialSummary`。参数不包含私钥正文、路径、seed、bits 或任意算法名称。

## Database Impact

无 schema 或迁移。生成结果作为现有 private-key credential 写入。

## Implementation Tasks

1. 先增加前端 IPC/RTL 与 Rust domain/infrastructure/command 失败测试。
2. 在 domain 收口生成算法与注释校验，在 SSH infrastructure 实现 CSPRNG 和 OpenSSH 编码。
3. 复用现有私钥解析/保存路径实现 command，并注册组合根和前端 IPC。
4. 将私钥创建 stage 改为两个全宽等高入口，增加本地导入与生成嵌套弹窗及全部 busy/error/cancel/lock 状态。
5. 更新样式断言和长期架构、安全模型、决策文档。
6. 运行聚焦及完整前后端质量门禁。

## Acceptance To Verification

- A1：RTL DOM 顺序/旧按钮移除 + appStyles 等宽等高断言。
- A2：RTL 文件导入成功/取消/禁用断言及既有 command 测试。
- A3：RTL 默认算法、切换、注释边界与生成表单断言。
- A4：TypeScript invoke shape + Rust serde unknown/unsupported algorithm tests。
- A5：Rust 两算法随机差异、OpenSSH round trip 和 vault load tests。
- A6：RTL 成功选中/失败保留状态及既有公钥派生测试。
- A7：RTL 锁定/取消清理，代码审查确认没有私钥返回 DTO。

## Test Plan

- `pnpm vitest run src/components/dialogs/CredentialDialog.test.tsx src/lib/tauri/credentials.test.ts src/app/appStyles.test.ts`
- `cargo test credential --all-features`
- `cargo test auth --all-features`
- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

## Rollback Plan

移除生成 command、前端入口和新增规则即可恢复旧 UI。已经生成的记录仍是现有 schema 的普通私钥凭证，回滚版本可以继续解密、认证和派生公钥。

## Risks

- CSPRNG/序列化错误不得泄漏密钥或底层上下文，需稳定错误映射。
- 嵌套弹窗若未加入父 manager 的 blocked 状态，可能造成父层提前关闭或焦点错误。
- 生成密钥没有独立导出能力；界面必须说明它只保存在加密凭证库中，并通过公钥部署到服务器。
- RSA 仍因依赖安全公告保持禁用，UI 不得暗示支持。

## Documentation Updates

更新 `docs/qb-spec/context/ARCHITECTURE_SPEC.md`、`docs/qb-spec/context/DECISIONS.md`、`docs/security-model.md`。若只扩展现有 credential/SSH 文件职责，不更新 Directory Map。
