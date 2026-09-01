---
id: QB-20260819-conpty-resize-buffer-consistency
status: archived
archived: 2026-09-02
legacy: true
---
# ConPTY resize 缓冲一致性实施计划

Status: Complete (2026-08-19)

## Requirement

Plan Level: Standard。修复跨 Rust/TypeScript 的普通终端兼容回归，涉及多个适配文件和自动化保护，但不改变公共外部 API、持久化 schema、安全边界或核心领域模型。

## Scope

实现本地 PTY 能力传递、xterm ConPTY 配置和 latest-wins resize 合并；不重建缓冲、不调整 SSH 协议、不扩展为通用系统信息框架。

## Affected Files

- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/src/commands/local_session.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/localSessions.ts`
- `src/lib/tauri/localSessions.test.ts`
- `src/workspace/WorkspaceProvider.tsx`
- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/terminal/resizeScheduler.ts`
- `src/terminal/resizeScheduler.test.ts`
- 本 task spec 与 plan

## Design

- Rust command adapter 返回仅用于传输的本地终端能力 DTO；Windows 版本探测留在平台适配代码，不进入 domain/application。
- WorkspaceProvider 在桌面运行时加载一次能力并通过 context 传递，不让能力查询失败阻断工作区和连接配置加载。
- TerminalPanel 只在 `local` 为真时设置或更新 xterm `windowsPty`，SSH view 不接收该配置。
- 每个持久化 TerminalView 拥有一个 resize scheduler：跳过相同尺寸；空闲时短延迟合并；请求进行中只保留最新尺寸；错误被隔离且同尺寸可重试；真正销毁 view 时释放 timer。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 真实 ConPTY 元数据且不污染 SSH | Rust cfg 测试、localSessions IPC 测试、TerminalPanel 本地/SSH 选项测试。 |
| resize latest-wins、去重、串行 | scheduler fake-timer/deferred-promise 测试。 |
| 失败后恢复 | scheduler rejection 回归测试。 |
| 生命周期和构建完整性 | 现有 TerminalPanel 测试、`pnpm check`、Cargo fmt/clippy/test。 |

## Test / Verification

1. 先增加前端失败测试，证明本地 xterm 缺少 ConPTY 元数据且当前 resize 没有合并/顺序保护。
2. 实现 Rust 能力 DTO、前端 IPC 映射和 Provider 传递，运行相关 IPC/TerminalPanel 测试。
3. 实现 scheduler 并接入持久化 TerminalView，运行 scheduler 与生命周期测试。
4. 运行 `pnpm check`。
5. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
6. 运行 `git diff --check` 并检查只修改预期文件。

## Documentation Updates

实现后更新本 spec 和 plan 状态及验证证据。无需 Project Context 或 Directory Map 更新。

## Completion

- Rust infrastructure 提供真实本地 PTY 能力，Tauri command 只映射传输 DTO。
- WorkspaceProvider 加载能力且失败不阻断既有工作区 hydration；TerminalPanel 将能力仅应用于本地 xterm，并在能力异步到达时复用原实例。
- 持久化 TerminalView 拥有 latest-wins resize scheduler，本地使用 50ms 合并，SSH 使用零延迟批次合并。
- 计划中的前端和 Rust 自动化命令、格式和 diff 检查均通过；桌面实际拖拽保留为交互式目视复验。
