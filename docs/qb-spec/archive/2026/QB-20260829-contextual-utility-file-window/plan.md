---
id: QB-20260829-contextual-utility-file-window
tier: standard
status: completed
created: 2026-08-29
updated: 2026-08-29
spec: spec.md
---

# Contextual Utility File Window Plan

## Requirement

实施 [QB-20260829-contextual-utility-file-window](spec.md) 的 REQ-001 至 REQ-005，采用已批准的 Option A。

## Scope

- 右侧“文件管理”继承活动 Block 的连接目标。
- 仅对活动 Terminal 的有效 OSC 7 runtime 使用实时目录。
- 其余场景按本机 `~`、远程 `.` 降级，并保持 Files 独立连接生命周期。
- 不修改 Terminal 标题栏文件按钮、Workspace schema、IPC、认证或其他工具轨入口。

## Affected Files

- `src/workspace/fileWindow.ts`
- `src/workspace/fileWindow.test.ts`
- `src/workspace/WorkspaceShell.tsx`
- `src/workspace/WorkspaceShell.test.tsx`
- `docs/qb-spec/specs/QB-20260829-contextual-utility-file-window.md`
- `docs/qb-spec/plans/QB-20260829-contextual-utility-file-window.md`

## Design

- 保持 `fileWindow.ts` 为纯入口策略边界，由它统一解析有效锚点、活动叶子的 `profileId`、Terminal runtime 与 OSC 7 开关。
- `WorkspaceShell` 只提供当前 Workspace、runtime 快照和设置值并 dispatch 结果，不承载路径分支。
- OSC 7 路径必须同时满足：功能开启、活动叶子为 Terminal、runtime 已连接、来源为 `osc7`、路径非空。
- Files/Network 仅继承连接，目录使用连接默认值；不复制 Files 当前路径。
- 工具轨保留现有常驻按钮和无弹框交互，不增加样式或布局状态。

## Implementation Tasks

- [x] 扩展 `openFileWindowAction`，按活动叶子派生连接与目录，并保留无效活动 ID 的首叶回退。
- [x] 让 `WorkspaceShell` 的右侧“文件管理”传入 terminal runtimes 与 OSC 7 开关。
- [x] 更新纯策略测试，覆盖 Terminal/Files/Network、本地/远程、OSC 7 成功/关闭/无效和锚点回退。
- [x] 更新 Shell 交互测试，证明工具轨点击使用活动远程 Terminal 的 profile 与 OSC 7 目录。
- [x] 运行聚焦验证和项目级 `pnpm check`，记录验证证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001, AC-002 | `fileWindow.test.ts` 覆盖远程/本地 Terminal 有效 OSC 7；`WorkspaceShell.test.tsx` 覆盖工具轨实际 dispatch。 |
| AC-003, AC-004 | `fileWindow.test.ts` 覆盖 OSC 7 关闭、缺失、非连接及空路径的 `.` / `~` 降级。 |
| AC-005 | `fileWindow.test.ts` 覆盖远程 Files/Network 继承 profile 且不复制 Files path，以及本机叶子默认目录。 |
| AC-006 | 既有 WorkspaceProvider、Files 认证和独立 session 测试保持通过。 |
| AC-007 | `fileWindow.test.ts` 覆盖失效 activeBlockId；项目全量测试保护其他工具轨和标题栏入口。 |

## Test / Verification

1. `pnpm exec vitest run src/workspace/fileWindow.test.ts src/workspace/WorkspaceShell.test.tsx`
2. 对受影响文件运行 ESLint 与 `tsc --noEmit`。
3. `pnpm check`。
4. `git diff --check`。

## Documentation Updates

- 完成后在 change spec 中记录验证证据；本次不改变 Directory Map 中 `fileWindow.ts` 的既有职责描述。

## Dependencies

- 无外部依赖或阻塞项。
- 不触发架构边界、schema、IPC、安全或目录图专项检查。

## Style Context

- 遵循 Qterm 工具轨常驻、紧凑、无额外弹窗的既有界面规范；本次不新增视觉元素。
