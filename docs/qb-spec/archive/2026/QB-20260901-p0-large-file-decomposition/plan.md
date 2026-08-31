---
change_id: QB-20260901-p0-large-file-decomposition
tier: strict
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# P0 大文件职责拆解执行计划

## Background

本计划执行 `QB-20260901-p0-large-file-decomposition`。现有 8 月模块化已经建立样式、主题和初步 SSH 子模块边界，但 transfer、purpose session loop、Workspace runtime 以及 credential/profile command 仍形成 P0 级修改热点。实施只改变 private/internal 代码所有权，不改变可观察行为。

## Requirement

- 以 spec 中 REQ-001 至 REQ-008 为唯一需求事实源。
- 采用按职责分阶段迁移；不采用机械行数拆分或状态/服务重写。

## Non-Goals

- 不处理 spec 已列出的 P1 UI、Git CLI、vault crypto、样式和产品功能范围。
- 不修改 IPC、schema、依赖、视觉或发布配置，不运行 desktop release bundle。

## Architecture Impact

### SSH infrastructure

- `client.rs` 保持 `SshSessionManager`、公共 request/error 类型和内部模块装配入口。
- `client/session/` 按 Terminal、Files、Git purpose 拆 runner；Network 继续委托现有 `network.rs`。共享 route connect、SFTP channel opening、cancel/close 只保留一个权威 helper。
- `client/transfer/` 按 staging、file operations、upload、download 和 copy I/O 拆分；所有第三方 SFTP 类型与 path/cancel helper 保持在 infrastructure 子树并使用最小可见性。
- `SessionEntry`、`SessionControl` 和任务注册状态移入邻接内部模块，commands 只看到既有 façade 类型。

### Workspace frontend

- `WorkspaceProvider.tsx` 保留 Context、document reducer、最终 value 组合和 `useWorkspace`。
- persistence/profile bootstrap 放入 `useWorkspacePersistence`；runtime 状态与 refs 由 Provider 调用的内部 hook/controller 持有，仍是一份权威状态。
- Terminal、Files、Network、Git controller 接收显式 state/ref/update/dispatch/IPC 参数，不访问隐藏全局状态，不互相导入 UI component。
- `workspaceRuntime.ts` 继续拥有共享 runtime model 和纯规则，避免从 Provider 反向导入类型。

### Command/application boundary

- credential recovery/private-key workflow 的状态和可测试 commit 决策归 `application/credential_workflow.rs` 或邻接 application service；系统文件选择、大小限制和实际读写留在 command adapter。
- SSH Config import 的候选选择、批量凭证/profile 协调与 rollback 进入 application coordinator；解析授权文件和系统选择器仍分别留在 infrastructure 与 commands。
- application 使用 ports/service/闭包形式的窄能力，不依赖 `tauri::State`、command DTO 或系统 dialog。

## Domain Model Impact

无稳定领域模型变化。必要的 application input/result 为内部用例类型，不复用 command DTO 或 persistence record。

## API Impact

- Tauri command 名称、参数和返回值保持不变。
- TypeScript `src/lib/tauri/*` 与 `WorkspaceContextValue` 保持兼容。
- `SshSessionManager` 公共方法集合与行为保持兼容。

## Database Impact

无。所有 schema、版本、路径和加密格式保持不变，不执行数据迁移或重写。

## Implementation Tasks

- [x] TASK-001 [REQ-007, AC-006] 建立行为保护基线。
  - 盘点 transfer cancel/cleanup、purpose capability、route/host-key、credential recovery/private-key、SSH Config rollback、Workspace epoch/intent/writer/buffer 测试。
  - 先运行现有聚焦测试；只有明确缺口才补最小回归测试。
- [x] TASK-002 [depends: TASK-001] [REQ-002, REQ-003, REQ-006, AC-002, AC-003]
  - 先提取 transfer 的纯 path/copy helper 与 file operations，再迁移 staging、upload、download；每一步保持原 async 控制流。
  - 将 Files、Git、Terminal purpose loop 移入独立 runner，共享 SFTP request dispatch 与 cleanup helper。
  - 提取 session entry/control/task registry，收窄 `client.rs` 为 façade；不得扩大 russh/russh-sftp 类型可见性。
  - 每个子阶段运行 fmt、编译和对应 SSH/files/transfer/session 测试。
- [x] TASK-003 [depends: TASK-001] [REQ-004, REQ-006, AC-004]
  - 提取 Workspace hydration/save/close-flush/profile refresh。
  - 提取 runtime state/refs 与共享 epoch/intent/event router。
  - 按 Terminal、Files、Network、Git 拆 connect/disconnect/host-key/action controllers，保持单一 hook state 和 Context value。
  - 运行 WorkspaceProvider 聚焦测试、typecheck 与 lint。
- [x] TASK-004 [depends: TASK-001] [REQ-005, REQ-006, AC-005]
  - 为 credential 私钥 draft 与 recovery reset 补齐无 Tauri application commit/取消测试，再迁移剩余决策。
  - 建立 SSH Config application coordinator，覆盖选择、唯一命名、凭证复用/新建、原子 profile create 与失败 rollback。
  - command 保留系统 dialog、授权路径的有界 I/O、DTO 映射、状态注入和 IPC error mapping。
  - 运行 credential/profile/import 聚焦测试与 secret/DTO 静态审查。
- [x] TASK-005 [depends: TASK-002, TASK-003, TASK-004] [REQ-008, AC-007]
  - 记录最终文件规模及任何有理由的例外。
  - 更新 `docs/qb-spec/DIRECTORY_MAP.md`；仅在产生新的稳定边界时最小更新 `ARCHITECTURE_SPEC.md`。
  - 执行最终完整质量门并交由 tier-aware verification 收尾。

## Dependencies And Parallel Work

- TASK-002、TASK-003、TASK-004 在完成 TASK-001 后逻辑上独立，但本次在同一工作树串行推进，避免验证证据和 import 变更互相覆盖。
- TASK-005 依赖三个实现阶段全部完成。
- 结构变化触发 `checking-architecture-boundaries`；安全、取消、回滚和竞态触发 `protecting-critical-behavior`，两者在实现前执行。

## Acceptance To Verification

- VER-001 [AC-002, AC-003, AC-006]：检查 SSH module/visibility/规模；运行 SSH client、session、files、transfer、network 与相关 Git-purpose tests，再运行 Rust fmt、clippy 和全量 tests。
- VER-002 [AC-004, AC-006]：运行 `pnpm vitest run src/workspace/WorkspaceProvider.test.tsx`，随后 typecheck、lint 和 `pnpm check`；审查 Context public shape 与 runtime 单一所有权。
- VER-003 [AC-005, AC-006]：运行 credential、profile、ssh_config_import 的 application/command tests；审查 application 不依赖 Tauri、secret 不进入 DTO/log、partial failure rollback 有证据。
- VER-004 [AC-001, AC-007]：检查 Tauri command、TypeScript IPC、schema/version 与依赖无行为性变更；核对 Directory Map，执行最终完整前后端质量门。

## Test Plan

按便宜到昂贵顺序执行，后续改动只重跑被其覆盖失效的证据：

1. `pnpm vitest run src/workspace/WorkspaceProvider.test.tsx`
2. `cargo test --manifest-path src-tauri/Cargo.toml infrastructure::ssh::client`
3. `cargo test --manifest-path src-tauri/Cargo.toml credential`
4. `cargo test --manifest-path src-tauri/Cargo.toml profile`
5. `cargo test --manifest-path src-tauri/Cargo.toml ssh_config_import`
6. `pnpm typecheck`、`pnpm lint`
7. `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
8. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
9. `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features`
10. `pnpm check`

忽略的本地 OpenSSH 集成测试继续保留其环境说明；不能运行时明确报告残余风险，不伪报通过。

## Rollback Plan

- 每阶段保持原 façade 与调用方不变；失败时可恢复该阶段的 module declarations/import 和 owner 移动，不需要数据回滚。
- 不使用破坏性 Git 命令，不覆盖用户工作树，不修改或删除配置、vault、known-hosts 与 workspace 数据。
- 若 controller 提取引入竞态，恢复到最近通过 WorkspaceProvider 测试的单一 owner，再缩小提取范围。
- 若 SSH helper 提取改变 cancel/cleanup，恢复该 purpose/transfer 子模块，不回滚其他已验证阶段。

## Risks

- Rust module 可见性可能诱导扩大 `pub`：仅允许满足 façade 装配所需的 `pub(super)`/`pub(crate)`，第三方类型不出 infrastructure。
- purpose runner 的重复代码抽取可能意外统一原本不同的 capability：以 domain purpose matrix 和现有失败行为为准，不通过泛化 handler 改变语义。
- Workspace hook 拆分可能复制 state 或捕获陈旧值：所有异步判断继续读取显式 ref/epoch/intent，测试覆盖 late event。
- command/application 迁移可能让 application 依赖具体 adapter 或延长 secret 生命周期：以 port/service 输入和 secret wrapper 为硬边界。
- 规模目标不能通过空 façade 或大量参数透传达成；代码审查以所有权和依赖方向为主。

## Documentation Updates

- 必须更新 `docs/qb-spec/DIRECTORY_MAP.md`。
- 只有最终稳定边界与现有 context 不一致时，才最小更新 `docs/qb-spec/context/ARCHITECTURE_SPEC.md`。
- 不更新产品或 UI style context；本 change 不改变产品能力或视觉规则。

## Trigger Signals

- Architecture boundary：是，覆盖 frontend state owner、commands/application/infrastructure 和第三方类型可见性。
- Critical behavior：是，覆盖 SSH cancellation/cleanup、path safety、secret、rollback 与 Workspace race。
- Directory Map：是，完成实现后更新。

## Pre-Implementation Gates

- Architecture：PASS。SSH 第三方类型留在 infrastructure；Workspace 保持单一 Context/state owner；command DTO、application input 与 infrastructure parser model 明确分离。发现的既有反向依赖是 `application/ssh_config_import.rs` 使用 infrastructure candidate，本 change 将以 application-owned import model 修复。
- Critical behavior：PASS WITH NOTES。现有测试已覆盖 SSH purpose capability、staging cancel/scan、Workspace late failure/buffer/writer、credential pending state 与 import selection。SSH Config partial credential creation 后 profile batch failure rollback 缺少 application 级证据，TASK-004 必须先补失败测试再迁移实现。
- Baseline：WorkspaceProvider 26 tests 通过。Rust lib 为 263 passed、1 failed、4 ignored；唯一失败为既有 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning`，不在 P0 修改范围。

## Verification Results

- VER-001 PASS：SSH 定向测试、Rust fmt、Clippy 与除已知基线断言外的全量 Rust tests 均通过；所有 P0 façade 不超过 500 行，所有新增生产模块不超过 700 行。
- VER-002 PASS：WorkspaceProvider 26 个定向测试及前端 632 个全量测试通过；lint、typecheck、build 通过。
- VER-003 PASS：credential/profile/import 定向测试通过；application rollback test 明确验证 partial credential creation 后 profile batch failure 的清理。
- VER-004 PASS WITH BASELINE EXCEPTION：公开 Tauri/TypeScript IPC、schema 与依赖未变，Directory Map 已更新。原始全量 Rust 命令仍有一条未修改文件中的既有 Git Windows path 断言失败；跳过该条后其余 all-target/all-feature 测试通过。
