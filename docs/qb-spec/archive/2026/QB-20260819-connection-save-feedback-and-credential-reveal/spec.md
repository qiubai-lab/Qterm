---
id: QB-20260819-connection-save-feedback-and-credential-reveal
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让连接配置保存与凭证查看各自归属清晰：连接管理只编辑凭证引用，凭证管理负责显式查看密码；重复保存连接时不打断用户当前编辑位置。

## Scope

- 从连接管理认证页移除已保存密码查看组件与解锁查看流程。
- 在凭证管理的密码凭证详情中提供显式显示/隐藏密码操作。
- 保存连接配置后保持当前连接编辑 Tab。
- 保存按钮显示“保存中…”与“保存成功”的就地状态，成功后自动恢复“保存配置”。
- 页面内部不再显示“连接配置已保存”，保存失败仍保留可读错误反馈。

## Constraints

- 密码必须继续通过现有窄 IPC 按单条凭证读取，不扩大秘密读取接口。
- 私钥凭证不提供正文查看。
- 复用现有 Qterm 按钮、密码可见性图标、色彩与 reduced-motion 规则，不引入依赖。

## Non-Goals

- 不修改凭证库格式、Rust 领域模型或 profile schema。
- 不改变连接选择、删除、分组与凭证引用保存行为。
- 不重做凭证创建和导入流程。

## Acceptance

1. 连接管理的认证方式页不再出现“已保存密码”或显示密码按钮。
2. 密码凭证详情提供默认掩码、显式显示和隐藏；私钥详情不提供密码查看。
3. 在“认证方式”Tab 保存后，该 Tab 仍保持选中。
4. 保存期间按钮禁用并显示“保存中…”，成功后显示“保存成功”，随后恢复“保存配置”。
5. “连接配置已保存”不再出现在编辑页面内部；保存失败仍在页面内提示。

## Acceptance To Verification

- 1、3、4、5：`ConnectionDialog.test.tsx` 的 Testing Library 回归测试。
- 2：`CredentialDialog.test.tsx` 验证单条 reveal、隐藏清理和私钥隔离。
- 4：`appStyles.test.ts` 检查保存状态动画及 reduced-motion 契约。
- 全部：运行前端 focused tests 与 `pnpm check`。

## Open Questions

无。

## Recommended Approach

采用组件局部状态方案：连接保存按钮维护 idle/saving/success 三态；profile 同 ID 刷新只同步字段而不重置 Tab；密码 reveal 状态归 CredentialDialog 所有并在隐藏或切换条目时清空。另一方案是引入全局 toast/保存状态，但会扩大状态边界且不符合反馈应锚定保存按钮的目标。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要，现有凭证安全边界已覆盖此决策。
- Directory Map：不需要，没有目录或模块职责变化。
