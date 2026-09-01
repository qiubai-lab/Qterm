---
id: QB-20260902-unified-git-directory-picker
type: feature
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# 统一 Git 目录选择器实施计划

## Requirement

实现 `QB-20260902-unified-git-directory-picker` 的 REQ-001 至 REQ-007。

## Scope

改造 Git feature-local 选择器、LayoutView 调用链和相邻测试；复用既有本地 listing、root listing 与原生选择 IPC。保持 Git/Files session、Git target 和 snapshot 生命周期不变。

## Affected Files

- `src/git/GitRepositoryPickerDialog.tsx`
- `src/git/GitRepositoryPickerDialog.test.tsx`
- `src/git/styles/gitRepositoryPicker.css`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `docs/qb-spec/specs/QB-20260902-unified-git-directory-picker.md`
- `docs/qb-spec/plans/QB-20260902-unified-git-directory-picker.md`

## Design

- 选择器负责模式无关的浏览草稿、选择、历史、竞态和渲染状态。
- 数据适配留在组件边界：本机调用 `listLocalDirectory/listLocalRoots` 并过滤目录；远程调用 `listRemoteGitDirectory`，不共享 session DTO。
- 本机根目录使用显式 pseudo-location，不把 Windows drive root 伪装成普通父目录。
- 原生选择器只由 LayoutView 提供的回调触发，沿用 `selectGitRepositoryDirectory` 非阻塞 bridge。
- CSS 继续复用文件浏览 token；本机无权限元数据时调整列语义，不新增全局 token。

## Implementation Tasks

- [x] 先扩展选择器测试，覆盖本机数据源、根目录、文件过滤、系统选择成功/取消和远程不回归。
- [x] 将选择器 props 改为本机/远程判别联合，加入本机 loading adapter 和 roots 状态。
- [x] 调整模式化标题、路径、反馈、列信息与系统选择器入口。
- [x] 将 LayoutView 本机入口改为打开应用内选择器，并把原生选择封装为兜底回调。
- [x] 更新相邻调用链测试及必要样式断言。
- [x] 运行聚焦测试与 `pnpm check`，记录证据并归档 change；完整 check 的无关既有失败已记录在 spec。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `GitRepositoryPickerDialog.test.tsx` 模式化语义测试 |
| AC-002 | 本机目录、文件过滤和 roots 导航测试 |
| AC-003 | 选择器与 `LayoutView.test.tsx` 系统选择成功/取消测试 |
| AC-004 | 既有远程浏览失败降级与 IPC 参数测试 |
| AC-005 | 既有键盘、竞态、虚拟列表测试加本机关键分支 |
| AC-006 | `LayoutView.test.tsx` 本机/远程 target lifecycle 测试 |

## Test / Verification

1. `pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/workspace/LayoutView.test.tsx`
2. `pnpm check`
3. 代码检查远程模式未导入或调用 `listRemoteDirectory`，原生选择仍通过既有 IPC。

## Documentation Updates

- 验证完成后将 spec/plan 连同验证摘要归档到 `docs/qb-spec/archive/2026/QB-20260902-unified-git-directory-picker/`。
- 本次不新增模块或所有权边界，预计无需更新 `DIRECTORY_MAP.md`。
