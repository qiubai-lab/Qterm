---
id: QB-20260831-git-p0-branch-sync
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git P0 分支生命周期与安全同步实施计划

## Background

现有 Git Block 已支持 snapshot、暂存、提交、分支切换、Fetch 与远程分支跟踪，但尚未形成分支重命名/安全删除、Push/Publish、FF-only Pull 和可诊断 Sync 的日常闭环。本计划在现有 domain/application/ports/adapters/commands 分层与 Git-purpose SSH session 所有权内补齐 P0。

## Fixed Semantics

- 从本地或远程完整 ref 创建分支只选择起点，不自动建立 upstream；已有“跟踪远程分支”继续承担 tracking 语义。
- 重命名保留 Git 已有 upstream 配置，不隐式重命名或删除远程分支。
- Publish 固定推送当前本地分支到用户选择 remote 的同名目标，并显式设置 upstream；tracked Push 从实际 upstream 解析 remote 与 merge ref，使用显式 refspec，不依赖 `push.default`。
- Pull 固定为 fast-forward-only；Sync 固定为 Pull 后 Push，不自动 merge、rebase 或 stash。Pull 成功而 Push 失败时保留部分成功并重读真实 snapshot。
- 网络操作超时 120 秒；进程 stdout/stderr 各受既有 8 MiB 硬上限约束；进入 WebView 的错误详情限制为 1200 字符，操作记录详情限制为 480 字符。
- adapter 在错误进入 command/WebView 前脱敏 HTTP(S)/SSH URL userinfo（含百分号编码凭据）；executable、args 和环境变量永不进入记录。
- 每次 mutation 成功或失败后均 best-effort 重读 snapshot；失败时保留最后成功 snapshot，并让 UI 标记 error/stale。Sync 使用一条总体记录并包含 Pull/Push 两步结果。

## Architecture Impact

- Domain：增加 remote 名称 snapshot、local/source ref 与 remote 名称校验，不接收命令、args、URL 或凭据。
- Ports/Application：增加 create-from、rename、safe delete、pull、push/publish 的封闭方法；application 负责统一校验与用例编排。
- Local/SSH adapters：各自只组装固定 Git 命令；SSH 继续使用既有 Git-purpose session 与 POSIX literal 编码。
- Commands/Transport：扩展 deny-unknown-fields action DTO 与稳定 snapshot DTO，不创建通用 exec API。
- Frontend：GitPane 持有 repo/branch overlays 与最多 20 条内存操作记录；不把运行态写入 Workspace persistence。

## Affected Files

- `src-tauri/src/domain/git.rs`
- `src-tauri/src/ports/git_executor.rs`
- `src-tauri/src/application/git_service.rs`
- `src-tauri/src/infrastructure/git_cli.rs`
- `src-tauri/src/infrastructure/ssh/client/git.rs`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/git.ts`
- `src/git/GitPane.tsx`
- `src/git/GitPane.test.tsx`
- `src/git/git.css`
- `src/git/gitStyles.test.ts`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Implementation Tasks

- [x] TASK-001 [REQ-001 至 REQ-004, REQ-006, REQ-007, AC-001 至 AC-004, AC-006, AC-007] 先建立 domain、strict DTO、本机/SSH adapter 与真实 bare-origin 的失败测试，覆盖非法 ref/remote、显式 refspec、无 force、FF-only、脱敏、超时和 Sync 部分成功。
- [x] TASK-002 [depends: TASK-001] [REQ-001 至 REQ-004, REQ-006, REQ-007, AC-001 至 AC-004, AC-006, AC-007] 实现 snapshot remotes、领域校验、ports/application 用例、local/SSH 固定命令和 Tauri/TypeScript transport；mutation 后 best-effort snapshot。
- [x] TASK-003 [REQ-005, REQ-006, REQ-008, AC-005, AC-006, AC-008] 先新增 GitPane 与样式失败测试，覆盖仓库菜单、Push/Publish、Sync、分支管理/删除确认、operation log、20 条上限、Escape/focus/键盘与主题紧凑布局。
- [x] TASK-004 [depends: TASK-002, TASK-003] [REQ-005, REQ-006, REQ-008, AC-005, AC-006, AC-008] 实现仓库操作菜单、remote picker、分支 create-from/rename/delete 表单、单条 Sync 两步记录与错误/stale 恢复，保持现有 branch/graph/scroll/theme 行为。
- [x] TASK-005 [depends: TASK-001 至 TASK-004] [REQ-001 至 REQ-008, AC-001 至 AC-008] 更新 Directory Map，执行 strict 聚焦/完整验证、安全静态审计并记录证据；通过后 conflict-free 归档。

## Acceptance To Verification

- VER-001 [AC-001, AC-002, AC-003, AC-004, AC-006, AC-007]：Rust domain/command/adapter 聚焦测试及真实本地 bare-origin 集成，验证 create-from、rename/delete、tracked Push、Publish、FF-only Pull、分叉拒绝、显式 refspec、URL 脱敏和 snapshot 恢复。
- VER-002 [AC-007]：SSH Git action/manager 测试断言固定 action、purpose/profile/session ownership、POSIX literal 与无任意命令字段；可用环境执行 ignored OpenSSH Git smoke。
- VER-003 [AC-005, AC-006, AC-008]：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts`，验证全部 UI 入口、状态记录、上限、可访问性、关闭行为和样式契约。
- VER-004 [AC-001 至 AC-008]：`pnpm check`、Rust fmt/clippy/tests、`git diff --check`，并静态审计无 force push、远程删除、任意命令/参数/URL 输入和 persistence/dependency 变化。

## Test Plan

1. Red：先提交 Rust domain/DTO/adapter/bare-origin 失败测试，证明新闭合 actions 尚不可用。
2. Green backend：按 domain → ports/application → adapters → commands/transport 顺序实现并运行 VER-001/VER-002。
3. Red frontend：先提交 GitPane/样式行为测试，证明 P0 入口和 operation log 尚不存在。
4. Green frontend：实现 compact overlays 与记录状态机，运行 VER-003。
5. Broad：运行 VER-004；只有本 change 的 AC 全部有证据才归档。

## Architecture Boundary Check

- Boundary Decision：branch/ref/remote 合法性属于 domain；用例顺序和 snapshot 恢复属于 application/adapter contract；命令构造只属于 adapters；commands 只做 DTO 映射；GitPane 只拥有视图 overlay 与临时记录。
- Placement：Sync 不开放单条任意后端 script；由封闭 Pull/Push 用例顺序编排并在每步返回真实 snapshot。SSH 不建立第二 session。
- Model Separation：snapshot 只新增 remote 名称，不包含 URL；operation record 是前端 view model，不进入 domain、Workspace model 或 persistence。
- Tradeoff：P0 不抽取全局 Git operation framework；先在 Git feature 内建立窄状态机，避免把高级 merge/rebase 语义提前固化。

## Critical Behavior Protection

- Coverage Decision：删除可达性、无 force、FF-only、显式 upstream/refspec、credential 脱敏、session ownership 与 Sync 部分成功属于高风险边界，必须自动化保护。
- Initial Tests：TASK-001 覆盖后端安全与真实 Git 状态，TASK-003 覆盖用户确认、顺序、可见记录与兼容 UI。
- Gaps：真实第三方 credential helper 与网络认证依赖环境；使用 non-interactive 失败 fixture 和脱敏单元测试闭合，真实 OpenSSH smoke 作为环境性补充。

## UI Style Context

- 采用 `qterm-interface-design` 的 compact dark workbench 规范：24px 级紧凑控制、单一浮层滚动 owner、主题 accent title bar、可见 focus、ARIA、Escape/focus restore 与 reduced-motion/transparency。
- 危险删除使用独立确认表单和 danger token；Push/Publish/Sync 状态不靠颜色单独表达；不新增色板或 UI 依赖。

## Related Change And Rollback

- 本 change 修改 `QB-20260830-remote-git-management` REQ-014 的 origin sync 排除边界，同时保留其 narrow IPC/session ownership。
- 回滚可移除新增 actions/menus/records，无 schema migration；已完成的 Pull/Push/Publish/安全删除是用户显式 Git 结果，不自动反向操作。

## Trigger Signals

- Architecture boundary：已触发并通过；TASK-002/004 必须保持上述 owner 分离。
- Critical behavior：已触发；TASK-001/003 必须先测试后实现。
- Directory Map：新增 actions、snapshot 字段与 UI ownership，TASK-005 必须更新。

## Independent Review

- Result：`PASS WITH NOTES`。
- Resolution：所有非阻塞 notes 已在 Fixed Semantics、TASK-001/002 与 VER-001 中固化，无需扩大范围或再次产品决策。

## Next Action

本 change 已完成实现、验证与 conflict-free 归档；后续高级 Git 能力应建立独立 change。

## Verification Result

- VER-001：domain/DTO/adapter 与真实 bare-origin 测试通过，显式覆盖 create-from、rename/upstream 保留、safe delete、Publish、tracked Push、FF-only Pull、分叉拒绝、脱敏与 `push.default`/`pull.rebase` 配置隔离。
- VER-002：Git-purpose ownership 聚焦测试及显式 OpenSSH Git smoke 通过；同一 SSH session 完成全部新增 P0 action。
- VER-003：GitPane/gitStyles 聚焦集 50 passed，包含 operation record running/success/error/duration/20-limit、Sync 部分成功与凭据脱敏。
- VER-004：`pnpm check` 通过（625 tests）；Rust fmt/clippy 通过；Rust 全量仅既有跨平台路径断言失败，跳过该单一基线后 261 passed、0 failed、4 ignored；`git diff --check`、无 force/任意命令/URL/凭据、无依赖/schema 变化审计通过。
- Documentation：Directory Map 已同步 P0 owner、安全边界与非持久状态；spec 保存完整 AC 证据和残余风险。
