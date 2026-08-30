---
change: QB-20260830-terminal-path-restore
tier: strict
status: completed
created: 2026-08-30
updated: 2026-08-30
---

# Terminal And File Path Restore Implementation Plan

## Background

Change spec: `docs/qb-spec/specs/QB-20260830-terminal-path-restore.md`.

OSC 7 已把终端当前目录写入 block-scoped `TerminalRuntime`，但 workspace layout 的 Terminal leaf 没有恢复目录，因此应用重启或 session 重建会丢失路径。Files leaf 已持久化 `path`。本地 PTY 与 SSH terminal session 已接受 `initialDirectory`，本次应补齐持久化所有权、schema 迁移和重建编排，而不新增第二套会话协议。

## Requirement

- 实现 `REQ-001` 至 `REQ-008`。
- 保持 `AC-001` 至 `AC-007` 的可观察行为和失败降级。

## Non-Goals

- 不持久化 session、终端缓冲、输入输出、环境变量或凭证材料。
- 不让独立 Files leaf 持续跟随终端目录。
- 不恢复已从布局删除的 Block，也不扩展未知 Shell 的 OSC 7 支持。
- 不重构无关 workspace、files、session 或 persistence 模块。

## Architecture Impact

- Terminal 恢复目录是 layout navigation intent，归 workspace domain/model 所有；活跃 `cwd`、`cwdSource`、session 和实际启动目录继续属于 runtime。
- React provider 只编排 OSC 7 runtime 更新、layout action 和已有 session `initialDirectory` 输入，不自行构造远端 `cd` 命令。
- Rust domain 负责 workspace 恢复目录约束；command DTO 和 JSON record 分别保持 transport / persistence 映射，不直接复用 domain model。
- workspace schema 从 v6 升级为 v7。Repository 显式迁移当前 v6，并保留已有 v5 兼容入口；读取旧文档时不原地覆盖。

## Domain Model Impact

- TypeScript `TerminalNode` 新增可空 `restoreDirectory`。
- Rust `LayoutNode::Terminal` 新增 `restore_directory: Option<String>`，workspace validation 使用与 terminal initial directory 一致的非空、4 KiB、无 NUL 边界。
- profile 变化和 OSC 7 关闭清理恢复目录；相同合法 OSC 7 路径为幂等更新。

## API Impact

- 内部 `workspace_load` / `workspace_save` DTO 升级为 schema v7 并映射 Terminal `restoreDirectory`。
- 现有 local/SSH terminal connect DTO 不变，只开始消费已持久化的 `initialDirectory`。
- 无公开 API 变化。

## Database Impact

- 无数据库。
- `workspaces.json` schema v6 → v7；Terminal record 增加可空 `restoreDirectory`。
- v5/v6 fixture 迁移到 v7 时为旧 Terminal leaf 填充 `restoreDirectory: null`，保存前不修改原文件。

## Affected Files

- Frontend model/reducer/layout: `src/workspace/model.ts`, `layout.ts`, `reducer.ts` 及相邻测试。
- Frontend orchestration: `src/workspace/WorkspaceProvider.tsx`, `WorkspaceProvider.test.tsx`。
- Window close flush adapter: `src/lib/tauri/window.ts` 及测试，或同等窄边界实现。
- Backend domain/DTO/persistence: `src-tauri/src/domain/workspace.rs`, `commands/workspace.rs`, `infrastructure/persistence/json_workspace_repository.rs` 及相邻测试。
- Existing startup safety evidence: `src-tauri/src/domain/shell_integration.rs`, `infrastructure/local/pty.rs`（预计仅复用测试，不改生产逻辑）。
- Change artifacts: 当前 spec、plan 和完成后的 archive evidence。

## Implementation Tasks

- [x] `TASK-001` [REQ-001, REQ-005, REQ-007] 先补 frontend reducer/model 与 Rust domain/DTO/repository 的失败测试：持久化、幂等、目标清理、v5/v6 迁移和禁止字段。
- [x] `TASK-002` [depends: TASK-001] [REQ-001, REQ-005] 在 TypeScript layout model/reducer 中加入 `restoreDirectory` 及 set/clear action，保持 Files path 独立。
- [x] `TASK-003` [depends: TASK-002] [REQ-001, REQ-002, REQ-003, REQ-008] 更新 WorkspaceProvider：合法 OSC 7 同时更新 runtime 与 layout；本地/SSH 重建读取 layout restore intent；OSC 7 关闭和 target 变化清理；正常窗口关闭刷新待保存 document。
- [x] `TASK-004` [depends: TASK-001] [REQ-006, REQ-007] 升级 Rust workspace domain、command DTO 和 JSON record 到 v7，补 v5/v6 非覆盖迁移和字段往返。
- [x] `TASK-005` [depends: TASK-003, TASK-004] [REQ-002, REQ-003, REQ-004, REQ-006] 补跨层回归：本地/SSH connect 收到恢复目录、失效路径降级边界继续成立、Files path 重启契约不回归、复杂远端路径仍安全编码。
- [x] `TASK-006` [depends: TASK-005] [REQ-001, REQ-008] 完成退出持久化节流/flush 回归，确认重复 OSC 7 不触发 document 变化或一报告一写。
- [x] `TASK-007` [depends: TASK-006] [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007] 执行 strict 验证、记录 evidence，并在无冲突时归档 change。

## Execution Result

- Completed on 2026-08-30。实现保持了 layout navigation intent、runtime、transport DTO、domain 和 persistence record 的既定分层，没有新增模块或外部依赖。
- Directory Map 不需要更新；文件和模块位置未变化。

## Dependencies And Parallel Work

- `TASK-002` 与 `TASK-004` 在测试边界确定后可分别修改前端和 Rust 模型，但 schema 字段名、null 语义和 4 KiB 约束必须一致。
- `TASK-003` 依赖 frontend layout action；`TASK-005` 依赖前后端 schema 同步。
- 无外部依赖或新增 package。

## Acceptance To Verification

- `VER-001` [`AC-001`] Frontend provider 测试证明 hydration 后本地 connect 收到保存目录；Rust local PTY 测试证明无效目录降级到 home。
- `VER-002` [`AC-002`] Frontend provider 测试证明 SSH connect 收到保存目录；shell integration 测试证明安全切换顺序和失败不阻断命令。
- `VER-003` [`AC-003`] Reducer/LayoutView/FileBrowser 现有及新增测试证明本地/远程 Files path 持久化恢复且独立于终端。
- `VER-004` [`AC-004`] Reducer/provider 测试证明 profile 变化、OSC 7 关闭和 Block 删除不会复用旧恢复目录。
- `VER-005` [`AC-005`] Rust domain、command DTO、JSON repository 测试证明 v5/v6 → v7、v7 往返和禁止字段保护。
- `VER-006` [`AC-006`] `InitialDirectory` 与 shell integration 测试证明长度/NUL 边界和 Bash/Zsh/Fish/PowerShell 字面量安全。
- `VER-007` [`AC-007`] Provider/window adapter 测试证明相同路径幂等、保存防抖以及正常关闭 flush 最新 document。

## Test Plan

1. 运行最聚焦的 frontend tests：workspace model/reducer/provider/layout 和 Tauri workspace/window adapters。
2. 运行 Rust workspace domain/command/repository、initial directory、shell integration 和 local PTY 聚焦测试。
3. 运行 `pnpm check`，覆盖 ESLint、Vitest、TypeScript 与 Vite production build。
4. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
5. 若桌面运行环境可用，聚焦验证一次本地和 SSH 工作区重启；否则明确记录自动化覆盖和未执行的 GUI 手工项。

## Rollback Plan

- 停止把 OSC 7 写入 Terminal layout，并停止向重建 session 传递持久化目录，即可恢复 v6 行为。
- v7 的新增字段可保持 `null`；不回写或降级现有用户文件。若必须发布回滚版本，应先提供 v7 → v6 显式转换，而不能让旧二进制覆盖 v7 文档。

## Risks

- 前后端 schema 版本或字段不同步会阻止 workspace 加载/保存。
- 过度保存 OSC 7 报告会增加磁盘写入；幂等 reducer 和现有 debounce 必须共同保护。
- 关闭 flush 若与窗口关闭生命周期集成不当可能造成关闭循环；adapter 测试必须覆盖 prevent/flush/destroy 的单次顺序。
- 恢复目录在下次连接时可能失效；本地/SSH 连接必须保持可用并以实际目录纠正 runtime。

## Documentation Updates

- 当前 spec 记录 Behavior Delta、approval、review 和最终 verification evidence。
- 完成后由 verification 流程归档 spec/plan；本次没有目录结构或长期工程风格变化，不更新 Directory Map 或长期 context。

## Trigger Signals

- Architecture boundary: 是；workspace navigation intent、runtime、DTO、domain 和 persistence record 必须分离。
- Critical behavior protection: 是；schema migration、禁止字段、跨目标清理和退出保存必须有自动化测试。
- Directory Map: 否；不新增、移动模块或入口。
- Style context: 不适用；没有 UI 或长期编码风格变更。
