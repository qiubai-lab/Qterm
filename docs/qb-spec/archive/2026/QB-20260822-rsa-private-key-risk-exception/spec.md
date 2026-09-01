---
id: QB-20260822-rsa-private-key-risk-exception
status: archived
archived: 2026-09-02
legacy: true
---
# RSA Private Key Risk Exception

Status: Complete (2026-08-22)

## Goal

让 Qterm 能够导入、识别并使用 OpenSSH RSA 私钥认证，同时明确呈现其依赖的未修复时序侧信道风险。

## Scope

- 启用 `russh 0.62.6` 的 `rsa` feature，接受其固定的 `rsa 0.10.0-rc.18` 传递依赖。
- 导入并派生 OpenSSH RSA 私钥的公钥与指纹。
- RSA 私钥认证只使用 RSA-SHA2-512/256；服务端仅支持 SHA-1 `ssh-rsa` 时拒绝认证。
- 凭证管理列表和详情标题中的 RSA 凭证名称后显示紧凑的“不安全”标签。
- 更新安全模型、排障说明和长期决策，记录 RUSTSEC-2023-0071 风险例外。

## Constraints

- 用户已明确接受 RUSTSEC-2023-0071 风险例外；该风险必须持续可见且不得被静默移除。
- 不调用本地 `ssh-keygen`、OpenSSL、shell 或其他外部工具完成运行时解析和认证。
- 私钥正文、口令和解密结果继续限定在 Rust Core secret/zeroizing 边界。
- RSA 标签只由稳定算法元数据 `detail == "rsa"` 驱动，不解析凭证名称或公钥字符串。

## Non-Goals

- 不提供 RSA 私钥生成。
- 不启用 DSA、FIDO/U2F 或 3DES。
- 不自动回退到 SHA-1 `ssh-rsa` 签名。
- 不修改 vault/profile schema。
- 不引入新的 UI 库或通用标签组件。

## Acceptance

1. OpenSSH RSA 私钥能够通过凭证导入校验，并保存算法元数据 `rsa`。
2. RSA 私钥可以派生标准 `ssh-rsa` 公钥和 SHA-256 指纹。
3. RSA 认证优先使用服务端支持的 RSA-SHA2-512/256；服务端只支持 SHA-1 时返回不支持，不发生 SHA-1 签名。
4. RSA 凭证在管理器列表与详情标题的名称后显示可读的“不安全”标签，悬停或键盘聚焦时说明未修复的时序侧信道风险并建议替代算法；其他凭证不显示。
5. 构建依赖、安全模型和长期决策明确记录未修复公告与用户接受的例外。
6. 既有 Ed25519、ECDSA、加密容器导入和凭证 UI 行为不回归。

## Acceptance To Verification

- 1–3：Rust SSH infrastructure 单元测试覆盖 RSA 解析、元数据、公钥派生和 RSA hash 决策。
- 4：CredentialDialog Testing Library 测试与样式断言覆盖列表、详情及非 RSA 凭证。
- 5：检查 Cargo feature/lockfile、task docs、security model、troubleshooting 和长期 decisions diff。
- 6：运行 Rust fmt/clippy/all-target tests 与 `pnpm check`。

## Open Questions

- 无。风险例外、SHA-1 禁止策略与 UI 标记范围均已由用户确认。

## Recommended Approach

在现有 `russh` 依赖上启用 RSA feature，复用 SSH infrastructure 的统一私钥解析器；domain 增加稳定 `Rsa` 算法值；认证前调用服务端 RSA hash 协商并复用现有 SSH Agent 的安全降级策略。UI 仅根据凭证摘要算法元数据显示警示标签，避免引入新的 IPC 或持久化字段。

## Next Skills

- `writing-qb-plans`：Strict 计划。
- `checking-architecture-boundaries`：保持算法、安全策略和 UI 展示职责分离。
- `protecting-critical-behavior`：先补 RSA 解析、SHA-1 禁止与 UI 标签回归测试。
- `qterm-interface-design`：实现紧凑且非纯颜色表达的警示标签。
- `maintaining-project-context`：记录安全例外和恢复禁用的条件。
- `verifying-before-completion`：执行全量质量闸口。
- Directory Map: not needed；不改变目录、模块或入口职责。
