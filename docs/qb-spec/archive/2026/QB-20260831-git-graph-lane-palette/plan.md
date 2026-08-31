---
id: QB-20260831-git-graph-lane-palette
type: design
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
spec: ../specs/QB-20260831-git-graph-lane-palette.md
---

# Git 图表泳道配色与逐行自适应布局实施计划

## Requirement

实施 `REQ-001` 至 `REQ-006`：稳定泳道色槽、完整 SVG 颜色传播、三主题语义色板和逐行自适应 rail 宽度，同时保持既有图表交互与连续性。

## Scope

- 修改前端纯图算法、GitPane SVG 渲染、Git feature CSS 与主题预设。
- 扩充纯函数、组件、样式和主题测试。
- 不修改 Rust、Tauri IPC、Git snapshot 或 Workspace 模型。

## Affected Files

- `src/git/gitGraph.ts`
- `src/git/gitGraph.test.ts`
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `src/app/styles/themes/{dark,light,cyberpunk}.css`
- `src/app/themeStyles.test.ts`
- 本 spec 与 plan；不需要更新 Directory Map，因为模块边界和入口不变。

## Design

- Boundary：颜色分配和泳道连续性只存在于 `gitGraph.ts` 纯派生模型；React 只消费 row，CSS 只映射色槽。
- Palette：声明六个 `--git-graph-lane-*` 主题令牌，通过 `data-color` 选择，禁止 SVG 固定色值。
- Layout：共同 lane offset/gap 不变；每行 rail 宽度由本行 `laneCount` 决定，commit card 继续使用 `minmax(0, 1fr)` 消费剩余宽度。
- Accessibility：颜色仅增强分支追踪，节点、曲线、位置和现有语义保持。
- Existing constraints：保留之前归档变更确定的 36px row、外置 rail、自然详情高度、continuation/bridge 连续性、唯一滚动 owner 和主题滚动条。

## Implementation Tasks

- [x] 先扩充纯函数测试，覆盖线性、merge/fork、并入、颜色确定性、相邻色避让和泳道收缩。
- [x] 扩充组件/样式/主题测试，覆盖逐行 SVG 宽度、颜色属性、选择态和三主题六色板。
- [x] 将 `gitGraph.ts` 的内部 lane 改为 OID + colorIndex，并在 row 输出节点、incoming、segments 和 continuing lanes 的颜色。
- [x] 移除 `GitPane` 全局最大 `graphLaneCount`；让 row、continuation、bridge 使用局部宽度并输出 `data-color`。
- [x] 增加三主题 Git graph 色槽和 SVG 颜色映射，保持 hover/selected/focus 可读。
- [x] 运行聚焦测试，修复回归后执行完整前端检查与 diff 检查。
- [x] 验证通过后记录证据并归档 spec/plan。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `pnpm vitest run src/git/gitGraph.test.ts` 覆盖颜色继承、分支分配、移动与并入。 |
| AC-002 | `gitGraph.test.ts` 覆盖六色以上确定性；`themeStyles.test.ts` 验证三主题令牌和赛博前三色。 |
| AC-003 | `GitPane.test.tsx` 验证混合 laneCount 的 row/continuation/bridge SVG 宽度。 |
| AC-004 | `GitPane.test.tsx` 与 `gitStyles.test.ts` 验证 `data-color`、选择态、展开/滚动/ARIA 回归。 |
| AC-005 | 聚焦 Vitest、`pnpm check`、`git diff --check`。 |

## Test / Verification

1. `pnpm vitest run src/git/gitGraph.test.ts src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/app/themeStyles.test.ts`
2. `pnpm check`
3. `git diff --check`

## Documentation Updates

- 完成时将验证摘要写入 spec，并自动归档到 `docs/qb-spec/archive/2026/QB-20260831-git-graph-lane-palette/`。
- 模块职责未变化，不更新 `DIRECTORY_MAP.md`。

## Dependencies

- 无新增依赖、后端改动或数据迁移。
- 关键行为保护信号：纯图算法必须 tests-first。
- 架构信号已处理：派生规则留在 `gitGraph.ts`，不进入 React/CSS。

## Completion Evidence

- 实现前聚焦测试按预期失败，覆盖缺失的颜色模型、主题令牌、`data-color` 和逐行宽度。
- 聚焦 Vitest：4 个文件、69 项测试通过。
- 完整 `pnpm check`：68 个测试文件、619 项测试通过；ESLint、TypeScript 和 Vite production build 通过。
- `git diff --check`：通过。
- 架构边界保持：Git 数据与后端未变，纯拓扑规则位于 `gitGraph.ts`，React/CSS 仅消费派生结果。
- Directory Map：模块和入口未变化，无需更新。
