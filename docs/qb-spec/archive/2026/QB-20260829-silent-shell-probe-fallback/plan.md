---
id: QB-20260829-silent-shell-probe-fallback
type: feature
tier: standard
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# 执行计划：静默 Shell 探测降级

## Requirement

实现 REQ-001 至 REQ-005，并保持 SSH 会话和既有 OSC 7 成功路径兼容。

## Scope

修改远程 Shell 探测策略、目录回退弹窗和相关说明；不调整认证、缓存结构或 OSC 7 parser。

## Affected Files

- `src-tauri/src/infrastructure/ssh/client/shell_integration.rs`
- `src/terminal/TerminalCwdDialog.tsx`
- `src/terminal/TerminalCwdDialog.test.tsx`
- `src/terminal/shellIntegration.ts` 及测试
- `src/terminal/terminalChrome.css`
- `src/components/dialogs/SettingsDialog.tsx` 及相邻测试
- `src/app/appStyles.test.ts`

## Design

- 基础设施层用内部结果类型区分 detected、unsupported、transient failure。
- 仅 transient failure 进入一次重试；每条命令 1 秒、整体 4 秒预算。
- 会话编排继续以 `Option<RemoteShell>` 接收结果，避免把探测细节泄漏到 transport DTO 或 UI。
- 目录弹窗降为单一回退决策，不再生成或复制 Hook。

## Implementation Tasks

- [x] 先添加瞬态重试、明确不支持和次数上限的 Rust 单元测试。
- [x] 实现有界探测结果分类与一次重试。
- [x] 删除前端手动 Hook 生成模块和复制 UI，保留目录回退。
- [x] 更新设置文案、组件测试和样式契约。
- [x] 运行聚焦 Rust/前端检查以及仓库级验证。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `cargo test infrastructure::ssh::client::shell_integration::tests` |
| AC-002 | 同一 Rust 测试模块验证调用次数与超时常量 |
| AC-003 | `cargo test infrastructure::ssh::client::tests` 与会话路径代码检查 |
| AC-004 | `pnpm exec vitest run src/terminal/TerminalCwdDialog.test.tsx src/workspace/LayoutView.test.tsx` |
| AC-005 | `pnpm exec vitest run src/components/dialogs/SettingsDialog.test.tsx src/app/appStyles.test.ts` |

## Test / Verification

- 从 `src-tauri/` 运行聚焦 Rust 测试、`cargo fmt --check` 和 `cargo clippy --all-targets --all-features -- -D warnings`。
- 运行受影响的 Vitest 文件。
- 最终运行 `pnpm check` 和 `git diff --check`。

## Documentation Updates

验证完成后归档本 change；不需要更新 Directory Map，因为没有目录或模块边界变化。
