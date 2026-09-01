---
id: QB-20260820-automatic-terminal-lock
status: archived
archived: 2026-09-02
legacy: true
---
# 自动终端锁与凭证有效期 Strict Plan

Status: Implemented and verified (2026-08-20)。

## Background

现有安全设置同时包含 Windows session-lock 触发器和凭证固定 TTL，而应用已经具备进程内终端锁屏。Windows 触发器只锁凭证、不保护终端内容，且给跨平台设置引入平台特例。

## Requirement

移除 Windows 专属策略，保留后端权威的凭证固定有效期，并新增跨平台、基于真实用户输入续期的终端空闲锁。

## Non-Goals

- 不迁移 schema v1 设置值；旧设置文件可删除并采用 schema v2 默认值。
- 不改变凭证加密格式、主密码验证、SSH/SFTP/PTY/Network 会话生命周期。
- 不持久化终端锁屏状态或最近活动时间。

## Architecture Impact

- 删除 Windows WTS session-lock infrastructure adapter 和 composition-root 安装。
- Rust domain/settings 与 persistence/command DTO 拥有两项独立可选时长。
- credential lifecycle 只读取凭证有效期。
- WorkspaceShell 读取 terminal idle policy、监听用户输入/恢复事件并复用既有锁屏编排。

## Domain Model Impact

`SecuritySettings` 改为 `credential_auto_lock_after_seconds` 与 `terminal_auto_lock_after_seconds`；两者允许关闭并限制在 60—86400 秒。默认值分别为 3600 秒和关闭。

## API Impact

Tauri `settings_get` / `settings_update_security` 的 security DTO 升级为 `credentialAutoLockAfterSeconds` 与 `terminalAutoLockAfterSeconds`。这是明确允许的开发期破坏性 schema 变化。

## Database Impact

`settings.json` schema 从 v1 升级到 v2。发现更旧 schema 时删除安全设置文件并返回默认值；未来版本、损坏文件和包含未知/敏感字段的当前版本仍保留并报错。

## Implementation Tasks

1. 先更新前端与 Rust 测试，表达新 DTO、默认值、旧 schema 清理及空闲锁行为。
2. 更新 settings domain、repository、commands 与前端 IPC 类型。
3. 删除 Windows session-lock adapter、生命周期 reason 和 composition-root 安装，收窄 Windows crate features。
4. 更新设置页信息架构、文案、独立时长控件和保存回调。
5. 在 WorkspaceShell 实现绝对截止时间、用户输入续期、resume 检查、失败不假锁及解锁重置。
6. 更新长期 Product/Architecture/Decisions 与任务验证证据。

## Acceptance To Verification

- A1—A2：`SettingsDialog.test.tsx`、`settings.test.ts`、样式测试。
- A2—A3、A7：settings domain/repository/command 和 credential lifecycle Rust tests。
- A4—A6、A8：`WorkspaceShell.test.tsx` fake timers。
- 基础完整性：前端 `pnpm check`；Rust fmt、clippy、all-target tests；`git diff --check`。

## Test Plan

- 测试先行：新断言在旧实现上失败后再修改生产代码。
- 前端聚焦运行 settings、WorkspaceShell 与样式测试。
- Rust 聚焦运行 settings domain/repository/lifecycle tests。
- 最后运行仓库规定的全量门禁。

## Rollback Plan

恢复 schema v1 字段、Windows adapter 安装和 WTS crate features；移除 terminal idle DTO、设置 UI 与 WorkspaceShell effect。已删除的旧 settings 配置不可恢复，这是用户明确接受的行为。

## Risks

- WebView timer 被挂起：保存绝对时间，并在 visibility/focus 恢复时重新检查。
- 自动凭证锁失败产生假终端锁：只有 lock IPC 成功后设置遮罩。
- 事件监听泄漏或重复计时：effect cleanup 移除监听并清除 timer。
- 当前工作树存在无关改动：仅用定点 patch 修改相关代码，不回退或格式化无关文件。

## Documentation Updates

更新 `PRODUCT_SPEC.md`、`ARCHITECTURE_SPEC.md` 与 `DECISIONS.md`，替换 Windows 首期决策并补充两种计时语义。
