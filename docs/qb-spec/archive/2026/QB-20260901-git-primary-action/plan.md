---
id: QB-20260901-git-primary-action
tier: standard
status: completed
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
---

# Git 状态驱动聚合按钮实施计划

## Requirement

执行 `QB-20260901-git-primary-action` 的 REQ-001 至 REQ-007：用单步状态驱动聚合按钮替代固定 Commit 按钮，并保持选择性提交、本机/SSH 窄 action 和失败恢复边界。

## Scope

包含纯动作派生模型、主按钮/分割菜单、GitPane action dispatch、提交框干净状态、semantic styles 与相关前端测试。不包含 Rust/IPC/domain 变更、自动流水线、分叉自动处理、持久化或通用 UI primitive。

## Affected Files

- `src/git/gitPrimaryAction.ts`
- `src/git/gitPrimaryAction.test.ts`
- `src/git/GitPrimaryActionButton.tsx`
- `src/git/GitPaneSections.tsx`
- `src/git/GitPane.tsx`
- `src/git/GitPane.basics.test.tsx`
- `src/git/GitPane.operations.test.tsx`
- `src/git/gitStyles.test.ts`
- `src/git/styles/gitShell.css`
- `src/git/styles/gitMedia.css`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Design

- 用 discriminated union 表达 `stageAll | commit | push | pull | publish | chooseRemote | idle | blocked`，纯函数按 spec 固定优先级派生 label、disabled、detail 和可选替代动作。
- `staged > 0` 时 Commit 为主动作；同时存在 unstaged 时分割箭头打开 feature-local menu，提供“暂存其余更改”。
- 提交输入框只在存在 staged/unstaged/conflict 或 merge 状态时挂载；message 草稿在 Stage All、菜单和失败路径保持，Commit 成功沿用现有清空行为。
- `GitPane` 根据 action kind 调用现有 `mutate` / `runRecordedOperation` / publish overlay；所有动作单步等待 snapshot，不新增万能 client method。
- 菜单使用 portal、semantic menu tokens、固定 viewport gutter、Escape/外部/scroll/resize 关闭、焦点恢复和 reduced-motion；主按钮仍是提交区唯一 filled primary action。

## Implementation Tasks

- [x] 先新增纯状态矩阵与 GitPane 交互失败测试，覆盖 AC-001 至 AC-005。
- [x] 实现 `gitPrimaryAction` 纯模型，使状态测试转绿。
- [x] 实现 feature-local split button、菜单生命周期和 semantic styles。
- [x] 将 GitChangesSection/GitPane 接到现有 stage/commit/pull/push/publish 编排，并保持单步执行与错误恢复。
- [x] 更新既有 Commit 测试、样式契约与 Directory Map，执行聚焦和标准完整验证。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitPrimaryAction.test.ts` 与 `GitPane.basics.test.tsx` 覆盖 staged/unstaged/mixed 和替代菜单。 |
| AC-002 | `GitPane.basics.test.tsx` 覆盖消息校验、失败保留、成功 snapshot 转换和不自动 Push。 |
| AC-003 | `gitPrimaryAction.test.ts` / `GitPane.operations.test.tsx` 覆盖 ahead/behind/diverged/0-0 与单 action dispatch。 |
| AC-004 | 纯模型和 operations 测试覆盖单/multi/no remote、detached、unborn 与 publish 选择。 |
| AC-005 | 组件与 style 测试覆盖 menu semantics、键盘/关闭/焦点、busy、干净状态和 reduced motion。 |
| AC-006 | 相关 Git Vitest、`pnpm check`、`git diff --check` 与静态 diff 审计。 |

## Test / Verification

1. `pnpm exec vitest run src/git/gitPrimaryAction.test.ts src/git/GitPane.basics.test.tsx src/git/GitPane.operations.test.tsx src/git/gitStyles.test.ts`
2. `pnpm check`
3. `git diff --check`
4. 确认 `git diff -- src-tauri src/lib/tauri/git.ts package.json pnpm-lock.yaml` 无本 change 新增差异。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 的 Git UI owner，记录聚合动作纯模型和单步 mutation 边界。
- 验证结果写回 spec/plan；通过后由 standard completion path 自动归档。

## Dependencies

- 无新增外部依赖、账号或后端能力。
- 复用现有 publish overlay 和本机/SSH action；不运行桌面 package build。

## Style Context

- 遵循 Qterm compact workbench、单一 filled primary action、semantic menu roles、稳定 feedback、可见 focus 和 reduced-motion 规范。

## Trigger Signals

- Architecture boundary：已触发；纯推荐模型留在 frontend feature，Git 安全规则不迁入 UI。
- Critical behavior：已触发；先补状态矩阵与单步 mutation 回归保护。
- Directory Map：新增 feature-local 模型/组件后需要更新。
