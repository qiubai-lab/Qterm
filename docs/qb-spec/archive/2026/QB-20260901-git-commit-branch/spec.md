---
id: QB-20260901-git-commit-branch
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# 从提交创建分支

## Goal

让用户能够直接从 Git 提交图中的目标提交创建并切换到一个新本地分支，同时保持本机与 SSH 仓库语义一致，并沿用现有 Git Block 的安全输入、刷新、错误恢复和操作记录边界。

## Approval

用户已在 2026-09-01 明确要求落地此前评估的推荐方案：commit 右键菜单进入“从此提交创建分支…”，填写分支名称后创建并切换。

## Scope

- Git commit 行提供鼠标右键与键盘上下文菜单入口。
- 菜单从被触发的完整 commit OID 派生创建起点，并打开紧凑的新分支表单。
- 成功后创建新本地分支、切换到该分支、刷新 snapshot，并写入现有有界操作记录。
- 本机与 profile-bound SSH 仓库提供同一行为。
- busy、远程未连接或 merge 进行中时阻止新操作；失败显示既有稳定错误并恢复真实 snapshot。

## Non-Goals

- 不提供“只创建但不切换”的第二种模式或持久化偏好。
- 不提供 tag、cherry-pick、reset、rebase、force、任意 ref/revision 文本输入或通用 Git 命令入口。
- 不改变 commit 单击展开文件、tooltip、分支来源选择、Workspace persistence 或 SSH session 生命周期。
- 不新增第三方 UI、Git 或动画依赖。

## Assumptions And Constraints

- commit graph 已从 Git `%H` 提供完整 SHA-1 或 SHA-256 OID；显示可使用短 OID，但 mutation 必须提交完整 OID。
- commit 起点与 branch ref 起点是不同的封闭输入类型；不得放宽 merge 使用的 `validate_branch_source_ref`。
- 分支名称继续使用现有 domain 校验。commit OID 必须使用现有完整 OID 校验，拒绝短 SHA、HEAD、选项和任意 revision 表达式。
- 创建命令继续使用现有 mutation timeout、输出上限、非交互环境和失败后 snapshot 恢复。
- UI 遵守 Qterm compact workbench、semantic tokens、menu theme roles、可见 focus、Escape、焦点恢复和 reduced-motion/transparency 规则。

## Requirements

- REQ-001：用户必须能够在任一可见 commit 行上通过鼠标右键或键盘 `ContextMenu` / `Shift+F10` 打开该提交的上下文菜单；菜单必须标识被选提交并提供“从此提交创建分支…”动作。
- REQ-002：创建表单必须固定展示目标 commit 的摘要与短 OID，只允许输入新分支名称；提交成功后必须从完整目标 OID 创建并切换到新本地分支，再应用返回的真实 snapshot。
- REQ-003：本机与 SSH 仓库必须使用同一封闭的 commit 起点语义和输入校验；后端不得把 commit OID 混入 branch-ref/merge 校验，也不得接受 executable、shell、命令、参数数组、任意 revision、force、URL 或凭据。
- REQ-004：busy、远程未连接或 merge 进行中时创建动作必须不可用；错误时表单保持打开并显示稳定反馈，操作记录标记失败，前端尝试恢复真实 snapshot，且不得伪报创建成功。
- REQ-005：上下文菜单必须适配视口、支持方向键/Home/End、Escape、外部点击、滚动/缩放关闭和焦点恢复；打开菜单时不得与 commit tooltip 叠加，创建表单反馈不得改变浮层几何。
- REQ-006：现有 commit 单击展开/缓存/tooltip、分支 create-from/rename/delete、merge/sync、主题和远程 Git 行为必须保持兼容；不改变依赖、持久化或 Workspace schema。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-005]：Testing Library 覆盖鼠标右键、`ContextMenu`、`Shift+F10`、菜单定位、方向键、Escape/外部关闭和焦点恢复，并证明上下文菜单目标始终是触发的 commit。
- AC-002 [REQ-002, REQ-004]：前端行为测试证明表单显示摘要/短 OID，提交完整 OID 与名称，成功后关闭并刷新，失败时保留表单和错误，busy/merge/断线状态不可发起操作。
- AC-003 [REQ-003]：Rust domain/DTO 测试证明只接受完整 SHA-1/SHA-256 commit OID，拒绝短 SHA、HEAD、选项和任意 revision；新 action 不扩大 branch source 或 merge 输入域。
- AC-004 [REQ-002, REQ-003, REQ-004]：真实本机 Git fixture 证明从历史 commit 创建并切换，新分支 HEAD 等于目标 OID；失败路径不覆盖工作区。SSH action 测试证明使用相同封闭 action 与 POSIX literal 边界。
- AC-005 [REQ-005, REQ-006]：样式和前端回归测试证明菜单/表单使用 semantic theme roles、稳定反馈槽与 reduced-motion，并保持 commit 展开、tooltip 和既有分支管理行为。
- AC-006 [REQ-006]：相关 Vitest、`pnpm check`、Rust fmt/clippy/tests 和 diff 检查无本次新增失败；依赖、Workspace schema 与 persistence 无变化。

## Behavior Delta

### ADDED

- REQ-001：commit 行新增鼠标和键盘上下文菜单入口。
- REQ-002：用户可以从明确的历史 commit 创建并切换到新本地分支。
- REQ-003：本机与 SSH 封闭 Git action 新增 commit OID 起点能力。
- REQ-004：commit 分支创建进入现有 busy、错误恢复和操作记录闭环。
- REQ-005：commit 上下文菜单新增完整键盘、视口和焦点生命周期。

### MODIFIED

- REQ-006：现有 Git Block 的分支创建能力从当前 HEAD/branch ref 起点扩展为额外支持选中 commit OID，同时保留既有行为和边界。

## Architecture Boundary Check

- Boundary Decision：commit OID 与分支名称校验属于 `domain/git`；application/port 暴露窄用例；本机和 SSH infrastructure 只执行固定 Git 操作；commands/TypeScript 只映射封闭 DTO；GitPane 拥有菜单、表单、busy 和操作记录编排；GitCommitGraph 只上报目标 commit 与输入锚点。
- Placement：新增 sibling `create_branch_from_commit` / `createBranchFromCommit`，不放宽现有 `create_branch_from` 和 `validate_branch_source_ref`。菜单和表单保持 Git feature-local，不引入通用 context-menu 框架。
- Model Separation：显示用短 OID 不替代 mutation 使用的完整 OID；React 菜单状态不进入 Rust domain 或 Workspace persistence；Remote action DTO 显式携带 `oid` 而不是任意 source string。
- Tradeoff：接受 local/SSH adapter 各有一段很小的固定命令实现，以保持输入类型和 merge 边界清晰；不为单一新消费者重构全部分支 start-point 模型。

## Critical Behavior Protection

- Coverage Decision：该操作会修改用户仓库，并新增远程固定 action，必须先补 domain、真实本机 Git、SSH action 和前端交互回归保护。
- Required Coverage：完整 OID 校验、历史 commit HEAD 结果、local/remote DTO、菜单目标绑定、键盘/focus、失败保留与既有 commit/branch 回归。
- Gaps：真实 OpenSSH lifecycle 依赖环境，首轮以现有 SSH fixed-action/escaping 测试覆盖；最终若环境可用再运行 ignored smoke。

## Quality Check

- Goal、Scope、Non-Goals、REQ-001 至 REQ-006 与 AC-001 至 AC-006 已闭合。
- Behavior Delta 与需求一致；主路径、键盘替代路径、失败恢复、远程等价与相关 NFR 均无阻塞缺口。
- 本 change 为普通多文件 feature + standard；不涉及 schema、auth、部署、隔离或大规模重构，无需独立 spec review。

## Open Issues

- 无阻塞项。成功语义固定为“创建并切换”，已由用户采纳。

## Next Action

已完成实现、验证与归档；无后续阻塞动作。

## Verification Evidence

- VER-001 / AC-001、AC-002、AC-005：`GitPane.graph.test.tsx` 覆盖鼠标右键、`ContextMenu`、`Shift+F10`、Home/End、Escape、外部点击、焦点恢复、tooltip 抑制、目标 commit 摘要/短 OID、完整 OID 提交、成功关闭和失败保留；相关 Git 聚焦测试共 41 项通过。
- VER-002 / AC-003：`domain::git::tests::remote_actions_allow_posix_paths_but_reject_nul_and_unvalidated_payloads` 与 `commands::git::tests` 通过，证明完整 OID 与 branch/merge ref 分离、DTO 拒绝任意 `revision` 和未知进程字段。
- VER-003 / AC-004：`infrastructure::git_cli::tests::real_git_creates_and_switches_branch_from_historical_commit` 通过，证明新分支 HEAD 和工作树均来自目标历史 commit；SSH Git session ownership/action 路由测试通过。
- VER-004 / AC-005、AC-006：`pnpm check` 于 2026-09-01 通过：ESLint、71 个 Vitest 文件 / 636 个测试、TypeScript 检查与 Vite 生产构建全部成功；`gitStyles.test.ts` 覆盖 semantic menu roles、禁用对比、稳定反馈槽与 reduced-motion。
- VER-005 / AC-006：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 与 `git diff --check` 通过；真实本机 Git、commands 和 SSH 聚焦测试通过。
- VER-006 / AC-006：`cargo test --all-targets --all-features` 运行 270 项：本次相关测试全部通过；总结果为 265 passed、1 failed、4 ignored，唯一失败是改动前已存在的 macOS 路径断言 `validate_paths("C:/absolute.txt")`，与本次 commit OID action 无关。

## Residual Risk

- 真实远程 OpenSSH lifecycle 测试仍因需要本机 sshd 环境而保持 ignored；远程路径由严格 action DTO、domain validation、session ownership dispatch 和现有 POSIX literal 单元测试覆盖。
- Vite 仍报告部分既有构建 chunk 超过 500 kB；本次未新增依赖或 chunk 边界。
- 仓库既有的跨平台 Windows 风格绝对路径测试在 macOS 失败，导致 Rust 全量命令非零退出；本次没有扩大 `validate_paths` 或路径输入域。
