---
id: QB-20260902-git-repository-tree-navigation
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 存储库树与 Submodule 上下文切换执行计划

## Requirement

实现 `QB-20260902-git-repository-tree-navigation` 的 REQ-001 至 REQ-011；产品行为、兼容边界与验收以对应 spec 为事实源。用户已明确批准实施。

## Scope

- 固定 Workspace Git target 为父仓库根，在 Git feature 内增加 runtime 活动节点和逐层仓库树。
- 合并存储库/Submodule 展示，并让既有 Git 工作台能力按活动节点执行。
- 保留 Workspace v10、Git IPC、domain、application、local/SSH executor 和既有 Submodule mutation 规则。
- 不实现完整递归扫描、活动节点持久化、普通嵌套仓库发现或 Submodule 配置 CRUD。

## Affected Files

- `src/git/GitPane.tsx`：稳定组合入口；移除 Submodule target retarget 与独立 section wiring，接入活动仓库 controller。
- `src/git/gitRepositoryContext.ts`（新增）：根 target、相对节点 identity、节点树派生、路径边界和纯状态变换。
- `src/git/useGitRepositoryContext.ts`（新增）：活动 snapshot、懒加载、epoch、父子刷新和节点切换编排。
- `src/git/GitRepositoryTree.tsx`（新增）：紧凑 tree/treeitem 展示、选择、展开、键盘与节点次级动作。
- `src/git/GitPaneSections.tsx`：让 repository section 接收树 surface；移除 `GitSubmodulesSection`。
- `src/git/gitPaneTypes.ts`、`src/git/gitSnapshot.ts`：仅在需要时补充 feature-local 状态或 snapshot 等价辅助，不扩展 IPC DTO。
- `src/git/git.css`、`src/git/styles/gitSubmodules.css`、`src/git/styles/gitRepositoryTree.css`（新增/替换）：移除独立 section 布局，增加仓库树选中、滚动和响应式状态。
- `src/git/GitPane.submodules.test.tsx`：改写为树导航、节点生命周期与父子刷新行为测试；必要时按能力拆成 `GitRepositoryTree.test.tsx`、`gitRepositoryContext.test.ts` 和 `useGitRepositoryContext.test.tsx`。
- `src/git/GitPane.basics.test.tsx`、`GitPane.operations.test.tsx`、`GitPane.branches.test.tsx`、`GitPane.graph.test.tsx`：保护活动节点切换后的现有能力、epoch 和展示。
- `src/workspace/LayoutView.test.tsx`、`useGitWorkspaceController.test.ts`、`gitRepositoryHistory.test.ts`、`reducer.test.ts`：证明选择 Submodule 不 retarget、不写入 MRU、不重连，Workspace schema/行为不变。
- `scripts/source-size-baseline.json`：仅在 `GitPane.tsx` 实际缩小时收紧 baseline。
- `docs/qb-spec/DIRECTORY_MAP.md`：实施形成稳定的新 ownership 后更新。
- 本 spec 与 plan：记录批准、实施和验证证据。

## Design

### State ownership

- Workspace `GitTarget` 是唯一持久化根身份，继续决定 local/remote scope 和 Git-purpose session。
- `gitRepositoryContext` 使用 `root` 加 repository-relative node identity 描述树；不把绝对活动路径写回 Workspace。
- controller 分离 `rootSnapshot`、`activeSnapshot`、已加载节点 cache、expanded/selected state 和 request epoch。
- 当父根为活动节点时允许 root/active 共享同一 snapshot 事实，但对外保持角色清晰，避免后续 mutation 更新错误对象。

### Loading and mutation

- 初始只读取父根 snapshot，并从其中建立直接子节点。
- 选择或展开已初始化节点时，按需读取该节点 snapshot，并把其直接 Submodule 合并到 tree cache。
- 每次活动节点切换使旧节点详情、选择、提交消息、浮层和操作记录失效；snapshot/diff/conflict 请求按 context epoch 拒绝迟到结果。
- 子仓库 mutation 成功后先应用活动 snapshot，再读取直接父节点 snapshot 更新树摘要；任一步失败都保留最后可用状态并给出明确反馈。
- 初始化与 checkout-recorded 从节点的直接父仓库发起，不能误用持久化根或当前活动孙节点作为 owner。

### UI and accessibility

- 无 Submodule 时复用当前单仓库卡片密度；存在子节点时在同一 repository section 内渲染树。
- 整行是仓库选择入口，次级动作使用独立 button 并阻止触发 selection；选中态复用 file/path full-outline tokens。
- 根节点默认展开；已加载且存在 children 的节点提供 disclosure。未初始化/无效节点可聚焦读取状态，但不可成为活动仓库。
- 树实现 roving focus、方向键、Home/End、Enter/Space、`aria-selected` 和 `aria-expanded`；核心动作常驻。
- repository section 拥有唯一内部滚动区；Changes/Graph 的既有滚动 ownership 不变。

### Boundaries

- presentation 不调用 Tauri；所有读取和 mutation 继续通过 `useGitRepositoryClient` 的语义方法。
- 不新增 Workspace action/store，不改变 `GitTarget`、MRU record、remote action union 或 Rust DTO。
- 不在前端生成 Git 命令；活动执行路径只能由父根和 snapshot 提供的验证相对路径派生。
- `GitPane.tsx` 是 baseline hotspot，先提取 controller/model/tree，再接线；不得把新状态机直接追加到 façade。

## Implementation Tasks

- [x] 在 spec 获明确批准后，将 spec/plan 状态更新为 `active`，记录批准说明并再次确认 standard tier 未触发升级条件。
- [x] 先为根 identity、相对节点、逐层 children、不可选状态、重复/cycle 防御和安全路径派生编写纯模型失败测试，再实现 `gitRepositoryContext.ts`。
- [x] 为初始根加载、活动节点切换、懒加载、epoch 丢弃、局部失败、子 mutation 后父子刷新编写 controller/集成测试，再实现 `useGitRepositoryContext.ts`。
- [x] 为 tree/treeitem、整行选择、disclosure、roving focus、键盘操作、disabled 节点和次级动作隔离编写组件测试，再实现 `GitRepositoryTree.tsx`。
- [x] 重构 `GitRepositorySection` 接入树，删除 `GitSubmodulesSection` 及其独立 empty/collapse/scroll 状态；无 Submodule 时保持单卡片兼容。
- [x] 将 `GitPane` 的 snapshot consumer、branch/change/graph/diff/conflict/mutation root 全部切换为活动 repository context，并让节点变化复用现有局部状态清理语义。
- [x] 保留初始化/checkout-recorded 的直接父 owner 语义；增加活动子仓库 mutation 后父摘要刷新和失败/stale 反馈。
- [x] 移除 `openSubmodule -> onTargetChange`，限制 `onRepositoryOpened` 只报告持久化父根；增加 Workspace/MRU/remote session 不变性回归测试。
- [x] 用 `gitRepositoryTree.css` 替代独立 section 样式，验证单一滚动 owner、长路径、窄窗口、主题、selected-over-hover、focus-visible 和 reduced-motion。
- [x] 运行源码尺寸门禁；保证 `GitPane.tsx` 不增长且无 ratchet reminder，不通过新增例外规避拆分。
- [x] 更新 Directory Map 中 GitPane façade、repository context/controller/tree 的稳定职责，并回写验证证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `gitRepositoryContext`/controller、`LayoutView`、`useGitWorkspaceController`、MRU 与 reducer 聚焦测试；检查 Workspace model/JSON schema 无 diff |
| AC-002 | `GitRepositoryTree`、GitPane Submodule 测试与 CSS contract 断言；`rg` 确认不再渲染 `git-submodules-section` |
| AC-003 | GitPane basics/branches/operations/graph/diff/conflict 聚焦测试，加入快速父子切换和迟到结果 fixture |
| AC-004 | controller 与 GitPane mutation 测试，断言动作 owner path、活动/直接父 refresh 次序及失败/stale 保留 |
| AC-005 | 纯模型和 client mock 测试，覆盖逐层加载、未展开无请求、非法路径、duplicate/cycle 与局部加载失败 |
| AC-006 | Testing Library 键盘/ARIA/focus/鼠标次级动作测试及受影响 CSS 状态断言 |
| AC-007 | `pnpm check:source-size`、受影响 Vitest、`pnpm check`、`git diff --check`，并检查 baseline 无增长或 ratchet reminder |

## Test / Verification

按成本从低到高执行；后续代码改动只重跑被其影响的证据：

1. `pnpm exec vitest run src/git/gitRepositoryContext.test.ts src/git/useGitRepositoryContext.test.tsx src/git/GitRepositoryTree.test.tsx`
2. `pnpm exec vitest run src/git/GitPane.submodules.test.tsx src/git/GitPane.basics.test.tsx src/git/GitPane.operations.test.tsx src/git/GitPane.branches.test.tsx src/git/GitPane.graph.test.tsx`
3. `pnpm exec vitest run src/workspace/LayoutView.test.tsx src/workspace/useGitWorkspaceController.test.ts src/workspace/gitRepositoryHistory.test.ts src/workspace/reducer.test.ts`
4. `pnpm check:source-size`
5. `pnpm check`
6. `git diff --check`

若实施修改任何 Rust、IPC DTO、remote action union 或 Workspace persistence schema，停止当前 standard 计划，升级规格后再定义相应 Rust fmt/Clippy/test 与迁移门禁。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`，把活动仓库 context/controller/tree 的 owner 和 GitPane façade 边界写成稳定结构入口。
- 不自动修改长期 `PRODUCT_SPEC`、`ARCHITECTURE_SPEC` 或 `DECISIONS`；若完成后希望把“Git target 永远代表父根”提升为长期产品规则，需用户另行明确批准。
- 完成验证后把证据写回 spec/plan，再由标准完成流程无冲突归档。

## Dependencies

- 依赖已归档 `QB-20260902-git-submodule-management` 提供的 snapshot metadata、初始化、checkout-recorded、gitlink 语义和 same-profile Git session 能力。
- 无外部服务或数据迁移依赖。
- model、controller 和 tree 测试可以分阶段独立建立，但 GitPane 接线必须在它们的契约稳定后进行。

## Style Context

- 使用 Qterm compact dark workbench 与语义主题 token；仓库树属于 dense file/path selection surface，而非 tabs 或 manager dialog。
- selected 使用完整 inset outline、surface、foreground 与 ARIA，selected-over-hover 优先；accent 只表达活动/状态，不形成大面积装饰。
- 核心选择和生命周期动作持久可见；单一滚动 owner、`min-width: 0`/`min-height: 0`、focus-visible、reduced-motion 和窄窗口是阻断约束。

## Trigger Signals

- Architecture boundary：已触发。实施前按本 plan 的 Workspace / feature controller / presentation placement 做聚焦边界检查。
- Critical behavior：已触发。节点 identity、epoch、mutation owner、父子 refresh、MRU 和 session 不变性必须先有失败测试。
- Directory Map：新增稳定 context/controller/tree ownership 后必须更新。
- Tier escalation：若需要 schema、IPC、Rust domain、安全或 session ownership 改动，必须停止并升级为 strict。

## Verification Evidence

- AC-001、AC-003、AC-004、AC-005：`pnpm exec vitest run src/git src/workspace/LayoutView.test.tsx src/workspace/useGitWorkspaceController.test.ts src/workspace/gitRepositoryHistory.test.ts src/workspace/reducer.test.ts` 通过，24 个文件、231 项测试成功。
- AC-002、AC-006：`GitRepositoryTree.test.tsx`、`gitRepositoryContext.test.ts`、`GitPane.submodules.test.tsx` 与 `gitStyles.test.ts` 覆盖树语义、路径、生命周期、selected/focus/reduced-motion 样式契约及旧 section 移除。
- AC-007：`pnpm check` 通过，源码尺寸 0 reminder、ESLint 无 warning、84 个 Vitest 文件/740 项测试、13 项 Node 测试、TypeScript 与 Vite production build 全部成功；`git diff --check` 和新增文件 whitespace 检查通过。
- 非阻断信息：Vite 报告仓库既有的 minified chunk 大小 warning；本 change 未新增依赖或改变 bundling boundary。
