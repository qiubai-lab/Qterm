# 密码保险库状态与重置 Task Spec

Status: Complete (2026-08-19)。

## Goal

用户可从连接管理标题栏明确感知密码保险库状态，在连接表单内按需查看当前输入的密码，并能安全重置保险库及其全部已保存密码。

## Scope

- 标题栏按钮只显示“未初始化”或“已初始化”状态。
- 未初始化时点击状态按钮打开主密码初始化框。
- 已初始化时点击状态按钮打开只读状态信息，并提供“清除主密钥”。
- 清除操作必须二次确认；成功后删除保险库文件、全部已保存密码和内存派生密钥。
- 移除原密码管理弹窗及其逐条列出、解密、删除凭据的授权链路。
- 连接表单密码输入框增加显示/隐藏按钮，明文只存在于现有临时 React state。

## Constraints

- 主密码和派生密钥仍不得持久化、序列化或记录日志。
- “清除主密钥”不删除连接 profile、分组或 Workspace，只删除独立保险库。
- 清除后任何旧凭据必须不可再读取，状态为 `initialized=false/unlocked=false`。
- 保存密码仍需用户明确勾选；私钥口令不增加显示或持久化能力。

## Non-Goals

- 不实现主密码修改、保险库导入导出、恢复、单条密码管理或系统钥匙串迁移。

## Acceptance

1. 标题栏按钮可见文字仅表达当前保险库状态，不再显示“密码管理”。
2. 未初始化点击进入初始化；已初始化点击显示状态信息而不要求解密凭据。
3. 清除操作有明确的不可恢复警告和二次确认，成功后保险库文件、全部密文与运行时密钥同时消失。
4. 清除失败时保持原保险库和 UI 状态，并展示稳定错误。
5. 密码输入框可在 password/text 之间切换，按钮可访问名称同步为“显示密码/隐藏密码”。
6. 旧密码管理弹窗、manager token 和明文逐条 reveal IPC 不再存在。

## Acceptance To Verification

- 1、2、5、6：ConnectionDialog/MasterPasswordDialog/前端 IPC 单元测试。
- 3、4：Rust vault adapter 回归测试、command/service wiring 测试与前端确认流程测试。
- 6：源码引用检查及前后端全量构建。
- 全量：`pnpm check` 和 Rust fmt/clippy/test。

## Open Questions

无。采用二次确认但不额外要求主密码；本地持有者本就可删除保险库文件，重复验证不会增加实质安全性，只增加恢复摩擦。

## Recommended Approach

方案 A 是保留 manager token 后端但隐藏弹窗，改动较少却留下无 UI 使用者的明文 reveal 攻击面。方案 B 是完整移除 manager 链路并新增单一 clear use case，改动更广但边界更小、语义更准确；采用方案 B。

## Next Skills

- `writing-qb-plans`（Strict：安全敏感凭据生命周期与公共 IPC 变更）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `maintaining-project-context`
- `verifying-before-completion`
- `updating-directory-map`（移除旧密码管理弹窗后同步关键 UI 入口）

## Verification Evidence

- `pnpm check`：通过；23 个前端测试文件、95 项测试全部成功，TypeScript 与 Vite 生产构建成功。
- `cargo fmt --check`：通过。
- `cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test --all-targets --all-features`：通过；77 项成功、0 项失败、1 项环境集成测试按既有约定忽略。
- `git diff --check` 与旧 manager/reveal API 源码残留检查：通过。
