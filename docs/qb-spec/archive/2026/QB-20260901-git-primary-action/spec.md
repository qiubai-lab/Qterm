---
id: QB-20260901-git-primary-action
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 状态驱动聚合按钮

## Goal

把 Git 更改区固定的“提交”按钮升级为可预测的单步聚合主按钮，根据工作树、暂存区和 upstream 状态提供当前最相关的暂存、提交、拉取、推送或发布动作，减少工作区干净时的无效提交界面，同时保留 Git 的选择性提交语义。

## Approval

用户于 2026-09-01 明确采纳评估中的推荐方案并要求开始修改：使用状态驱动的单步聚合按钮，保留选择性提交，不自动串联暂存、提交和推送。

## Scope

- 更改区主按钮从 snapshot 派生单一推荐动作、明确动词、数量和 busy 文案。
- 有已暂存更改时允许提交已暂存子集；若同时有未暂存更改，通过分割按钮菜单提供“暂存其余更改”。
- 没有已暂存更改但存在普通未暂存更改时，主按钮提供全部暂存。
- 工作区干净时根据 upstream、ahead/behind、remote、detached/unborn 派生 Push、Pull、Publish、已同步或阻塞状态。
- 单 remote 可直接发布；多 remote 复用现有发布分支选择浮层。
- 本机与 profile-bound SSH 仓库通过现有窄 action 保持相同前端语义。

## Non-Goals

- 不做一键“暂存 → Commit → Push”流水线，不在一次点击后自动执行下一阶段。
- 不强制所有工作树更改进入同一个 commit，不移除逐文件暂存/取消暂存能力。
- 不为分叉分支自动 merge/rebase，不放宽 FF-only Pull、Push refspec、remote 或 force 边界。
- 不新增 Git 后端 command、Workspace schema、持久化偏好、依赖或通用按钮框架。
- 不替代仓库操作菜单中的 Pull、Push、Sync、Publish 和操作记录入口。

## Assumptions And Constraints

- `GitSnapshot` 的 staged/worktree 双状态条目、merge state、upstream、ahead/behind 和 remotes 足以派生下一步动作；ahead/behind 代表最近 snapshot 的 remote-tracking 状态，不宣称服务器实时一致。
- `staged > 0` 的明确用户意图优先于 `unstaged > 0`，因此混合状态主动作是提交已暂存内容，菜单才提供暂存其余内容。
- 每次点击只执行一个现有窄 Git action，并等待返回的真实 snapshot 后重新派生按钮。
- merge/conflict、busy、断线、detached、unborn 和分叉状态不得误触发普通 commit/sync action。
- 聚合按钮保持 Qterm 紧凑 workbench、semantic tokens、可见 focus、menu roles、Escape/外部关闭、焦点恢复和 reduced-motion 规则。

## Requirements

- REQ-001：主按钮必须根据 snapshot 以固定优先级派生动作：merge/conflict 阻塞；已暂存内容可提交；仅未暂存内容可全部暂存；干净工作区进入远端状态动作。
- REQ-002：混合 staged/unstaged 状态必须保留选择性提交：主按钮提交已暂存内容，分割菜单提供暂存其余内容；提交仍要求非空消息，失败保留消息。
- REQ-003：干净且有 upstream 的普通本地分支必须按 tracking 状态提供 Push（仅领先）、Pull（仅落后）、分叉阻塞（同时领先落后）或无待同步内容（均为零），且不得自动合并或连续执行。
- REQ-004：干净且没有 upstream 的普通本地分支必须在单 remote 时直接发布，多 remote 时打开既有选择浮层，无 remote 时给出稳定禁用状态；detached/unborn 不得发布或同步。
- REQ-005：动作执行必须复用现有本机/SSH stageAll、commit、pull、push/publish 编排、错误恢复和操作记录；不得新增任意 Git action 输入或在成功 snapshot 返回前切换到下一动作。
- REQ-006：聚合按钮及可选菜单必须支持指针和键盘，显示准确 busy/disabled/状态文案，菜单支持 Escape、外部点击、视口变化关闭和焦点恢复；工作区干净时不得保留无意义的提交消息输入框。
- REQ-007：既有逐文件暂存、取消暂存、merge 生命周期、仓库操作菜单、commit message 草稿、图表及本机/SSH 行为必须保持兼容。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002]：纯状态测试和组件测试证明仅未暂存时显示“全部暂存”，已暂存时显示“提交已暂存更改”，混合状态仍可提交子集且菜单可以暂存其余内容。
- AC-002 [REQ-002, REQ-005]：提交消息为空时 Commit 禁用；提交失败保留消息，成功清空消息并只依据返回 snapshot 转入下一状态，且不会自动 Push。
- AC-003 [REQ-003, REQ-005]：干净 tracked 分支的 ahead-only、behind-only、diverged、0/0 状态分别映射为 Push、Pull、阻塞和无待同步；点击只调用对应一个现有 action。
- AC-004 [REQ-004, REQ-005]：无 upstream 时单 remote 直接 publish，多 remote 打开既有选择器，无 remote、detached 和 unborn 不发起网络 mutation。
- AC-005 [REQ-006]：菜单角色、键盘打开/导航、Escape、外部关闭、焦点恢复、busy 文案、干净状态隐藏消息输入框和 semantic/reduced-motion 样式均有自动化保护。
- AC-006 [REQ-007]：既有 Git 前端回归、`pnpm check`、diff 检查通过；不改变 Rust、IPC、依赖、Workspace schema 或 persistence。

## Behavior Delta

### ADDED

- REQ-001：Git 更改区新增 snapshot 驱动的下一步主动作模型。
- REQ-002：混合暂存状态新增分割菜单中的“暂存其余更改”。
- REQ-003：干净 tracked 分支新增 Push/Pull/分叉/无待同步主状态。
- REQ-004：干净 untracked 分支新增直接发布或 remote 选择入口。
- REQ-006：聚合菜单新增完整键盘、关闭与焦点生命周期。

### MODIFIED

- REQ-005：提交区从固定 Commit 控件改为每次只执行一个现有窄 Git action，并在真实 snapshot 返回后转换状态。
- REQ-006：工作区干净时不再显示无意义的提交消息输入框。
- REQ-007：Commit 的可见条件从“固定存在、条件禁用”改为“存在 staged 内容时成为推荐动作”，但选择性提交与既有 mutation 边界不变。

## Architecture Boundary Check

- Boundary Decision：动作推荐是 Git feature 的展示/编排策略，不是新的 Git domain mutation；真实 Git 前置校验继续由现有 domain/application/infrastructure 负责。
- Placement：新增 feature-local 纯模型 `gitPrimaryAction.ts`；`GitPane` 分派现有 client actions；`GitChangesSection` 与 feature-local split button 只负责展示和菜单生命周期。
- Model Separation：推荐动作 union 不进入 IPC/Workspace persistence；snapshot DTO 只作为输入，不被扩展为 UI 状态；Publish remote 仍使用现有封闭 remote 名称。
- Tradeoff：不创建通用 split-button primitive，也不重构仓库操作菜单；当前只有一个消费者，局部实现更清晰。

## Critical Behavior Protection

- Coverage Decision：聚合入口可触发多类仓库 mutation，必须先补纯状态矩阵和组件交互失败测试。
- Required Coverage：混合暂存、消息校验、单步执行、commit 后状态、ahead/behind、upstream/remotes、detached/unborn、merge/conflict、busy/断线、菜单焦点和失败恢复。
- Gaps：不新增 Rust 行为，因此复用既有真实 Git 和 SSH action 测试；本次重点验证前端不会选择错误 action 或自动串联。

## Quality Check

- Goal、Scope、Non-Goals、REQ-001 至 REQ-007 与 AC-001 至 AC-006 已闭合。
- 主路径、选择性提交、远端分支状态、失败路径、键盘路径和相关 NFR 均有验收覆盖。
- 该 change 为普通多文件 feature + standard；不改变 domain、IPC、schema、安全或部署边界，无需独立 spec review。

## Open Issues

- 无阻塞项。`ahead/behind` 只解释为最近 snapshot 状态；服务器并发变化由现有安全 Pull/Push 失败路径处理。

## Next Action

已完成实现、验证与归档；无后续阻塞动作。

## Verification Evidence

- AC-001：`gitPrimaryAction.test.ts` 与 `GitPane.basics.test.tsx` 证明仅未暂存时提供全部暂存、已暂存时提供 Commit，混合状态主动作提交已暂存子集，分割菜单可单独暂存其余内容。
- AC-002：组件测试证明空消息禁用 Commit、失败保留草稿、成功后隐藏并清空消息输入，返回 clean/ahead snapshot 后只转换为 Push 状态且不会自动 Push。
- AC-003：纯状态矩阵与 operations 测试覆盖 ahead-only Push、behind-only Pull、diverged 阻塞和 0/0 无待同步；交互断言每次只调用一个现有 action。
- AC-004：纯模型和 operations 测试覆盖单 remote 直接 publish、多 remote 复用发布选择浮层、无 remote、detached 和 unborn 禁用状态。
- AC-005：Testing Library 覆盖 ArrowDown 打开菜单、menu/menuitem semantics、Escape、外部点击、resize 关闭和焦点恢复；style contract 覆盖 semantic tokens、禁用对比与 reduced-motion，clean snapshot 证明消息输入不挂载。
- AC-006：`pnpm check` 于 2026-09-01 通过：ESLint、72 个 Vitest 文件 / 648 个测试、TypeScript 与 Vite 生产构建全部成功；`git diff --check` 通过，且 `src-tauri/`、`src/lib/tauri/git.ts`、依赖和 lockfile 无本 change 差异。

## Residual Risk

- ahead/behind 继续代表最近 snapshot 的 remote-tracking 状态，不宣称服务器实时一致；并发远端变化仍由现有安全 Pull/Push 失败路径阻断和恢复。
- 未新增真实 Git/Rust 测试，因为本次没有改变后端 mutation；本机/SSH 等价由既有 client adapter 和新增 remote aggregate routing 组件测试保护。
- Vite 仍报告部分既有 chunk 超过 500 kB；本次未新增依赖。
- 本次未运行桌面安装包构建或 Tauri 人工截图；无原生依赖、IPC 或打包配置变化，状态、布局和可访问交互由自动化测试与样式契约覆盖。
