---
id: QB-20260903-git-remote-path-browser
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Git 远程路径浏览入口实施计划

## Requirement

实现 `QB-20260903-git-remote-path-browser` 的 REQ-001 至 REQ-005。

## Scope

只调整未指定远程 Git 路径时的配置 presentation、Git runtime 暂存连接 intent，以及对应测试和样式；不修改本机选择器和后端 IPC。

## Affected Files

- `src/git/GitRemoteTargetConfig.tsx` 及相邻测试：配置页、组合控件和远程选择器生命周期。
- `src/workspace/useGitWorkspaceController.ts` 及相邻测试：暂存 intent、取消清理和确认后的同 profile 会话复用。
- `src/workspace/WorkspaceProvider.tsx`、`src/workspace/LayoutView.tsx`：窄 façade 与装配。
- `src/git/styles/gitTargetConfig.css`、`src/git/gitStyles.test.ts`：组合控件视觉及样式契约。
- `docs/qb-spec/DIRECTORY_MAP.md`：新增 Git presentation owner。

## Design

- presentation 只拥有输入草稿对应的浏览请求状态，不直接调用 Tauri IPC。
- workspace controller 继续唯一拥有 connection intent 和 session 清理；暂存 profile 不写 workspace document。
- 选择器确认时把已连接的暂存 profile 作为可复用来源，避免先断开再重连。
- 组合控件使用现有语义 token、32px 控件高度、单一 focus-within 边界和可访问 group 标签。

## Implementation Tasks

- [x] 先增加组件与 controller 的行为回归测试，覆盖 AC-001 至 AC-005。
- [x] 实现暂存/取消 Git 连接 intent 与确认后的浏览会话复用。
- [x] 提取并接入远程路径配置组件，保持 `LayoutView` baseline 不增长。
- [x] 实现输入框与浏览按钮的组合样式及焦点、禁用状态。
- [x] 更新 Directory Map 与验证证据，完成无冲突归档。

## Acceptance To Verification

| Acceptance | Evidence |
| --- | --- |
| AC-001 | `GitRemoteTargetConfig.test.tsx` 的 group、自动聚焦与精确输入属性断言；`gitStyles.test.ts` 的组合边框/focus 契约 |
| AC-002 | 组件测试覆盖空草稿请求连接、runtime 到达后以 `/` 打开选择器，以及非空初始路径 |
| AC-003 | `LayoutView`/controller 聚焦测试覆盖单次 target 提交和暂存会话复用 |
| AC-004 | 组件与 controller 测试覆盖关闭选择器、取消配置、不持久化及 session 清理 |
| AC-005 | 组件测试覆盖手动、最近仓库和空白禁用 |

## Test / Verification

1. `pnpm vitest run src/git/GitRemoteTargetConfig.test.tsx src/workspace/useGitWorkspaceController.test.ts src/workspace/LayoutView.test.tsx src/git/gitStyles.test.ts`
2. `pnpm check:source-size`
3. `pnpm check`

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 的 Git presentation 与 workspace runtime ownership。

## Dependencies

- 复用现有 `GitRepositoryPickerDialog` 和 Git-purpose session；无新增依赖。

## Execution Result

- 所有 AC 均由组件、controller、集成或样式契约测试覆盖。
- `pnpm check` 与 source-size ratchet 全部通过。
