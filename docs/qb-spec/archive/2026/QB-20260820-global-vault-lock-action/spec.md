---
id: QB-20260820-global-vault-lock-action
status: archived
archived: 2026-09-02
legacy: true
---
# 主界面凭证库锁定入口 Task Spec

Status: Superseded by `docs/qb-spec/archive/2026/QB-20260820-terminal-session-lock/spec.md` (2026-08-20)。

## Goal

将“锁定凭证库”从凭证管理弹窗标题栏迁移到主界面右侧工具栏，并放在“系统设置”上方，让用户无需打开管理弹窗即可立即锁定已解锁的凭证库。

## Scope

- 凭证库已解锁时，主界面工具栏显示可用的“锁定凭证库”操作。
- 入口位于工具栏底部分组的“系统设置”正上方。
- 未初始化、已锁定、正在锁定时操作不可用，并以可访问状态说明原因。
- 后端锁定/解锁事件同步更新主界面入口状态。
- 凭证管理弹窗不再显示锁定按钮；其余状态、修改主密码和清除凭证库操作不变。

## Constraints

- 复用现有 `credential_vault_lock` IPC 和凭证库状态事件，不修改加密、存储或自动锁定规则。
- 锁定失败不得伪报成功，并需在主界面提供错误反馈。
- 不记录主密码、派生密钥或凭证明文。

## Non-Goals

- 不改变凭证库初始化、解锁、超时锁定、Windows 会话锁定、修改主密码或清除流程。
- 不修改凭证文件格式或迁移行为。

## Acceptance

1. “锁定凭证库”位于主界面“系统设置”上方，凭证管理弹窗中不再出现该按钮。
2. 凭证库已解锁时点击入口调用一次锁定操作，完成后入口变为不可用。
3. 未初始化、已锁定或执行中不能重复触发锁定，并有明确的可访问状态说明。
4. 其他界面或后端原因触发的锁定/解锁事件会实时同步到主界面入口。
5. 锁定失败时入口恢复可用，并展示错误，不改变已解锁状态。

## Acceptance To Verification

- 1—5：`WorkspaceShell` 与 `CredentialDialog` 组件回归测试。
- 全量：`pnpm check`。

## Recommended Approach

由 `WorkspaceShell` 订阅现有凭证库状态事件并承载全局操作入口；实际锁定规则仍由后端凭证库服务执行。这样入口归属主界面，安全规则与弹窗状态清理仍复用现有事件边界。

## Next Skills

- `writing-qb-plans`（Standard：前端跨组件状态迁移，不修改安全规则）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（无目录或模块职责结构变化）

## Verification Evidence

- 聚焦回归：`WorkspaceShell` 与 `CredentialDialog` 共 15 项测试通过。
- `pnpm check`：通过；29 个测试文件、167 项测试全部成功，ESLint、TypeScript 与 Vite 生产构建成功。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 提示。
