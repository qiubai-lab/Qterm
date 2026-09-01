---
id: QB-20260819-collapsed-connections-and-password-reveal
status: archived
archived: 2026-09-02
legacy: true
---
# 连接列表折叠与已保存密码回显 Task Spec

Status: Complete (2026-08-19)。

## Goal

连接管理打开时保持列表紧凑，选中连接不再出现左侧高亮条；用户明确点击“显示”时可以恢复当前连接已保存的密码。

## Scope

- “未分组”和所有普通分组在每次打开连接管理时默认折叠，仍允许用户手动展开。
- 新建分组或拖动连接到分组后不自动展开目标分组。
- 保留选中项背景、状态点和文字重点，但移除左侧 inset 高亮条。
- 当前密码输入为空且当前连接存在已保存密码时，点击“显示密码”从保险库加载该连接密码并显示。
- 保险库已锁定时先打开主密码解锁框，解锁成功后继续本次单条密码回显。
- 切换连接、新建连接或清除保险库时清除已恢复的前端密码状态。

## Constraints

- 只允许按用户操作加载当前选中 profile 的单条密码；不恢复密码列表、manager token 或批量 reveal API。
- 加载失败时保持密码隐藏并显示稳定错误。
- 已在输入框中输入密码时，“显示/隐藏”只切换现有值，不触发 vault load。

## Non-Goals

- 不改变保险库加密格式、profile schema、密码保存规则或主密码策略。
- 不让分组永久不可展开，也不持久化展开状态。

## Acceptance

1. 初次渲染时未分组与所有普通分组均为 `aria-expanded=false`，用户点击后可以展开。
2. 新建分组和拖入目标分组不会自动展开列表。
3. `.connection-item.selected` 不包含左侧 inset 高亮，仍保留清晰背景与状态点。
4. 已解锁且有保存密码时，点击“显示密码”会加载当前 profile 密码并以明文显示，再次点击恢复 password 类型。
5. 已锁定时点击“显示密码”先请求解锁，成功后自动加载并显示；取消或失败不泄露密码。
6. 手动输入的密码不会触发读取保险库。

## Acceptance To Verification

- 1、2、4、5、6：`ConnectionDialog` 组件回归测试。
- 3：样式契约测试与 `git diff` 检查。
- 全量：`pnpm check`；Rust 行为未改，但运行现有完整 Rust 质量门确认 IPC 契约无回归。

## Open Questions

无。“始终折叠”按每次进入管理页默认折叠处理，保留用户当次会话内的手动展开能力。

## Recommended Approach

方案 A 是在选择连接时预先解密并填充输入框，交互直接但会在用户未要求时扩大明文驻留。方案 B 是仅在空输入框点击“显示”时按需加载，锁定则完成解锁后继续；采用方案 B，以最小化明文暴露和额外 IPC。

## Next Skills

- `writing-qb-plans`（Strict：已保存凭据明文回显）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `maintaining-project-context`
- `verifying-before-completion`
- Directory Map: not needed

## Verification Evidence

- `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/app/appStyles.test.ts`：通过；28 项聚焦测试成功。
- `pnpm check`：通过；23 个测试文件、98 项测试成功，ESLint、TypeScript 与 Vite 生产构建成功。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test --all-targets --all-features`：通过；77 项成功、0 项失败、1 项既有环境集成测试忽略。
- Directory Map：未更新；无目录、入口或模块职责变化。
