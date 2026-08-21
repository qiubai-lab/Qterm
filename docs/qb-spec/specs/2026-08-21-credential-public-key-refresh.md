# Credential Public Key Refresh

## Goal

私钥凭证详情允许用户在不更换私钥、不修改服务器授权关系的前提下，手动重新派生 OpenSSH 公钥。

## Scope

- 在 OpenSSH 公钥标题区的复制按钮前增加持久可见的刷新图标按钮。
- 刷新操作复用现有公钥派生请求和错误反馈。
- 派生期间显示忙碌状态，并禁用刷新与复制操作。

## Constraints

- 公钥必须继续由 Rust 后端从已加密保存的私钥派生；私钥正文不得进入 WebView。
- 不新增 IPC、持久化字段、密钥生成算法或依赖。
- 图标按钮保持 Qterm 现有紧凑暗色工作台样式，并提供可访问名称。

## Non-Goals

- 不生成或轮换新的私钥/公钥对。
- 不修改服务器 `authorized_keys`。
- 不改变选中私钥时自动派生公钥的现有行为。

## Acceptance

1. 私钥详情的公钥标题区按“刷新、复制”的顺序显示两个图标按钮。
2. 点击刷新会为当前凭证再次请求公钥，并用返回值更新公钥文本。
3. 请求期间刷新和复制按钮均禁用，公钥区域暴露忙碌状态；完成后恢复操作。
4. 请求失败时沿用现有凭证项错误反馈，并允许再次刷新重试。
5. 密码凭证不显示公钥刷新操作，现有自动派生和复制行为保持可用。

## Acceptance To Verification

- 1、2、3、5：CredentialDialog Testing Library 测试覆盖按钮顺序、重复调用、忙碌状态与完成恢复。
- 1：样式测试覆盖紧凑操作组及 25px 图标按钮尺寸。
- 4：复用现有 `generatePublicKey` 错误路径，并通过组件测试确认刷新入口在失败后恢复可用。
- 最终运行相关 Vitest 与 `pnpm check`。

## Open Questions

无。

## Recommended Approach

推荐在 `CredentialDialog` 的公钥标题中增加操作组，让刷新按钮直接调用现有 `generatePublicKey(view.item)`。相比新增“强制生成”IPC，此方案不扩大安全边界、没有数据迁移，并准确表达从同一私钥重新派生确定性公钥的语义。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要，本次不改变长期产品或架构约束。
- Directory Map：不需要，本次不改变目录或模块职责。
