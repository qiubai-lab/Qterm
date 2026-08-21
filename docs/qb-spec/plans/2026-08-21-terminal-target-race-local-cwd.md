# Terminal Target Race And Local CWD Implementation Plan

## Background

终端布局目标与运行时会话状态分开存储。旧认证/关闭操作跨越异步边界后仍可能提交到同一 Block，形成“本地终端 + SSH failed”或关闭新本地会话的竞态。本地 Runtime 同时以 `.` 作为初始 CWD，使文件浏览器依赖 Qterm 进程工作目录。

## Requirement

最后一次终端目标选择必须拥有唯一提交权；本地终端初始目录必须由 Rust 解析并与 PTY 实际启动目录一致。

## Non-Goals

- 不扩展完整的跨 Shell OSC 7 注入。
- 不修改 workspace schema、凭证格式或远端路径协议。
- 不进行无关的 session/file/network 大重构。

## Architecture Impact

- `WorkspaceProvider` 继续拥有 Block 级会话意图、epoch、运行时和失败回调。
- `WorkspaceShell` 只在认证异步边界调用 provider 的目标校验，不自行复制会话状态机。
- Rust `infrastructure/local/pty` 拥有本地主目录解析和 child cwd；command 层仅映射连接结果 DTO。

## Domain Model Impact

无持久化 Domain Model 变化。本地基础设施新增仅运行时使用的连接结果模型。

## API Impact

内部 Tauri command `local_session_connect` 返回值从 session id 字符串扩展为 `{ sessionId, cwd }`；TypeScript wrapper 同步更新。该接口不对外发布。

## Database Impact

无。

## Implementation Tasks

1. 先补目标切换/延迟认证/延迟关闭以及绝对本地 CWD 的失败回归测试。
2. 调整 `WorkspaceProvider`：同步清理旧 Runtime、记录目标意图、在连接 await 前后校验，并把失败处理器绑定到 epoch。
3. 调整 `WorkspaceShell`：自动认证 key 包含 profile，并在每个异步边界及认证 fallback 前验证当前目标。
4. 扩展 Rust 本地 PTY 连接结果，明确在用户主目录启动；更新 command DTO 和 TypeScript client。
5. 更新标题栏路径行为测试，确保本地路径来自后端/OSC 7，远端路径语义不变。
6. 运行聚焦测试、前端完整检查和 Rust fmt/clippy/test。

## Acceptance To Verification

- Acceptance 1：延迟旧 close/认证解析后切本地，断言最终 `local:connected` 且旧 SSH 未启动或无法提交。
- Acceptance 2：发送旧 failed 事件/拒绝旧 Promise，断言本地状态和新 failure handler 不变。
- Acceptance 3：Rust 断言 child 初始目录/连接结果 CWD，TS 断言 DTO 透传。
- Acceptance 4：Layout/Provider 断言本地文件 action 使用绝对 home，而非 `.`。
- Acceptance 5：现有 terminal/files 测试、`pnpm check` 与 Rust 全套检查通过。

## Test Plan

- `pnpm exec vitest run src/workspace/WorkspaceProvider.test.tsx src/workspace/WorkspaceShell.test.tsx src/workspace/LayoutView.test.tsx src/lib/tauri/localSessions.test.ts`
- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

## Rollback Plan

回退本次 provider 编排、IPC DTO 与 PTY cwd 变更即可；无数据迁移或 schema 回滚。

## Risks

- 目标校验过严可能阻止持久化远程 Block 自动重连，需覆盖无显式 target intent 的 hydration 路径。
- 本地 cwd DTO 变更若前后端不同步会阻止本地终端启动，必须同时验证 Rust command 与 TS wrapper。
- 并发关闭若错误复用当前 Runtime 可能关闭新 session，测试必须控制 Promise 完成顺序。

## Documentation Updates

- 新增本 task spec 与 plan；不需要更新长期项目上下文或 Directory Map。
