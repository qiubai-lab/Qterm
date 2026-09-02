---
id: QB-20260902-git-repository-inline-actions
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 仓库树同构行操作执行计划

## Requirement

实现 `QB-20260902-git-repository-inline-actions` 的 REQ-001 至 REQ-007；行为与验收以对应 spec 为事实源。

## Scope

- 扩展仓库树节点为完整仓库行，移除重复活动仓库行。
- 让浮层锚点、刷新与仓库操作显式绑定节点路径。
- 保持共享更改/提交图、父根持久化和现有 Git/SSH 后端边界。

## Affected Files

- `src/git/GitRepositoryTree.tsx`、相邻测试：同构行展示、行内操作、树键盘语义。
- `src/git/GitPaneSections.tsx`：删除重复行并向树传递仓库级状态/事件。
- `src/git/GitPane.tsx`、`gitPaneTypes.ts`：逐路径按钮锚点、浮层目标与一次点击目标切换编排。
- `src/git/styles/gitRepositoryTree.css`、`gitShell.css`、`gitStyles.test.ts`：紧凑同构行、响应式和状态样式。
- `src/git/GitPane.*.test.tsx`：仓库目标、浮层、刷新、共享内容与回归覆盖。
- `docs/qb-spec/DIRECTORY_MAP.md`：仅在稳定职责描述发生变化时更新。

## Design

- `GitRepositoryTree` 作为仓库行 presentation owner；treeitem 内使用独立选择按钮和操作按钮，避免嵌套按钮。
- 每个节点从自身 snapshot 派生 branch、change count、ahead/behind 和 capability；不可用节点保留生命周期操作。
- repository overlay state 携带 `repositoryPath`，按钮引用按路径注册；所有 overlay 派生与 mutation 使用已绑定路径对应的活动 snapshot。
- 对非活动行发起操作时先通过现有 repository selection/load 流程切换，完成后执行原意图；epoch 保护迟到结果。
- 共享 Changes/Graph 不变，行内更改数只负责选择并聚焦该区段。

## Implementation Tasks

- [x] 增加父/子同构行、非活动行直接操作和浮层目标绑定的失败测试。
- [x] 扩展 feature-local overlay/anchor 模型，使仓库路径成为操作身份的一部分。
- [x] 重构仓库树节点，合并分支、变更数、同步状态、刷新、更多和生命周期动作。
- [x] 删除 `GitRepositorySection` 中重复活动仓库行，保持无 Submodule 单仓库兼容。
- [x] 调整样式、响应式、focus、selected、busy/disabled 与 reduced-motion。
- [x] 运行聚焦测试和源码尺寸门禁，修复回归后运行完整前端检查。
- [x] 回写验证证据，并按 standard 完成流程归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitRepositoryTree.test.tsx`、`GitPane.submodules.test.tsx` 与 DOM/CSS 断言 |
| AC-002 | `GitPane.branches.test.tsx`、操作测试和焦点恢复测试，断言目标路径与锚点 |
| AC-003 | tree 键盘/ARIA 测试、样式契约和窄宽/reduced-motion 断言 |
| AC-004 | Git/Workspace 既有聚焦回归与 `pnpm check:source-size` |
| AC-005 | 受影响 Vitest、`pnpm check`、`git diff --check` |

## Test / Verification

1. `pnpm exec vitest run src/git/GitRepositoryTree.test.tsx src/git/GitPane.submodules.test.tsx src/git/GitPane.branches.test.tsx src/git/GitPane.operations.test.tsx`
2. `pnpm exec vitest run src/git`
3. `pnpm check:source-size`
4. `pnpm check`
5. `git diff --check`

## Documentation Updates

- 只有 owner 或稳定入口发生变化时才更新 Directory Map；不修改长期产品/架构 context。

## Style Context

- 仓库行复用 Qterm dense file/path selection token、完整 inset outline、持久核心动作和 120–180ms 状态反馈。
- 使用现有 Icon 与主题 token；无新依赖、无 hover-only 核心控制、无布局尺寸动画。

## Trigger Signals

- Architecture boundary：浮层目标与运行时仓库选择必须保留在 Git feature，presentation 不调用 Tauri。
- Critical behavior：非活动行操作、浮层目标、焦点恢复和快速切换必须有回归测试。
- Directory Map：预计无需新增入口；若职责表述改变则在完成前更新。

## Verification Evidence

- AC-001、AC-002：`pnpm exec vitest run src/git/GitRepositoryTree.test.tsx src/git/GitPane.submodules.test.tsx src/git/GitPane.branches.test.tsx src/git/GitPane.operations.test.tsx` 通过，40 项测试成功；随后 Git 全量 20 个文件、171 项通过。
- AC-003：`GitRepositoryTree.test.tsx` 与 `gitStyles.test.ts` 覆盖树键盘/ARIA、独立按钮、选中/窄宽/reduced-motion 和旧重复行移除。
- AC-004：`pnpm check:source-size` 通过且 0 reminder；`GitPane.tsx` 未增长，`gitShell.css` baseline 收紧 22 行。
- AC-005：`pnpm check` 通过，包含 ESLint、84 个 Vitest 文件/740 项、13 项 Node 测试、TypeScript 和 Vite build；`git diff --check` 通过。
- 非阻断信息：Vite 保留仓库既有的大 chunk warning；未新增依赖或改变打包边界。
