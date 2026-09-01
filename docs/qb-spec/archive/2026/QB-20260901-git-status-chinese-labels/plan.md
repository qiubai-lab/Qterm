---
id: QB-20260901-git-status-chinese-labels
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 文件状态中文化计划

## Requirement

实现 REQ-001 至 REQ-004。

## Scope

新增 Git 前端共享状态展示映射，并接入变更列表、更改预览和提交文件列表；不改变传输 DTO 或操作逻辑。

## Affected Files

- `src/git/gitStatus.ts`
- `src/git/gitStatus.test.ts`
- `src/git/GitPaneSections.tsx`
- `src/git/GitChangePreview.tsx`
- `src/git/GitChangePreview.test.tsx`
- `src/git/GitCommitGraph.tsx`
- `src/git/GitPane.graph.test.tsx`

## Design

共享函数接收原始状态与可选上下文，返回完整中文 label 和既有颜色 tone。组件只在渲染及无障碍文案中使用 label，仍保留原始 `status` 作为键值和加载参数。中文标签沿用当前紧凑徽标样式，不新增色彩或视觉层级。

## Implementation Tasks

- [x] 先补状态映射及三个展示入口的失败回归测试。
- [x] 实现共享状态中文映射和未知状态回退。
- [x] 替换变更列表、预览和提交文件列表的原始状态显示。
- [x] 运行聚焦测试与项目级前端检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitStatus.test.ts` 覆盖标准状态、带后缀状态与未知回退 |
| AC-002 | 组件测试断言列表、预览和提交文件展示及 ARIA 文案 |
| AC-003 | 相关 Git 测试与 `pnpm check` |

## Test / Verification

- 聚焦 Vitest：状态映射、GitChangePreview、GitPane basics/graph。
- `pnpm check`。
- `git diff --check`。

## Documentation Updates

不需要 Directory Map 或长期 UI context 更新；该调整符合现有中文界面和 Git 紧凑状态标签规范。
