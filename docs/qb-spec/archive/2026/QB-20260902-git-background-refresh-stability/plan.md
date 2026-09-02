---
id: QB-20260902-git-background-refresh-stability
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
---

# Git 后台刷新稳定性实施计划

## Requirement

实现 `QB-20260902-git-background-refresh-stability` 中 REQ-001 至 REQ-006。

## Scope

仅调整 `src/git/` 内的刷新编排、展示状态和相邻测试；不修改 Tauri IPC、Rust 后端或 Git 数据模型。

## Affected Files

- `src/git/GitPane.tsx`
- `src/git/GitPaneSections.tsx`
- `src/git/GitChangePreview.tsx`
- `src/git/GitPane.branches.test.tsx`
- `src/git/GitChangePreview.test.tsx`
- 按职责需要新增的 `src/git/` 纯比较模块及测试

## Design

- `GitPane` 保留仓库生命周期编排所有权；后台请求使用独立状态/ref，不进入 mutation `busy`。
- 展示等价判断放在 `src/git/` 的纯函数模块，保持可单测，不下沉到 transport 或 Rust domain。
- `GitChangePreview` 继续拥有预览加载状态，但 effect 使用稳定选择键；相同语义输入不触发加载。
- 复用现有 sync 图标动画及 reduced-motion 规则，不新增样式和依赖。

## Implementation Tasks

- [x] 先增加无变化后台刷新、单飞、错误保留及预览稳定性的失败回归测试。
- [x] 增加 Git snapshot 展示等价比较并在后台 apply 前短路。
- [x] 分离后台 refreshing 与前台 busy，处理 focus、visibility、interval 和前台优先竞态。
- [x] 稳定预览 changes 输入、选择依赖及主操作按钮挂载身份。
- [x] 运行聚焦测试和 `pnpm check`，修复本次引入的问题。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitPane.branches.test.tsx` 检查后台请求期间刷新图标、操作可用性、主按钮文案及 DOM 身份；既有手动 fetch 测试保护前台 busy。 |
| AC-002 | `GitPane.branches.test.tsx` 使用 deferred snapshot 验证 interval/focus 单飞和 document visibility。 |
| AC-003 | snapshot 比较单元测试及 GitPane 无变化/有变化刷新测试。 |
| AC-004 | `GitChangePreview.test.tsx` 以克隆数组和克隆条目重渲染，验证 loader 次数及现有 diff。 |
| AC-005 | `GitPane.branches.test.tsx` 验证后台失败后最后快照与提示。 |
| AC-006 | `GitPane.branches.test.tsx` 验证迟到后台结果不能覆盖前台 mutation/fetch 结果。 |

## Test / Verification

1. `pnpm vitest run src/git/GitChangePreview.test.tsx src/git/GitPane.branches.test.tsx`
2. 新增纯函数测试（若拆分比较模块）。
3. `pnpm check`

## Documentation Updates

若新增 Git feature 模块，更新 `docs/qb-spec/DIRECTORY_MAP.md`；否则无需长期 context 变更。
