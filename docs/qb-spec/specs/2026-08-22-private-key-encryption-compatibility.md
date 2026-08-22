# Private Key Encryption Compatibility

Status: Complete (2026-08-22)

## Goal

让凭证管理能够正确识别并导入现有依赖已经支持的加密 OpenSSH、PKCS#8 和 PuTTY PPK 私钥，并扩展安全可用的 ECDSA 私钥生成类型。

## Scope

- 按私钥容器格式派发解码，避免只依赖 `KeyIsEncrypted` 决定是否带口令重试。
- 支持当前 Rust 依赖能够解密的 OpenSSH、加密 PKCS#8 与 PuTTY PPK v2/v3 私钥。
- 保持 Ed25519 与 ECDSA P-256 导入和生成行为，并新增 ECDSA P-384、P-521 生成。
- 为正确口令、缺少口令、错误口令、损坏文件和不支持算法增加回归保护。
- 更新长期私钥兼容性决策和用户可见能力说明。

## Constraints

- 不新增运行时三方依赖，不在产品运行时调用 `ssh-keygen`、OpenSSL、PuTTYgen 或 shell。
- 私钥正文、口令和解密结果只存在于 Rust Core 的 zeroizing/secret 边界，不进入 WebView、日志或错误文本。
- RSA 继续关闭；不得为兼容导入重新启用受 RUSTSEC-2023-0071 影响的依赖。
- 生成密钥继续以未设置 key-level passphrase 的 OpenSSH 内容保存到 Argon2id + AES-256-GCM vault。
- 文件大小上限与凭证 vault schema 保持不变。
- PPK v3 的 Argon2 内存、轮次和并行度必须在解密前受限，避免异常参数造成无界资源消耗。

## Non-Goals

- 不支持 RSA、DSA、FIDO/U2F 私钥生成或导入认证。
- 不生成 DES、3DES、SHA-1、传统 PEM 或 PPK 格式私钥。
- 不新增私钥导出、格式转换或 key-level passphrase 管理。
- 不改变 SSH Agent 行为、profile schema 或 vault 加密格式。

## Acceptance

1. 加密 OpenSSH 私钥在缺少口令时提示需要口令，正确口令可导入，错误口令被拒绝。
2. 加密 PKCS#8 私钥不再因无口令探测失败而被误判为损坏；正确口令可导入。
3. 加密 PuTTY PPK v2/v3 私钥使用正确口令可导入；无口令和错误口令保持稳定失败且不泄漏内容。
4. 未加密 Ed25519/ECDSA 私钥继续可解析，损坏文件和未支持算法继续被拒绝。
5. 用户可以生成并保存 ECDSA P-384、P-521 私钥，摘要算法和派生公钥正确。
6. 实现不新增依赖，不调用外部工具，私钥安全边界和现有 vault schema 不变。

## Acceptance To Verification

- 1–4：Rust SSH infrastructure 单元测试使用确定性/内存 fixture 覆盖容器、口令和错误路径。
- 5：Rust 生成 round-trip、DTO 反序列化、TypeScript IPC 与 CredentialDialog 行为测试。
- 6：检查 Cargo 依赖 diff、敏感字段流向和最终代码 diff；运行 Rust fmt/clippy/test 与 `pnpm check`。

## Open Questions

- 无。传统弱加密格式与私钥导出保留为独立后续任务。

## Recommended Approach

采用容器感知的解码分派：通过稳定的 PEM/PPK 标记识别 OpenSSH、PKCS#8、SEC1 与 PPK，只有加密容器才要求并传入口令，再复用 `russh` 当前公开解码能力。相比无口令试探或调用本地命令，此方案修复现有误判、保持跨平台和 Rust-only 安全边界，也不引入第二套 SSH 实现。

## Next Skills

- `writing-qb-plans`：使用 Strict 计划覆盖认证与敏感材料解析风险。
- `checking-architecture-boundaries`：格式识别和解码留在 SSH infrastructure，command 只编排。
- `protecting-critical-behavior`：先补加密容器回归测试。
- `maintaining-project-context`：更新长期私钥兼容性与生成算法决策。
- `verifying-before-completion`：执行聚焦与全量质量闸口。
- Directory Map: not needed；不改变目录或模块职责。
