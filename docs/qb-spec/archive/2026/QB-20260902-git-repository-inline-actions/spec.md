---
id: QB-20260902-git-repository-inline-actions
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 仓库树同构行操作

## Approval

用户于 2026-09-02 审阅方案后明确表示采纳并要求开始调整设计，因此本 change 已获批准并进入实施。

## Goal

消除仓库树与独立活动仓库工具栏之间的重复和空间割裂，让父仓库与 Submodule 在同一棵紧凑树中使用相同的仓库行结构，并让行内分支、变更状态、同步和更多操作明确作用于该行仓库。

## Scope

- 把现有活动仓库工具栏合并进仓库树节点；有 Submodule 时不再额外渲染重复仓库行。
- 父仓库与可用子仓库使用相同的名称、路径、分支、变更数、ahead/behind、刷新与更多操作结构。
- 点击仓库行选择活动仓库；点击非活动行的仓库级操作时，一次完成目标切换与对应操作。
- 下方“更改”和提交图继续只展示当前活动仓库，不为每个节点复制完整工作区。
- 未初始化或无效 Submodule 继续显示生命周期动作，并不提供无效仓库操作。
- Workspace target、MRU、IPC、Rust Git 规则和远程 session ownership 保持不变。

## Non-Goals

- 不把活动 Submodule 或每行 UI 状态写入 Workspace persistence。
- 不增加 Submodule 批量操作、递归更新、URL/branch 配置或普通嵌套仓库发现。
- 不为每个仓库渲染独立更改面板、提交表单或提交图。
- 不重构后端 Git 命令、IPC DTO 或 Workspace schema。

## Requirements

- REQ-001：存在仓库树时，每个可选仓库节点必须直接展示同构的仓库级控制，包括当前分支、变更数、ahead/behind、刷新和更多菜单；独立重复的活动仓库工具栏必须移除。
- REQ-002：点击行空白区域必须切换活动仓库；点击非活动行的分支、刷新、变更数或更多菜单必须在一次操作中绑定并切换到该仓库，然后执行对应意图，不得误用此前活动仓库。
- REQ-003：分支与更多浮层必须记录仓库路径和真实触发按钮锚点；快速切换、关闭、Escape 和视口变化后不得把动作或焦点恢复到错误仓库。
- REQ-004：每行展示只能消费节点已有 snapshot；可选但尚未加载的节点必须按现有选择流程读取快照并显示局部加载状态，不新增递归预取。未初始化或无效节点只显示状态和允许的生命周期动作。
- REQ-005：下方更改、提交、Diff、冲突和提交图继续由唯一活动仓库驱动。“更改 N”行内控件只作为状态与导航入口，不复制业务面板。
- REQ-006：仓库树必须保持 tree/treeitem 与 roving focus 语义；行内按钮不得嵌套在选择按钮中，核心操作无需 hover 即可发现，选中、focus、busy、disabled、stale、窄宽和 reduced-motion 状态均可辨认。
- REQ-007：Workspace 父根 target、MRU、远程 session、后端 IPC 和 Submodule mutation owner 语义不得改变；`GitPane` baseline 不增长，新增目标绑定逻辑应归属 Git feature controller/model 或专用 presentation 组件。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-005]：父仓库和已加载 Submodule 均显示同构行内控制，旧独立 `.git-repository-row` 不再与树重复；切换活动节点后共享更改区和提交图显示对应仓库内容。
- AC-002 [REQ-002, REQ-003]：组件/集成测试证明从非活动行直接打开分支、刷新或更多菜单时使用该行路径，浮层锚定对应按钮，Escape 恢复对应按钮焦点，快速切换不会误操作旧路径。
- AC-003 [REQ-004, REQ-006]：未加载、未初始化、无效、busy、disabled、长路径、窄宽和 reduced-motion 状态保持可用；键盘树导航与行内按钮可独立操作且没有嵌套交互元素。
- AC-004 [REQ-005, REQ-007]：Workspace/MRU/session/IPC 均无契约变化；仓库操作、Submodule 生命周期和父子刷新既有测试继续通过，`pnpm check:source-size` 无 reminder。
- AC-005 [REQ-001 至 REQ-007]：受影响 Git 测试、样式契约、`pnpm check` 与 `git diff --check` 通过。

## Behavior Delta

### ADDED

- REQ-001、REQ-002：每个可用父/子仓库节点新增同构行内控制，以及从非活动行直接发起目标绑定操作的行为。
- REQ-003：仓库浮层新增明确的仓库目标和逐行锚点语义。

### MODIFIED

- REQ-005：活动仓库的分支、同步状态和菜单从树外独立工具栏迁移到选中仓库行；共享更改与提交图仍保持单实例。
- REQ-006：仓库节点从单一整行选择按钮调整为语义 treeitem 内的选择区域与独立操作组。

### REMOVED

- REQ-001：移除仓库树下方重复显示当前仓库名称、分支、同步状态、刷新和更多菜单的独立行。

## Architecture Boundary Decision

- 仓库目标与异步操作仍由 `GitPane`/repository context 编排；展示组件只发送带 `repositoryPath` 的语义事件。
- 浮层目标模型与锚点查找属于 Git feature-local UI state，不进入 Workspace、IPC 或后端。
- tree node、snapshot 和 Workspace target 继续保持分离，不引入第二个 store。

## Quality Check

- REQ-001 至 REQ-007 均由 AC-001 至 AC-005 覆盖。
- 普通选择、直接行内操作、浮层焦点、未加载/不可用节点、窄窗口与架构不变性均有可观察验收。
- 无阻塞性需求歧义；若实现需要修改 IPC、Workspace schema 或远程 session ownership，必须停止并升级为 strict。

## Open Issues

- 无阻塞项。

## Verification Outcome

- AC-001：`GitRepositoryTree` 与 GitPane 回归证明父仓库和已加载 Submodule 使用同构行，旧 `.git-repository-row` DOM/CSS 已移除；共享更改区和提交图继续跟随唯一活动仓库。
- AC-002：Submodule 集成测试证明从非活动子仓库直接打开分支或刷新时使用子仓库路径；浮层记录 `repositoryPath`，Escape 恢复对应行按钮焦点，Workspace target 未变化。
- AC-003：树组件测试覆盖 roving focus、方向键、Enter/Space、不可选节点和独立生命周期按钮；样式契约覆盖完整选中轮廓、持久行内控制、窄宽收缩与 reduced-motion。
- AC-004：Git 20 个聚焦文件、171 项测试通过；完整前端回归 84 个文件、740 项测试与 13 项 Node 测试通过。`GitPane.tsx` 保持 1149 baseline，`gitShell.css` baseline 从 901 收紧为 879，源码尺寸检查为 0 reminder。
- AC-005：`pnpm check` 通过 ESLint、Vitest、Node tests、TypeScript 与 Vite production build；`git diff --check` 通过，仅报告工作树既有的 LF/CRLF 提示。

## Completion

- 同构仓库行、逐路径浮层锚点、一次点击目标切换、共享更改/图表和不可用 Submodule 能力替换均已实现。
- `useGitRepositoryRowActions.ts` 成为逐行按钮、待执行意图和快速切换清理的独立 owner；Workspace、IPC、Rust 与 session contract 未改变。
- Directory Map 已加入新的稳定 owner；无须修改长期产品或架构 context。
- Residual risk：未在真实 Tauri SSH Submodule 项目上执行人工视觉 smoke test；本机/远程路径绑定、相同 session 路由、响应式和交互状态已有自动化保护。
