---
id: QB-20260828-terminal-cwd-shell-integration
type: feature
tier: standard
status: archived
created: 2026-08-28
updated: 2026-08-28
supersedes: []
---

# Terminal CWD Shell Integration Plan

## Requirement

实施 `QB-20260828-terminal-cwd-shell-integration` 的 REQ-001 至 REQ-005。

## Scope

包含 Terminal runtime cwd 来源、OSC 7 提交、标题栏回退交互、当前会话 Shell 集成命令及聚焦测试。不修改 profile/workspace schema、SSH 协议、用户 rc 文件或 Files 独立会话生命周期。

## Affected Files

- `src/workspace/workspaceRuntime.ts`
- `src/workspace/WorkspaceProvider.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/{WorkspaceProvider,LayoutView}.test.tsx`
- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/terminal/TerminalCwdDialog.tsx`
- `src/terminal/TerminalCwdDialog.test.tsx`
- `src/terminal/shellIntegration.ts`
- `src/terminal/shellIntegration.test.ts`
- `src/terminal/terminalChrome.css`
- `src/app/appStyles.test.ts`

## Design

- Workspace runtime 继续拥有 Block 级 cwd 状态，新增 `cwdSource: "initial" | "osc7" | null`；不持久化。
- xterm parser 继续拥有 OSC 控制序列解析，WorkspaceProvider 只接收已经解析的路径和来源。
- Shell 命令映射及对话框归属 `src/terminal/`；LayoutView 只决定直接打开、说明回退或 dispatch 路径快照。
- 使用现有 `DialogFrame`、Button、Icon 与主题 token，不新增 UI 依赖或全局工具轨入口。

## Implementation Tasks

- [x] 先更新 runtime、TerminalPanel、Provider 与 LayoutView 测试，覆盖 cwd 来源和打开决策。
- [x] 添加 Shell 集成命令纯映射及命令安全边界测试。
- [x] 实现 TerminalCwdDialog 的 Shell 选择、复制反馈与显式回退。
- [x] 接入标题栏按钮并更新 runtime cwd 来源。
- [x] 添加紧凑对话框样式和必要样式契约。
- [x] 运行聚焦检查与完整前端检查。

## Acceptance To Verification

- AC-001：`TerminalPanel.test.tsx` 与 `WorkspaceProvider.test.tsx` 验证 OSC 7 提交和来源。
- AC-002：`LayoutView.test.tsx` 验证 initial/unknown 标题和对话框入口。
- AC-003：`shellIntegration.test.ts`、`TerminalCwdDialog.test.tsx` 验证四类命令、复制成功/失败和非自动执行文案。
- AC-004：`LayoutView.test.tsx` 验证 local/remote 回退及 OSC 7 直接 dispatch。
- AC-005：`WorkspaceProvider.test.tsx` 验证本地 initial 与远程 null cwd。

## Test / Verification

1. `pnpm exec vitest run src/terminal/shellIntegration.test.ts src/terminal/TerminalCwdDialog.test.tsx src/terminal/TerminalPanel.test.tsx src/workspace/WorkspaceProvider.test.tsx src/workspace/LayoutView.test.tsx src/app/appStyles.test.ts --maxWorkers=1`
2. `pnpm check`

## Documentation Updates

- 本 change 不改变目录结构或长期架构边界，不更新 Directory Map。
- 验证通过后由普通 qb-spec 完成路径归档 spec 与 plan。

## Execution Result

- 所有 AC 已由聚焦测试覆盖，完整前端 lint、test、typecheck 与 production build 通过。
- 归档完成于 2026-08-28；无 Directory Map 或长期 context 更新需求。
