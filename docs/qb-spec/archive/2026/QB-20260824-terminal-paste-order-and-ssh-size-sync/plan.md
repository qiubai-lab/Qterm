---
id: QB-20260824-terminal-paste-order-and-ssh-size-sync
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

修复终端粘贴时异步剪贴板读取造成的输入越序，并确保 SSH PTY 在 shell 启动前就使用当前 xterm 尺寸，避免长提示符跨行后由方向键触发 Readline 重绘错位。

## Scope

修改前端终端输入、视图尺寸注册、Tauri connect DTO、SSH request 与 PTY 创建及相邻测试；不修改粘贴确认策略、视觉样式、文件会话或网络会话行为。

## Affected Files

- `src/terminal/terminalInputScheduler.ts`
- `src/terminal/terminalInputScheduler.test.ts`
- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/terminal/resizeScheduler.ts`
- `src/terminal/resizeScheduler.test.ts`
- `src/workspace/WorkspaceProvider.tsx`
- `src/workspace/WorkspaceProvider.test.tsx`
- `src/lib/tauri/sessions.ts`
- `src/lib/tauri/sessions.test.ts`
- `src-tauri/src/commands/session.rs`
- `src-tauri/src/infrastructure/ssh/client.rs`
- `src-tauri/src/infrastructure/ssh/client/session.rs`
- `src-tauri/src/infrastructure/ssh/client/tests.rs`
- `docs/qb-spec/archive/2026/QB-20260824-terminal-paste-order-and-ssh-size-sync/spec.md`
- `docs/qb-spec/archive/2026/QB-20260824-terminal-paste-order-and-ssh-size-sync/plan.md`

## Design

终端 view 持有一个输入调度器。普通 `onData` 顺序入队；快捷键粘贴在按键发生时先排入异步屏障，剪贴板返回后同步调用 `terminal.paste()`，捕获它产生的 `onData` 并在屏障内先写出，再释放屏障后的键盘输入。调度器隔离单次写入失败并在 view 销毁时停止发送。

Terminal view 注册一个按需尺寸读取器；读取时若可见则先重新 fit，确保连接动作拿到最新列数和行数。Workspace 将尺寸加入 SSH connect 输入，Tauri DTO 使用 domain `TerminalSize` 校验，SSH request model 保存该值，并在 `request_shell` 前以它创建 PTY。文件和网络会话继续省略该字段。

resize scheduler 继续支持显式强制请求。`TerminalPanel` 观察连接 `sessionId`，每个新会话出现后以强制模式请求当前尺寸，覆盖连接后的布局变化。

## Acceptance To Verification

- 粘贴先于后续输入：延迟剪贴板的 `TerminalPanel` 集成测试和输入调度器单元测试。
- 保留 xterm paste：集成测试断言仍调用 `terminal.paste()`，并由 mock 的 `onData` 路径写入。
- 失败隔离：调度器测试让首个 writer reject，断言第二个输入仍发送。
- 初始尺寸来源：TerminalPanel 测试断言注册的读取器重新 fit 并返回当前尺寸；WorkspaceProvider 测试断言该尺寸进入 `connectSession`。
- DTO 与 PTY：前端 adapter 测试断言 camelCase 输入；Rust 测试验证无效尺寸被拒绝，terminal request 保存尺寸且 PTY 创建路径不再使用固定 `80×24`。
- SSH 尺寸同步：TerminalPanel 测试从无会话切到已连接会话，断言强制重发相同尺寸。
- 既有行为：运行相关完整测试和 `pnpm check`。

## Test / Verification

1. 保留并复核已补的输入调度器、粘贴竞态和新会话 resize 回归测试。
2. 先补初始尺寸读取、Workspace connect 输入、Tauri DTO 与 SSH request 的回归测试。
3. 扩展 terminal view 注册信息，在连接动作发生时重新 fit 并读取尺寸。
4. 将尺寸贯穿 Tauri transport、domain 校验和 SSH request，在 `request_pty` 中使用。
5. 运行 `pnpm exec vitest run src/terminal/terminalInputScheduler.test.ts src/terminal/resizeScheduler.test.ts src/terminal/TerminalPanel.test.tsx src/workspace/WorkspaceProvider.test.tsx src/lib/tauri/sessions.test.ts`。
6. 在 `src-tauri/` 运行聚焦 Rust 测试，再运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 和 `cargo test --all-targets --all-features`。
7. 运行 `pnpm check`、`git diff --check` 并审查最终 diff。

## Documentation Updates

更新本 task spec 和 Standard plan，记录由连接后 resize 升级为初始尺寸握手。无需更新长期 Project Context 或 Directory Map。
