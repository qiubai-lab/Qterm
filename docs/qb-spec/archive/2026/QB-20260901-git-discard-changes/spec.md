---
id: QB-20260901-git-discard-changes
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 变更多选与抛弃

## Goal

让 Git 变更列表保持左侧可扫读的文件名布局，并允许用户从未暂存更改中选择一个或多个文件，经明确确认后安全抛弃本地或远程工作区更改。

## Scope

- 修复变更行文件名因网格项继承居中对齐而显示在行中央的问题。
- 为未暂存、非冲突变更提供单选、Ctrl/Cmd 切换、Shift 范围选择、键盘上下文菜单和右键菜单。
- 为选中项提供带精确影响说明的紧凑确认弹窗。
- 通过封闭 Git action 在本地和远程仓库中抛弃已跟踪更改，并删除明确选中的未跟踪文件。
- 操作完成或失败后重新读取仓库快照并收敛选择状态。

## Non-Goals

- 不抛弃已暂存更改；已暂存项继续通过取消暂存处理。
- 不对冲突项提供 discard；冲突继续通过 resolver 或中止合并处理。
- 不开放任意 Git 子命令、shell 参数、仓库外路径或全仓库 clean 能力。
- 不为 discard 提供 Qterm 内置撤销或备份。

## Assumptions

- 同一路径同时存在暂存和未暂存更改时，只恢复工作区到 index 版本，保留已暂存内容。
- 未跟踪项的 discard 等价于永久删除该项；确认弹窗必须单独说明。
- 选择范围限制在未暂存、非冲突分组，避免跨语义分组产生含糊操作。

## Requirements

- REQ-001：Git 变更行的文件名必须靠左显示、保持单行省略，状态和既有行操作保持在尾部。
- REQ-002：未暂存、非冲突文件必须支持单选、Ctrl/Cmd 多选、Shift 连续选择、右键保留选择集及键盘上下文菜单。
- REQ-003：discard 执行前必须显示二次确认，准确说明选中数量、已跟踪恢复、未跟踪删除、保留内容和不可撤销性。
- REQ-004：本地与远程 discard 必须只接受通过既有路径边界验证的封闭路径集合，并在执行前依据最新快照拒绝 staged-only、冲突或不存在的选择。
- REQ-005：已跟踪修改、删除和重命名必须恢复到 index 版本；未跟踪文件必须仅删除明确选择的路径；同路径已暂存内容必须保留。
- REQ-006：忙碌、取消、失败、快照刷新和仓库切换时必须避免重复执行或保留失效选择，并向用户呈现稳定反馈。

## Acceptance

- AC-001（REQ-001）：文件图标后的路径从左侧开始显示，长路径省略，状态徽标及暂存/取消暂存按钮位置不回归。
- AC-002（REQ-002）：单击、Ctrl/Cmd、Shift、右击未选中项、右击已选中项及 Shift+F10 均产生预期选择与菜单状态。
- AC-003（REQ-003）：单项和混合多项确认弹窗显示准确数量、最多五个路径、剩余项数量，以及 tracked/untracked 的不同影响。
- AC-004（REQ-004、REQ-005）：本地临时仓库测试证明批量 tracked 修改/删除恢复、untracked 精确删除、staged 内容保留、非法或过期选择拒绝；远程 action 使用相同领域验证与固定命令边界。
- AC-005（REQ-006）：取消不触发 mutation；确认只提交冻结的选择集；忙碌时按钮禁用；成功、失败或刷新后选择状态与最新 snapshot 一致。
- AC-006（REQ-001 至 REQ-006）：相关前端测试、Rust Git 测试和 `pnpm check` 通过。

## Behavior Delta

### ADDED

- REQ-002：Git 未暂存变更列表新增可见、可访问的多选与上下文菜单交互。
- REQ-003：新增 discard 二次确认及 tracked/untracked 影响说明。
- REQ-004：新增本地与远程封闭 discard Git action。
- REQ-005：新增对选定工作区变更的恢复与未跟踪文件精确删除能力。
- REQ-006：新增 discard 的忙碌、失败和选择收敛状态。

### MODIFIED

- REQ-001：文件名从因继承网格居中而位于行中央，改为固定从图标后靠左显示。

## Quality Check

目标、范围、非目标、破坏性语义和本地/远程边界明确；REQ-001 至 REQ-006 均有对应验收。未暂存、已暂存、未跟踪、冲突和 staged+unstaged 场景已分离，没有阻塞实现的歧义。

## Blockers

无。

## Verification

- AC-001：`gitStyles.test.ts` 通过，验证文件路径 `justify-self: start`、选择态和尾部网格结构；`pnpm check` 的生产构建通过。
- AC-002、AC-003、AC-005：`GitPane.operations.test.tsx` 覆盖 Ctrl/Cmd 多选、Shift 范围、右键保持选择、Shift+F10、tracked/untracked 文案、取消、确认批次、远程路由及失败后快照恢复；聚焦 36 项测试通过。
- AC-004：domain discard plan 与本地真实 Git 仓库测试通过，覆盖 staged 内容保留、tracked 恢复、selected untracked 精确删除、未选项保留、过期路径、重复路径和 500 项上限；`cargo clippy --all-targets --all-features -- -D warnings` 通过。
- AC-006：`pnpm check` 通过（78 个测试文件、679 项测试、ESLint、TypeScript、Vite build）；`git diff --check` 通过。
- Rust 全量回归实际运行：268 项通过、4 项忽略、4 项失败。失败均位于未改动的 settings/Git fixture 测试，分别由 Windows 配置目录环境和既有 CRLF checkout 断言引起；本 change 的 discard 测试全部通过。
- `cargo fmt --check` 实际运行；本 change 涉及的 Rust 文件已无格式差异，但命令仍被未改动 Rust 文件的既有 CRLF newline style 阻塞。

## Residual Risk

- 远程 discard 的封闭 action、路径验证、命令构造和前端路由已有自动化覆盖，但需要 POSIX OpenSSH 环境的端到端测试在当前 Windows 环境中保持 `ignored`。
- 未在真实 Tauri 窗口执行截图比对；布局、选择态、菜单语义和确认行为由样式及 Testing Library 测试覆盖。
