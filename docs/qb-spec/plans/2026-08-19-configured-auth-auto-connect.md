# 配置认证自动连接与失败回退实施计划

Status: implemented on 2026-08-19. Frontend lint/73 tests/typecheck/build and Rust fmt/Clippy/67 tests pass; 1 existing OpenSSH-dependent test remains ignored by design.

## Background

目标选择目前无条件打开 ConnectionAuthDialog；远程 Files Block 继承 profile 后不会自动连接。Tauri `session_connect` 只同步返回 session id，真实认证结果通过异步事件通知。

## Requirement

按 profile 配置直接尝试 Terminal/SFTP 连接，仅在凭据不可用或异步失败时打开认证弹窗。

## Non-Goals

- 不修改 vault schema、SSH 协议、host-key 流程或凭据保存策略。
- 不增加自动重试和后台解锁。

## Architecture Impact

- 在 workspace 前端编排层新增 configured-auth resolver。
- WorkspaceProvider 的连接入口接受可选失败回调；provider 不读取 profile vault，也不控制弹窗。
- LayoutView 负责在 remote Files leaf 初次出现时发出一次连接请求。

## Domain Model Impact

- 无 Rust domain 变化；`SessionAuth` tagged union 保持不变。

## API Impact

- 前端 WorkspaceContext 的 `connectBlock` / `connectFileBlock` 增加可选失败回调；Tauri IPC 不变。

## Database Impact

- 无。

## Implementation Tasks

1. 新增 resolver 测试，覆盖 Agent、已解锁密码、锁定/缺失密码、私钥路径。
2. 更新 LayoutView 回归测试，覆盖 Files leaf 自动请求和 target 选择不重复请求。
3. 更新 WorkspaceProvider 测试，覆盖异步 Failed 事件只调用一次失败回调。
4. 实现 resolver、Shell 自动尝试和失败回退。
5. 实现 Files leaf 初次/切换目标自动请求，保持本机路径不变。
6. 运行 focused 与全量质量门。

## Acceptance To Verification

- Agent/密码/私钥解析：resolver Vitest。
- Terminal 不预弹窗、失败后弹窗：WorkspaceShell/App RTL。
- Files 自动连接且不重复：LayoutView RTL。
- 异步失败回调：WorkspaceProvider RTL。
- 完整质量：`pnpm check` 与 Rust fmt/Clippy/all-target tests。

## Test Plan

- 先修改现有“所有 profile 都弹窗”的回归测试，使其表达自动请求语义。
- 使用事件 mock 模拟 `stateChanged: failed` 与 `failed` 顺序，确保只触发一次 fallback。
- 全量 Vitest、lint、typecheck、build；Rust 回归确认 IPC 未受影响。

## Rollback Plan

移除 resolver 和失败回调，恢复 LayoutView 直接设置 authRequest；无数据迁移。

## Risks

- 异步失败事件可能重复触发弹窗：以 attempt-scoped callback 消费后删除。
- Files 初始 effect 与目标选择事件可能重复连接：记录已请求 profile 并按 runtime 状态限制。
- vault 锁定不能静默解密：作为配置凭据不可用直接回退弹窗。

## Documentation Updates

- task spec 与 plan 记录行为；长期架构和 Directory Map 无需变化。
