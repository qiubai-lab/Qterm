---
id: QB-20260819-connection-save-feedback-and-credential-reveal
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

实现 `docs/qb-spec/archive/2026/QB-20260819-connection-save-feedback-and-credential-reveal/spec.md` 的全部验收条件。

## Scope

连接管理移除密码 reveal 并保持保存时的当前 Tab；凭证管理增加单条密码 reveal；保存成功反馈改为按钮内短暂状态。错误提示、私钥安全边界和既有 CRUD 行为保持不变。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/components/dialogs/CredentialDialog.tsx`
- `src/components/dialogs/CredentialDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

- `ConnectionDialog` 使用 `idle | saving | success` 保存状态和短生命周期 timer；保存失败回到 idle 并沿用 inline error。
- 同一 profile ID 因 refresh 被重新同步时保留 editor Tab；用户真正切换到另一个 profile 时仍回到连接信息。
- `CredentialDialog` 只对 password detail 调用现有 `revealCredentialPassword(id)`；隐藏、切换条目、创建或删除时清空前端明文。
- 保存按钮用状态类实现 spinner/check 反馈，reduced-motion 下停用旋转动画。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 连接页无密码查看 | ConnectionDialog 查询不存在对应 label/button，并确认 reveal IPC 未调用 |
| 凭证详情查看/隐藏 | CredentialDialog 测试 password reveal、隐藏后清空、private key 无入口 |
| 保存保留认证 Tab | ConnectionDialog 在认证 Tab 保存后断言 aria-selected |
| 按钮保存状态 | 延迟 promise 验证 saving/disabled，完成后验证 success，fake timer 验证恢复 |
| 页面无成功文案、失败可见 | ConnectionDialog 分别验证成功与 reject 路径 |

## Test / Verification

1. `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/components/dialogs/CredentialDialog.test.tsx src/app/appStyles.test.ts`
2. `pnpm check`

## Documentation Updates

新增本 task spec 与 Standard plan；无需更新长期 context 或 Directory Map。
