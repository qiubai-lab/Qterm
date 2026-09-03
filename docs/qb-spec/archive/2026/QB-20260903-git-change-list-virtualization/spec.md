---
id: QB-20260903-git-change-list-virtualization
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Git change list virtualization

## Goal

让 Git Block 在数千到数万项更改时仍能流畅浏览和操作全部文件，避免当前每组只展示前 500 项或为数百项一次性创建全部 DOM。

## Approval

- 2026-09-03：用户在确认现状与推荐方向后，明确要求落盘 spec/plan 并开始修改。

## Scope

- 对 Git 更改分组采用按共享滚动视口计算的有界行渲染。
- 保留完整快照、完整计数以及所有更改的滚动可达性。
- 保持预览、选择、区间选择、右键菜单、暂存、取消暂存和冲突操作语义。
- 为大列表渲染边界、滚动可达性和小列表兼容补充自动化保护。

## Non-Goals

- 不分页或截断后端 `git status`，不改变本机/SSH Git IPC DTO。
- 不改变 Git 快照刷新频率、Git 命令、排序或状态解析规则。
- 不引入第三方虚拟列表依赖，也不重构提交图或仓库选择器。

## Assumptions And Constraints

- Git 更改行保持固定高度；虚拟范围可由滚动视口、行高和 overscan 确定。
- 完整更改数组继续留在内存中，以维持准确计数、批量选择和 mutation 输入。
- 遵守 `docs/qb-spec/context/ENGINEERING_STYLE_SPEC.md`、`docs/qb-spec/DIRECTORY_MAP.md` 与 Qterm 界面规范；共享 Git 更改滚动区仍是唯一滚动 owner。

## Requirements

- REQ-001：当单个 Git 更改分组达到大列表阈值时，界面必须只挂载当前视口附近的有界行数，DOM 行数不得随总文件数线性增长。
- REQ-002：所有 Git 更改必须可通过滚动到达，不再以 500 项为上限截断或要求用户转到终端处理剩余项。
- REQ-003：虚拟化后的行必须保留准确的路径、状态、全局位置和总数，并继续支持选择、区间选择、预览、上下文菜单及对应的 Git 操作。
- REQ-004：小列表的完整渲染、既有视觉层级、单一滚动区、完整快照与 IPC 契约必须保持不变。

## Acceptance Criteria

- AC-001（REQ-001）：给定 5,000 项单组更改和 270px 高视口，初始及滚动后的已挂载更改行保持在视口行数加固定 overscan 的界限内，显著少于总数。
- AC-002（REQ-002）：将 5,000 项列表滚动到底部后，最后一项能够显示和操作，界面不存在“另有 N 项，请使用终端”的截断提示。
- AC-003（REQ-003）：虚拟行暴露正确的 `aria-posinset` / `aria-setsize`，滚动后点击操作会把准确的原始更改项交给既有 handler；选择索引仍使用完整分组索引。
- AC-004（REQ-004）：阈值以内的列表继续渲染全部行，既有 Git Pane 行为测试通过，源码尺寸门禁通过且没有修改 Git IPC/Rust 文件。

## Behavior Delta

### ADDED

- REQ-001：大规模 Git 更改列表按视口有界渲染。

### MODIFIED

- REQ-002：原先每组只展示前 500 项并提示转到终端；改为通过滚动访问完整列表。
- REQ-003：现有行操作扩展到虚拟化窗口中的任意全局位置。

## Options Considered

- 推荐：保留完整快照，只虚拟化前端 DOM。它维持现有领域/IPC 契约和准确批量语义，同时直接解决主要渲染成本。
- 后端分页：会使 `git status` 一致性、计数、区间选择和 mutation 校验复杂化，且不能避免 Git 本身扫描工作树，本次不采用。
- 仅使用 CSS `content-visibility`：仍创建全部 React 元素和 DOM，无法满足有界挂载要求。

## Quality Check

- REQ-001 至 REQ-004 均有对应 AC；大列表、末尾可达、交互语义和小列表兼容均可自动验证。
- 范围不涉及安全、schema、公共 API、持久化或后端领域规则，standard tier 足够。
- 当前无阻塞性歧义。

## Blockers

- 无。

## Verification Evidence

- AC-001：`gitChangeListModel.test.ts` 与 `GitChangeList.test.tsx` 证明 5,000 项、270px 视口仅挂载视口行与固定 overscan；初始和末尾范围均为 18 行。
- AC-002：组件测试滚动到第 5,000 项并成功调用该项操作 handler；旧终端截断提示已移除。
- AC-003：组件测试验证末项 `aria-posinset="5000"`、`aria-setsize="5000"`，选择 handler 收到完整数组索引 4,999。
- AC-004：阈值 160 项完整渲染；Git 聚焦测试 67 项通过；`pnpm check` 的 90 个测试文件、761 个 Vitest 测试、13 个 Node 测试、ESLint、TypeScript 与生产构建全部通过；源码尺寸检查无提醒。
- Style conformance：继续使用 `.git-change-scroll` 单一滚动 owner、现有行视觉/选择状态和 feature-local CSS；无新增主题 token、依赖或动效。
- Residual risk：后端仍完整执行并传输 `git status`；本 change 解决前端 DOM 线性增长，不改变极端仓库的 Git 扫描与 IPC 成本。
