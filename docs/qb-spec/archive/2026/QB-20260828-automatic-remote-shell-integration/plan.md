---
id: QB-20260828-automatic-remote-shell-integration
type: feature
tier: strict
status: archived
created: 2026-08-28
updated: 2026-08-29
supersedes:
  - QB-20260828-terminal-cwd-shell-integration
---

# Automatic Remote Shell Integration Plan

## Requirement

实施 `QB-20260828-automatic-remote-shell-integration` 的 REQ-001 至 REQ-007。

## Design

- 新增 `TerminalSettings` 和独立 `device/terminal.json` schema v1，避免迁移或覆盖现有 security settings。
- 新增稳定 `RemoteShell`、`RemoteShellTarget`、探测输出解析和 Hook 命令映射；JSON cache adapter 使用 `cache/remote-shells.json` schema v1。
- `SettingsState` 向 terminal connect command 提供只读开关；`SessionConnectRequest` 只携带布尔策略，target 签名从已经校验的 route 目标产生。
- `client/session.rs` 在认证后、请求交互 PTY 前解析 cache/探测 Shell；识别成功后请求 PTY 并注入固定 Hook。所有探测/cache 失败降级为普通 shell。
- `SettingsDialog` 通用页新增即时持久化开关；重新开启使用嵌套紧凑确认弹窗。原手动 Terminal CWD 对话框保留。

## Tasks

- [x] TASK-001 [REQ-002]：新增 TerminalSettings domain、repository port、SettingsService 快照/更新与 JSON adapter，并接入 composition root 与 IPC。
- [x] TASK-002 [REQ-003, REQ-004, REQ-005, REQ-007]：新增 RemoteShell domain 规则、cache port/adapter、固定探测解析与四类 Hook 单元测试。
- [x] TASK-003 [REQ-003, REQ-004, REQ-005, REQ-006]：将开关、cache、探测、PTY echo 控制与注入接入 SSH Terminal session；保持 Files/Network 和失败降级不变。
- [x] TASK-004 [REQ-001]：在 SettingsDialog 通用页添加设置卡、开关、启用确认、错误/保存反馈与可访问交互测试。
- [x] TASK-005 [REQ-006]：运行现有 Terminal cwd、Workspace 与设置回归，确认手动 fallback 和 OSC 7 direct-open 未退化。
- [x] TASK-006 [REQ-001 至 REQ-007]：更新 Directory Map、记录验证证据并完成普通归档。

## Acceptance To Verification

- VER-001 [AC-001]：`SettingsDialog.test.tsx` 验证默认开、直接关闭、重新开启确认/取消与 IPC 参数。
- VER-002 [AC-002]：Rust settings domain/service/repository/command 测试验证默认值、严格 schema、warning 和 DTO。
- VER-003 [AC-003]：Remote shell cache adapter 测试验证完整目标签名匹配、字段失配和严格记录。
- VER-004 [AC-004, AC-005]：Remote shell domain/SSH integration 单元测试验证标记解析、上限、固定命令、OSC 7 与 echo 恢复。
- VER-005 [AC-006]：SSH session request/unit integration 测试验证 purpose/开关决策；可用本地 sshd 时执行 ignored 真机探测，否则记录环境限制。
- VER-006 [AC-007]：现有 Terminal/Workspace cwd 聚焦测试继续通过。

## Verification Commands

1. `pnpm exec vitest run src/components/dialogs/SettingsDialog.test.tsx src/terminal/shellIntegration.test.ts src/terminal/TerminalCwdDialog.test.tsx src/terminal/TerminalPanel.test.tsx src/workspace/WorkspaceProvider.test.tsx src/workspace/LayoutView.test.tsx --maxWorkers=1`
2. `pnpm check`
3. `cargo fmt --check`
4. `cargo clippy --all-targets --all-features -- -D warnings`
5. `cargo test --all-targets --all-features`
6. `git diff --check`

## Rollback

- 前端可关闭开关立即停止后续自动探测/注入。
- 代码回滚时删除独立 `terminal.json`/cache adapter 引用即可；已有 `device/terminal.json` 和 `cache/remote-shells.json` 均为无敏感字段孤立文件，不影响 security、profiles 或 Workspace schema。

## Execution Result

- REQ-001 至 REQ-007 已实现，VER-001 至 VER-006 均有自动化或明确的环境受限证据。
- Directory Map 已同步设置、Shell domain/cache port、JSON adapters 与 SSH integration 子模块边界。
- 前端完整质量门、Rust 全目标测试、Clippy、rustfmt 与 diff 检查通过；本地 sshd 真机测试因当前 Windows 环境缺少固定夹具保持 ignored，风险已记录在 spec。
