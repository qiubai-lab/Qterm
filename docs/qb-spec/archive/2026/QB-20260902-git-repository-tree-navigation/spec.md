---
id: QB-20260902-git-repository-tree-navigation
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 存储库树与 Submodule 上下文切换

## Approval

用户于 2026-09-02 审阅 spec 与 plan 后明确要求开始编码；本规格据此获批准并进入实施。

## Change Shape

- Type：`design`。本 change 重新定义 Git Block 中持久化仓库身份、活动仓库上下文和 Submodule 导航的关系，并据此调整用户可见交互。
- Tier：`standard`。变更需要协调多个前端状态、组件、样式与测试文件，但计划不修改 Workspace schema、Git domain、IPC DTO、后端命令面或既有 Submodule mutation 安全规则。
- Escalation trigger：若实现证明必须新增持久化字段、扩展后端路径协议、放宽远程 session ownership 或修改 Submodule mutation 规则，必须在编码前把本 change 升级为 `strict` 并重新审查规格。
- Related change：`QB-20260902-git-submodule-management` 已建立直接 Submodule 状态、生命周期动作和父仓库 gitlink 语义；本 change 只重构其导航与展示模型，不取代其余安全行为。

## Goal

让一个 Git Block 始终以用户选择的父仓库作为稳定工作区身份，同时把父仓库及其已发现的 Submodule 组织为紧凑的仓库树。用户通过选择树节点切换分支、变更、提交图和仓库操作上下文，不再进入独立“子仓库”区段，也不会因浏览 Submodule 而丢失父仓库路径和操作连续性。

## Current Behavior

- Workspace `GitTarget` 同时承担持久化仓库身份和当前 Git 工作目录。
- Submodule 在“存储库”和“更改”之间拥有独立的“子仓库 N”区段。
- 点击“打开”会把 Git Block target 改为 Submodule 的绝对路径，并把该路径写入 Workspace 与最近仓库历史。
- target 变化会清理 Git Pane 的异步 epoch、选择、预览、操作记录和浮层状态；这保证了隔离，但也使父子仓库导航表现为完整换仓。

## Scope

- 保持 Git Block 的持久化 `GitTarget` 始终指向用户选择的父仓库根及原 remote profile。
- 在“存储库”区段内展示父仓库与 Submodule 的紧凑父子树，并移除独立 Submodule 区段。
- 引入仅属于当前 Git Pane runtime 的活动仓库节点；默认选中父仓库，节点使用相对父根的稳定 identity。
- 选择任一已初始化、有效节点后，现有分支、变更、提交、同步、合并、冲突、Diff 和操作记录能力全部作用于该节点仓库。
- 保留父仓库摘要，使用户在子节点上下文中仍能看到父子关系、状态和当前选择。
- 对已加载节点按需发现其直接 Submodule，并以懒加载方式逐层扩展树；查询保持只读、非递归，不预扫描完整后代。
- 保留初始化与“检出记录版本”等 Submodule 生命周期动作，并将它们放在对应树节点的次级动作区域。
- 保持本机与同 profile SSH Git session 的现有能力和安全边界。
- 为节点切换、迟到请求、父子刷新、MRU/持久化不变性、键盘树交互和紧凑布局增加自动化保护。

## Non-Goals

- 不发现普通嵌套 `.git` 仓库，只展示正式 Git Submodule。
- 不一次性递归扫描全部 Submodule，不提供批量初始化或递归更新。
- 不增加 Submodule add/remove/deinit、URL/branch 编辑、update-remote、force 或凭据管理。
- 不改变父仓库 gitlink 的 stage/unstage/discard 语义，也不改变初始化/checkout-recorded 的后端规则。
- 不持久化 snapshot、展开状态、busy/error、操作记录或绝对子模块路径。
- 首期不要求应用重启后恢复上次活动 Submodule；重新载入默认回到父仓库。
- 不新增通用 SCM tree、全局状态库、UI 依赖、图标体系或主题 token。
- 不借本 change 重构全部 GitPane、Workspace 或后端 Git 模块。

## Assumptions And Constraints

- 用户所说“仓库路径仍然保存在父仓库目录”解释为：Workspace target 与 MRU 的稳定身份只记录父仓库；活动节点是独立 runtime selection。
- 活动节点 identity 必须是从已验证 snapshot 元数据得到的相对路径链；不能由自由文本、任意绝对路径或 `..` 构造。
- 一个节点的 snapshot 只描述该仓库及其直接 Submodule；后代只能在父节点已加载且有效时按需发现。
- 父仓库 snapshot 与活动子仓库 snapshot 是独立事实。子仓库 mutation 后必须重新读取受影响节点，并刷新其父节点摘要，不能在前端猜测 gitlink 状态。
- 选中节点变化必须拥有与当前 target 变化等价的 epoch 隔离和局部状态清理，但不得触发 Workspace retarget、remote reconnect 或新的认证流程。
- UI 遵守 Qterm compact workbench、file/path selection、持久核心动作、单一滚动 owner、键盘 focus、reduced-motion 和主题语义 token 约束。
- `src/git/GitPane.tsx` 已受源码尺寸 baseline 约束。本 change 必须通过能力模块提取让该文件不增长，并在实际缩小时同步收紧 baseline。

## Options Evaluated

### Option A：继续切换 Workspace target，仅合并视觉区段

- 优点：代码改动最小，可沿用现有 target reset。
- 缺点：子模块路径仍替换父仓库持久化身份，MRU、远程 retarget 和操作心智模型继续割裂。
- 结论：拒绝。它只隐藏问题，没有改变状态所有权。

### Option B：固定父仓库 target + runtime 活动节点树（推荐）

- 优点：父仓库身份稳定；所有 Git 能力在同一 Block 内连续切换；无需 schema 或后端命令面变化。
- 缺点：前端需要同时管理根摘要和活动 snapshot，并显式处理节点切换竞态与父子刷新。
- 结论：采用。复杂度集中在可测试的 feature model/controller 中。

### Option C：持久化完整仓库树和活动节点

- 优点：重启后可恢复完整导航状态。
- 缺点：需要 schema 迁移、失效路径恢复、远端状态漂移处理，并会把可再生 Git 内容写入 Workspace。
- 结论：首期拒绝；收益不足以覆盖持久化和兼容成本。

## Requirements

- REQ-001：Git Block 的持久化 `GitTarget` 和最近仓库身份必须始终保持为用户选择的父仓库根；选择或操作 Submodule 不得把绝对子模块路径写入 Workspace、MRU 或 remote runtime target。
- REQ-002：“存储库”区段必须在父仓库存在 Submodule 时升级为紧凑父子树，父仓库为根节点，独立“子仓库 N”区段必须移除；无 Submodule 时保持当前单仓库卡片的紧凑表现，不显示空树或“子模块 0”。
- REQ-003：树必须具有唯一活动节点。选择已初始化且有效的仓库节点后，仓库标题、路径提示、分支、ahead/behind、Fetch/Pull/Push、分支管理、变更、提交图、Diff、冲突和提交操作必须一致地使用该节点 snapshot 与工作目录。
- REQ-004：活动节点只存在于 Git Pane runtime，初始与重新挂载时默认父仓库。切换节点必须提升独立 request epoch，清理只属于旧节点的提交消息、选择、预览、冲突、菜单、操作记录和 pending mutation，迟到结果不得覆盖新节点状态。
- REQ-005：树节点必须继续展示 Submodule 初始化、配置问题、gitlink conflict、记录提交变化和内部 dirty 状态。无效或未初始化节点保持可见但不可选；允许的初始化和 checkout-recorded 动作继续使用既有单项、安全、非递归后端能力。
- REQ-006：已加载节点可以按需发现并展开其直接 Submodule。发现必须逐层、只读、非递归、无网络 mutation；折叠或未访问分支不得触发完整后代扫描，任一失败不得阻塞已加载节点的 Git 操作。
- REQ-007：活动子仓库成功 mutation 后必须刷新活动 snapshot 以及拥有该节点的直接父仓库摘要；失败、断线或结果不确定时保留最后可用树状态并显示 stale/error，不能根据旧 snapshot 乐观伪造父仓库状态。
- REQ-008：本机节点切换不得调用 `onTargetChange`；同 profile SSH 节点切换必须复用当前 connected Git-purpose session，不重新认证、不改变 session ownership，也不得接受 snapshot 之外的绝对路径、父目录或跨根路径。
- REQ-009：仓库树必须使用语义化 `tree`/`treeitem`、`aria-selected`/`aria-expanded`，支持方向键、Home/End、Enter/Space 和可见 focus。选中态同时使用 surface、完整轮廓、文字层级和语义属性；核心选择与生命周期动作不能只在 hover 时出现。
- REQ-010：仓库区段必须只有一个明确滚动 owner，长名称、深层路径、窄窗口、loading/busy/error/disabled/stale 与 reduced-motion 状态均保持可用；活动仓库名称和父根路径必须同时可辨认，避免对错误仓库执行提交或同步。
- REQ-011：活动仓库选择、树缓存和切换编排必须拥有独立 feature model/controller；`GitPane` 只负责组合，presentation 不直接调用 Tauri，Workspace 不建立第二个 Git store，既有 IPC 与后端 domain/application/infrastructure 边界保持不变。

## Primary, Alternate And Recovery Scenarios

1. 父仓库没有 Submodule：存储库区保持单卡片，所有行为与当前普通仓库一致。
2. 父仓库有一个干净、已初始化的 Submodule：树显示根和子节点；点击子节点后分支、更改和提交图切换到子仓库，Workspace target 与 MRU 仍为父根。
3. 当前子仓库有未提交内容：父树节点展示内部 dirty 状态；用户可在同一 Block 中处理和提交，完成后子节点和父摘要刷新。
4. Submodule 未初始化或配置无效：节点可见并说明原因，不允许选中；有效未初始化节点仍可执行初始化。
5. 子仓库自身包含 Submodule：首次只显示已加载层级；选择或展开子仓库后按需读取其直接子节点，不扫描更深后代。
6. 用户快速在父、子节点间切换：旧 snapshot、diff 或 mutation 结果被 epoch 丢弃，界面最终只显示最后选中节点。
7. SSH 连接断开时选择已缓存节点：保留树和最后 snapshot 并标记 stale，不新建连接；重连后按当前活动节点刷新。
8. 应用重启或 Git Pane 重新挂载：父仓库从既有 target 恢复并成为活动节点，不尝试恢复旧绝对子模块路径。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-004, REQ-008]：本机和 SSH 组件/controller 测试证明选择父、子和已加载后代不会调用 Workspace retarget、写入子模块 MRU 或触发 SSH reconnect；重新挂载默认父仓库，既有 Workspace v10 round-trip 无变化。
- AC-002 [REQ-002, REQ-005, REQ-009, REQ-010]：Testing Library 与样式断言覆盖无 Submodule、单个、多个、长路径、未初始化、配置错误、conflict、dirty、selected、focused、busy、disabled、stale、窄窗口和 reduced-motion；独立 Submodule section 不再渲染。
- AC-003 [REQ-003, REQ-004]：选择节点后所有仓库级展示和 mutation 都收到该节点工作目录；提交消息、选择、Diff/冲突/菜单/操作记录按节点切换清理，快速切换时迟到 snapshot 与详情结果不会覆盖当前节点。
- AC-004 [REQ-005, REQ-007]：初始化、checkout-recorded 和活动子仓库 mutation 的测试证明动作仍作用于正确父/子路径，成功后刷新活动节点与直接父摘要；失败或未知结果保留最后状态并显示错误/stale。
- AC-005 [REQ-006, REQ-008]：纯模型与 client 测试覆盖直接子节点、逐层懒加载、重复/循环 identity、防止绝对路径/`..`/跨根路径以及局部加载失败；未展开分支不会产生后代 snapshot 请求。
- AC-006 [REQ-009]：键盘测试覆盖树的上下移动、Home/End、左右展开折叠、Enter/Space 选择、disabled 跳过、focus 保持与 ARIA 属性；鼠标整行选择和次级动作互不误触。
- AC-007 [REQ-001 至 REQ-011]：`pnpm check:source-size`、Git/Workspace 聚焦 Vitest、`pnpm check` 与 `git diff --check` 通过；`GitPane.tsx` 不超过既有 baseline，若实际缩小则 baseline 同步收紧且无 ratchet reminder。

## Behavior Delta

### ADDED

- REQ-003、REQ-004：Git Block 新增独立于持久化 target 的活动仓库上下文，并以同一套 Git 工作台能力切换父子仓库。
- REQ-006、REQ-007：新增逐层懒加载的仓库树缓存，以及活动节点 mutation 后的父子 snapshot 刷新行为。
- REQ-009：新增完整的仓库树选择、展开和键盘语义。

### MODIFIED

- REQ-001：此前“打开 Submodule”会把 Git target 和 MRU 切到绝对子模块路径；现在改为保留父根，只切换 runtime 活动节点。
- REQ-002、REQ-005：此前 Submodule 在独立“子仓库 N”区段通过“打开”按钮进入；现在合并到存储库父子树，整行选择仓库上下文，生命周期动作保留为次级操作。
- REQ-008：此前同 profile SSH 通过 target retarget 复用 session；现在节点切换不再 retarget Workspace/runtime，只在既有 session 内对受验证节点目录执行 Git action。

### REMOVED

- REQ-002：移除独立 Submodule 分区及其空状态。
- REQ-001：移除把 Submodule 绝对路径作为浏览结果写入 Workspace target 和最近仓库历史的行为。

## Compatibility And Recovery

- Workspace schema 与已保存 Git target 保持兼容，无迁移或回写步骤。
- 既有已保存为 Submodule 绝对路径的 Git Block 无法可靠推断其历史父仓库；它继续被视为普通根仓库，不进行猜测性迁移。
- 若 feature controller 实现需要回滚，可恢复原 Submodule section 与 target retarget；不涉及用户数据格式回滚。
- 回滚不反转用户已经执行的 Git commit、init、checkout 或分支操作。

## Architecture Boundary Decision

- Boundary Decision：Workspace 继续只拥有父根 `GitTarget`；Git feature controller 拥有活动 node、tree cache、epoch 和父子刷新；presentation 只渲染并发出语义事件。
- Placement：相对节点 identity、可选/可展开规则和路径派生放入纯 feature model；异步 snapshot/mutation 编排放入 feature hook/controller；`GitRepositoryTree` 拥有树语义与键盘交互；`GitPane` 保持组合 façade。
- Model Separation：Workspace target、runtime node identity、Git snapshot、Submodule DTO 和绝对执行路径保持独立。tree node 不作为 persistence record 或新的 IPC DTO。
- Tradeoff：首期允许 mounted Git Pane 缓存已访问节点 snapshot，以避免重复读取；不建立跨 Block/global cache，也不保证重启恢复展开位置。

## Quality Check

- Goal、Scope 与 Non-Goals 已明确区分导航重构和既有 Submodule 安全能力。
- REQ-001 至 REQ-011 均有 AC-001 至 AC-007 覆盖，Behavior Delta 与需求一致。
- 普通、无子模块、未初始化、嵌套、快速切换、远程断线和重启场景均有可观察结果。
- 持久化、远程 ownership、路径安全、源码尺寸、可访问性和布局 NFR 已量化为阻断验收。
- 无阻塞性需求歧义；“活动节点不跨重启持久化”作为显式首期决策等待用户随规格一并批准。

## Open Issues

- 无阻塞项。
- 如未来希望恢复上次活动 Submodule，需以独立 change 评估持久化、失效恢复和 schema tier。

## Verification Outcome

- AC-001：GitPane 本机/SSH 回归证明节点切换只调用当前 Git client 的 child snapshot/action 路径，不调用 `onTargetChange`；`onRepositoryOpened` 只报告父根。Workspace target、MRU model、controller 与 reducer 聚焦测试全部通过，未修改 Workspace v10 或 Rust persistence。
- AC-002：仓库树组件和 GitPane Submodule 测试覆盖无子模块兼容、父/子树、未初始化、dirty、selected、disabled 和独立 Submodule section 移除；样式 manifest/contract 测试通过，CSS 使用既有 file/path active/selection、focus、warning 和 reduced-motion 语义角色。
- AC-003：GitPane basics、branches、operations、graph、diff/conflict 回归覆盖活动工作目录、节点切换清理、后台刷新、mutation/background epoch、preview/cache 隔离和仓库级操作；完整 Git/Workspace 聚焦结果为 24 个文件、231 项通过。
- AC-004：Submodule 初始化、checkout-recorded、child stage 和失败恢复测试证明动作使用直接父/活动子路径；失败后重新读取 owner repository，保留最后可用树并显示原始错误。
- AC-005：纯模型测试覆盖逐层已加载 snapshot、展开前隐藏后代、invalid absolute/drive/parent/empty/NUL path、不可选节点和 visited identity 防循环；远程测试证明 child snapshot 继续使用同一 session/profile。
- AC-006：Testing Library 覆盖 ArrowUp/Down/Left/Right、Home/End、Enter/Space、roving focus、`tree/treeitem`、`aria-selected/expanded/disabled`、鼠标选择和次级动作隔离。
- AC-007：`pnpm check:source-size` 通过且 0 ratchet reminder，`GitPane.tsx` 保持既有 baseline；`pnpm check` 通过，包括 ESLint、84 个 Vitest 文件/740 项测试、13 项 Node 测试、TypeScript 和 Vite production build；`git diff --check` 与新增文件 whitespace 检查通过。

## Completion

- Behavior Delta：REQ-001 至 REQ-011 已实现；父根 target/MRU 保持不变，活动仓库、懒加载树、父摘要刷新、键盘树语义和独立 Submodule section 移除均有自动化证据。
- Architecture：Workspace、runtime repository context、snapshot DTO 和执行路径保持分离；新增纯模型、controller hook、presentation tree 与纯 view model，GitPane 继续作为不增长的组合 façade。
- Documentation：`docs/qb-spec/DIRECTORY_MAP.md` 已更新稳定 owner 与样式边界。
- Residual risk：未执行真实大型远程 Submodule 树的视觉/延迟人工 smoke test；固定 session/profile 路由、逐层请求、失败恢复和窄窗口样式契约已有自动化覆盖。Vite 保留仓库既有大 chunk 非阻断 warning。
