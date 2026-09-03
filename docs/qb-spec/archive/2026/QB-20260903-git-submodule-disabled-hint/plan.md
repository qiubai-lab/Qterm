---
id: QB-20260903-git-submodule-disabled-hint
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
spec: spec.md
---

# Submodule 不可选择原因提示实施计划

## Requirement

实现 `REQ-001` 至 `REQ-005`，不改变已有 Submodule 选择规则和 Git 操作边界。

## Scope

覆盖原因派生、仓库树 hover/focus 接线、body portal、视口定位、主题红色样式、ARIA 和回归测试；不修改后端或 IPC。

## Affected Files

- `src/git/gitRepositoryContext.ts` 及测试
- `src/git/GitRepositoryUnavailableHint.tsx`
- `src/git/GitRepositoryTree.tsx` 及测试
- `src/git/styles/gitRepositoryTree.css`
- `src/git/GitRepositoryUnavailableHint.test.tsx`

## Design

- 纯模型按“节点固有问题 → 远程未连接 → 全局操作进行中”的优先级返回修复说明。
- 仓库树保持现有选择按钮可聚焦，以 hover/focus 状态驱动一个 feature-local portal 气泡。
- 气泡测量目标矩形，在空间不足时上下翻转，并将 left 钳制在 8px 视口安全边距内。
- 使用 `--danger` / `--danger-bg` / `--shadow-strong`，不新增主题 selector 或颜色常量。

## Implementation Tasks

- [x] 先补原因派生和 hover/focus 行为回归测试。
- [x] 实现纯原因模型与独立 hint presentation 组件。
- [x] 在仓库树接入 tooltip 状态及 ARIA 关系。
- [x] 增加危险色、上下 placement 和 reduced-motion 样式。
- [x] 运行聚焦验证、源码尺寸检查和完整前端检查。

## Acceptance To Verification

- AC-001：`gitRepositoryContext.test.ts`
- AC-002、AC-003：`GitRepositoryTree.test.tsx` 与 `GitRepositoryUnavailableHint.test.tsx`
- AC-004：仓库树、Submodule 聚焦测试及 `pnpm check`

## Test / Verification

1. `pnpm vitest run src/git/gitRepositoryContext.test.ts src/git/GitRepositoryTree.test.tsx src/git/GitRepositoryUnavailableHint.test.tsx src/git/GitPane.submodules.test.tsx`
2. `pnpm check:source-size`
3. `pnpm check`
4. `git diff --check`

## Documentation Updates

- 验证通过后记录 evidence 并归档本 change；模块入口不变，无需更新 Directory Map。

## Verification Evidence

- 测试先行：新增测试最初因原因派生和提示组件尚不存在而失败，随后实现至通过。
- 聚焦：`pnpm vitest run src/git/gitRepositoryContext.test.ts src/git/GitRepositoryTree.test.tsx src/git/GitRepositoryUnavailableHint.test.tsx src/git/GitPane.submodules.test.tsx`，14 项测试通过。
- 完整：`pnpm check` 通过，包含源码尺寸零提醒、ESLint、811 项 Vitest、13 项 Node 测试、TypeScript 与 Vite 生产构建。
- 差异：`git diff --check` 通过；本 change 未修改模块入口，因此 Directory Map 保持不变。
