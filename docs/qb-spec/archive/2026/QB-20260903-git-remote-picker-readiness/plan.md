---
id: QB-20260903-git-remote-picker-readiness
type: bugfix
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Git 远程目录选择器就绪与路径视觉修复计划

## Requirement

实现 `QB-20260903-git-remote-picker-readiness` 的 REQ-001 至 REQ-004。

## Scope

只修正 `GitRemoteTargetConfig` 的选择器就绪条件与空路径 fallback，以及组合输入的光学校正；不改变 controller、IPC 或持久化契约。

## Affected Files

- `src/git/GitRemoteTargetConfig.tsx` 与测试：connected 挂载门和默认目录。
- `src/git/styles/gitTargetConfig.css`、`src/git/gitStyles.test.ts`：输入字形光学校正与样式契约。

## Design

- 使用现有 `connectionStatus` 和 `sessionId` 共同派生 picker ready，不创建新状态。
- 空路径传递 `.`，复用 SFTP canonicalize 得到登录用户实际默认目录。
- 使用不对称 block padding 对 SFMono 基线做 2px 光学校正，保持总盒模型不变。

## Implementation Tasks

- [x] 先增加 connecting + sessionId 不挂载，以及 connected 后默认 `.` 挂载的回归测试。
- [x] 收紧选择器 ready 条件并修改空路径 fallback。
- [x] 更新输入框光学校正及样式契约。
- [x] 运行聚焦测试、source-size 与标准 tier 验证。

## Acceptance To Verification

| Acceptance | Evidence |
| --- | --- |
| AC-001 | `gitStyles.test.ts` 校验 5px/9px padding、16px line-height 和 32px group |
| AC-002 | `GitRemoteTargetConfig.test.tsx` 校验 connecting + sessionId 不挂载，connected 后自动挂载 |
| AC-003 | 同一组件测试校验空草稿为 `.`、非空草稿保持原值 |
| AC-004 | 运行完整 `GitRemoteTargetConfig.test.tsx` 行为集 |

## Test / Verification

1. `pnpm vitest run src/git/GitRemoteTargetConfig.test.tsx src/git/gitStyles.test.ts`
2. `pnpm check:source-size`
3. `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
4. `pnpm test`；若既有 Submodule 失败持续存在，单独记录为非本变更阻塞。

## Documentation Updates

- 无稳定 ownership 变化，不更新 Directory Map。

## Execution Result

- AC-001 至 AC-004 已由 81 项聚焦测试、source-size、lint、typecheck 和 production build 覆盖。
- 全量测试的唯一失败属于既有 Submodule 行为，已记录在 spec 的 Residual Risk。
