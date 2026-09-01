---
id: QB-20260901-git-conflict-resolution
tier: strict
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: ../specs/QB-20260901-git-conflict-resolution.md
---

# Git 合并冲突解决器实施计划

## Background

`QB-20260831-git-branch-merge` 已完成 merge/continue/abort、真实 `MERGE_HEAD` 恢复和外部编辑后 stage 的安全骨架，但冲突 change 仍被压缩为布尔值，Git Block 无法读取 index stage、展示三方内容或安全写回结果。本 change 在不放宽任意 Git/文件/SSH 能力的前提下补齐应用内解决闭环。

## Requirement

执行 spec 的 REQ-001 至 REQ-012：为本机和 profile-bound SSH merge 冲突提供分类、详情、受限文本编辑、文件级采用/删除、单 path 标记解决、manager UI 与失败恢复，同时保持既有 Git 和 Files 行为。

## Non-Goals

- 不实现逐块 diff/accept、其他 Git operation 冲突、自定义 driver 或通用 mergetool。
- 不把 unsupported rename/symlink/submodule/mode-only 冲突伪装为文本。
- 不新增通用 shell、任意 revision、通用文件写入、额外 SSH session、Workspace/persistence schema。

## Architecture Impact

- Domain：新增 `GitConflictKind`、冲突版本/详情、resolution choice、relative path/content/revision validators；继续拥有 merge/index 前置规则。
- Application/Ports：Git executor 增加 conflict detail 和 resolve 用例；remote executor 增加同语义的专用调用，不改变通用 snapshot action result。
- Infrastructure：local Git adapter 解析 porcelain `u XY` 和 `ls-files -u -z`，读取固定 `:1/:2/:3` index stage；SSH adapter 使用固定命令、POSIX literal 与有界 stdin 执行同一操作。
- Commands/Transport：增加严格 local/remote conflict detail/resolve DTO；remote 必须携带 session/profile/repository/path，并复用 Git-purpose ownership。
- Frontend：transport model 与 feature-local resolver 草稿分离；GitPane 只编排 client、snapshot 和 dialog，resolver 负责 presentation/焦点，不直接 invoke。

## Domain Model Impact

- `GitChange` 增加 nullable/optional `conflict_kind`，仅 conflict change 必须存在。
- `GitSnapshot` 增加 nullable `merge_head_oid` 与可选匹配显示名，不持久化。
- `GitConflictDetail` 表达 path、kind、Base/Current/Incoming versions、result content/revision、editable/unsupported reason。
- `GitConflictResolution` 只允许 `saveText { content, expectedRevision }`、`useCurrent`、`useIncoming`、`delete`、`markResolved`；availability 由 domain + adapter 在 mutation 前复核。

## API Impact

- 本机新增 `git_conflict_detail`、`git_resolve_conflict`。
- SSH 新增 `git_remote_conflict_detail`、`git_remote_resolve_conflict`，保持 session/profile ownership。
- TypeScript client/repository adapter 增加相同窄接口。
- DTO 使用 `deny_unknown_fields`，不接受 stage/OID/revision selector、command、args、absolute result path 或 force。

## Database Impact

- 无数据库、Workspace schema、持久化字段或迁移。

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-002, AC-001] 先为 domain/status parser 增加失败测试，定义 conflict kind、merge head identity 与严格映射。
- [x] TASK-002 [depends: TASK-001] [REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, AC-002, AC-003, AC-004] 为 local Git port/application/adapter 增加 detail/resolve，使用真实仓库 fixture 覆盖 stage blobs、revision、path containment、文本/side/delete 和单 path staging。
- [x] TASK-003 [depends: TASK-001, TASK-002] [REQ-011, AC-008, AC-009] 扩展 remote Git port、SSH manager/session/adapter 与 strict DTO，保持 Git-purpose/profile ownership、POSIX literal、stdin/输出限制和错误恢复。
- [x] TASK-004 [depends: TASK-002, TASK-003] [REQ-003, REQ-004, REQ-005, REQ-006, REQ-011, AC-008] 增加 Tauri local/remote commands、DTO 映射与 TypeScript/repository client，拒绝 unknown/arbitrary Git 输入。
- [x] TASK-005 [depends: TASK-004] [REQ-009, REQ-010, AC-006, AC-007] 先补 GitPane/resolver 失败交互测试，再实现宽版 manager dialog、列表、version tabs、结果编辑、固定动作区、loading/error/unsupported 和焦点生命周期。
- [x] TASK-006 [depends: TASK-005] [REQ-006, REQ-008, REQ-012, AC-005, AC-010] 接入 GitPane snapshot/refresh/continue/abort，merge 状态限制 stage-all，保持外部解决与普通 Git 行为兼容。
- [x] TASK-007 [depends: TASK-002, TASK-003, TASK-006] [REQ-007, REQ-008, REQ-011, AC-005, AC-009] 补多冲突、partial failure、SSH 断线/重连、continue/abort 恢复和 unsupported smoke 覆盖。
- [x] TASK-008 [depends: TASK-001 至 TASK-007] [REQ-001 至 REQ-012, AC-001 至 AC-010] 更新 Directory Map，执行 strict 聚焦/完整验证、固定命令/敏感输入/diff 审计，回写 evidence 并完成 conflict-free 归档。

## Execution Result

- TASK-001 至 TASK-008 均完成；实现没有新增依赖、schema、持久化字段或通用 Git/Files/SSH 能力。
- 验证证据、残余真实 SSH smoke 风险与 close 状态记录在归档 `spec.md`；Directory Map 已更新。

## Dependencies And Parallel Work

- TASK-002 完成后才能冻结 transport shape；TASK-003 与 local command/client 的部分映射可独立，但当前按共享模型串行执行以避免 DTO 漂移。
- UI 可在 TASK-004 transport type 固定后使用 mocks 开始；真实接线依赖 local/remote client 完成。
- 不新增前端或 Rust 第三方依赖；复用现有 CodeMirror、DialogFrame、Icon、revision 算法和 Git process runner。

## Acceptance To Verification

- VER-001 [AC-001] `cargo test domain::git --no-default-features` 与 parser fixture，覆盖 UU/AA/DU/UD/unknown、merge head identity 和 DTO 映射。
- VER-002 [AC-002, AC-003, AC-004] `cargo test infrastructure::git_cli::tests --no-default-features` 的真实仓库 conflict detail/resolve fixtures。
- VER-003 [AC-005] 本机真实多冲突 lifecycle 覆盖逐项解决、只 stage 目标 path、continue、abort 和 merge-state stage-all 限制。
- VER-004 [AC-006] `pnpm exec vitest run src/git/GitConflictResolver.test.tsx src/git/GitPane.operations.test.tsx`。
- VER-005 [AC-007] `pnpm exec vitest run src/git/gitStyles.test.ts`，并聚焦检查窄窗口、scroll owner、semantic tokens、focus/reduced-motion。
- VER-006 [AC-008] `cargo test commands::git::tests --no-default-features`、domain remote action tests 与 SSH manager/session ownership tests。
- VER-007 [AC-009] SSH conflict detail/resolve contract tests；环境可用时运行标记 ignored 的 real-SSH conflict lifecycle。
- VER-008 [AC-010] `pnpm check`。
- VER-009 [AC-010] `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- VER-010 [AC-008, AC-010] `rg` 静态审计 command/args/revision/OID/force/credential/URL 输入、`git diff --check` 与 scoped diff review。

## Test Plan

1. 先写纯 domain/parser 失败测试，避免 UI 或 adapter 定义冲突规则。
2. 使用临时真实 Git 仓库构造普通 UU、AA、UD/DU、binary 和多冲突；断言 index stage 与工作树内容，而不只断言 mock command。
3. 对 revision race、missing side、unsupported type、path escape、oversize、非 UTF-8、写回后 stage 失败分别建立失败路径。
4. SSH 以 strict DTO、session/profile ownership、固定命令与 stdin 捕获为主；真实远端 lifecycle 保持可选 ignored fixture。
5. 前端以可观察行为测试 resolver 的列表/详情/草稿/确认/错误/焦点；CSS 使用现有 style contract，不建立脆弱整页 snapshot。
6. 最后运行前端和 Rust 完整门禁；不运行 desktop package build，因为无 native dependency/config/packaging 变化。

## Rollback Plan

- 移除 resolver UI 和 conflict client 后恢复原 conflict row stage 行；已有 merge/continue/abort 不依赖新增接口。
- 移除 DTO/ports/adapters 后 snapshot 可回退为 `conflict: bool`，但代码回滚前必须同步移除前端新字段使用。
- 不存在 schema/persistence 回滚。已经写入真实工作树/index 的 resolution 不自动撤销，仍由 Git CLI 或现有 abort merge 处理。

## Risks

- Git conflict taxonomy 比文本冲突更广；错误分类可能覆盖或暂存错误侧。以 index stage presence/mode 和真实 fixture 防护，unknown 默认 unsupported。
- 工作树写回和 index stage 非原子；明确两阶段错误语义，失败后重读 snapshot，不把 partial success 标为 resolved。
- SSH 传输文本会扩大 Git-purpose payload；严格限制 2 MiB、profile ownership、固定 stdin 目标和有界错误，不开放通用 SFTP/exec。
- manager dialog 内多编辑器可能增加 bundle/布局成本；首版只挂载当前选中的一个只读版本和一个结果 editor，并复用现有 CodeEditor。
- conflict marker 检测存在 false positive/negative；只做提示，继续 readiness 以真实 unmerged index 为准。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 的 Git frontend/domain/application/commands/local/SSH owner 和新边界。
- 验证证据、残余风险和 unsupported 类型回写 spec/plan；通过后由 strict completion path 自动归档。

## Style Context

- 使用 Qterm manager dialog 的约 210px sidebar + `minmax(0, 1fr)` editor；窄宽降至约 170px。
- Base/当前/传入使用 peer tabs；结果编辑区和列表各自拥有唯一滚动，固定 header/footer/status slot。
- semantic tokens、可见 focus、无 hover-only 核心动作、nested confirmation topmost ownership 和 reduced-motion 必须进入测试/样式检查。

## Trigger Signals

- Architecture boundary：已触发；domain/application/ports/DTO/adapter/presentation 必须分离，禁止 Files command 或 UI 接管 Git 规则。
- Critical behavior：已触发；覆盖工作树/index 与 SSH ownership，先补失败测试和真实 Git fixture。
- Directory Map：新增模型、ports、commands 和 resolver component 后必须更新。
