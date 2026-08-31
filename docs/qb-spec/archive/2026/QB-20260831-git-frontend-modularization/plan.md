---
change_id: QB-20260831-git-frontend-modularization
type: design
tier: standard
status: completed
created: 2026-08-31
updated: 2026-09-01
---

# Git 前端模块化拆分执行计划

## 需求基线

本计划执行 `QB-20260831-git-frontend-modularization` 的 REQ-001 至 REQ-006。目标是结构降复杂度而不改变 Git 功能、IPC、视觉或交互。

## 设计边界

```text
GitPane（稳定组合入口）
├─ repository client：选择本地/远程 Tauri 调用
├─ pane controller：快照、过期保护、忙碌、错误、操作与合并编排
├─ commit inspection：提交选择、悬停、文件缓存与提示层定位
├─ overlay controller：浮层状态、定位、焦点与关闭规则
├─ presentation：工作树、提交图、空状态和仓库浮层
└─ styles：按表面拆分，git.css 保持有序入口
```

业务规则继续由既有 Rust domain/application 层与 `src/lib/tauri/git.ts` 契约拥有；展示组件只消费结构化状态与动作。

## 影响文件

- `src/git/GitPane.tsx`
- `src/git/GitPane.*.test.tsx` 与 `GitPane.testHarness.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- 新增 `src/git/` 特性内 client、controller、hook、presentation 与样式模块
- `docs/qb-spec/context/Directory Map.md`

## 实施任务

- [x] 记录当前工作树与聚焦测试基线，确认合并弹窗改动已受测试保护。
- [x] 按原有声明顺序拆分 `git.css`，保留清单入口，并更新样式契约测试。
- [x] 提取本地/远程仓库 client，集中 IPC 选择且不改变 DTO。
- [x] 提取页面控制、提交检查与浮层控制逻辑，保留 epoch、缓存、焦点和 portal 行为。
- [x] 提取工作树、提交图、空状态和仓库浮层展示组件，使 `GitPane` 回归组合职责。
- [x] 按新边界调整测试位置或增加聚焦测试，不删除关键行为覆盖。
- [x] 更新 Directory Map 并检查文件规模、导入方向和公共 API。
- [x] 运行聚焦测试和 `pnpm check`，记录验收证据并完成变更归档。

## 完成证据

- 聚焦验证：5 个 Git 测试文件、57 项测试通过。
- 完整验证：`pnpm check` 通过，71 个测试文件、632 项测试通过，ESLint、TypeScript、Vite build 成功。
- 结构验证：`GitPane.tsx` 689 行；新增生产模块均小于 500 行；9 个 CSS 模块均小于 900 行；4 个 GitPane 测试套件均小于 500 行。
- 契约验证：CSS 声明流与拆分前逐行一致，`LayoutView` 导入与 Git IPC/Rust/依赖未改变。

## 验收与验证映射

| 验收标准 | 验证方式 |
| --- | --- |
| AC-001 | 统计 `GitPane.tsx` 与新模块行数；检查展示模块无 Tauri IPC 导入。 |
| AC-002 | 运行 GitPane 相关 Vitest，确认本地/远程、过期、操作、同步、合并、缓存与提示层场景通过。 |
| AC-003 | 运行 `gitStyles.test.ts`；检查 `git.css` 导入顺序和各 CSS 模块行数。 |
| AC-004 | 运行新增聚焦测试及完整 `pnpm check`。 |
| AC-005 | 检查 `LayoutView` 导入、`src/lib/tauri/git.ts`/Rust diff 与 Directory Map 更新。 |
| AC-006 | 运行合并弹窗、二次确认、焦点、层级和可访问性断言；检查依赖清单无新增。 |

## 验证命令

```powershell
pnpm exec vitest run src/git/GitPane.*.test.tsx src/git/gitStyles.test.ts
pnpm check
```

如新模块新增独立测试文件，将其纳入聚焦 Vitest 命令。日常前端结构重构不运行桌面打包。

## 回退策略

各阶段保持公共导出和测试可运行。若某个控制逻辑提取导致行为漂移，先保留已验证的 CSS/展示拆分，再将该逻辑恢复到最近通过测试的模块边界；不得使用破坏性 Git 命令覆盖用户工作树。

