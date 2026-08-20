## Requirement

新增终端缓冲清除按钮，并消除重复连接同一远程终端时旧缓冲被重复追加的问题。

## Scope

扩展前端终端视图注册契约、会话启动编排和终端头部动作；不修改 Rust 会话接口、Shell 历史或文件窗口。

## Affected Files

- `src/components/Icon.tsx`
- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/workspace/WorkspaceProvider.tsx`
- `src/workspace/WorkspaceProvider.test.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`

## Design

在现有 writer 注册中同时提供 `clear` 控制回调，并复用同一 ownership token 管理清理。Provider 暴露 `clearBlockBuffer(blockId)`，同步删除未回放输出并调用当前视图的 `terminal.clear()`。手动头部按钮使用普通 buffer clear，保持当前会话终端模式；`startLocalBlock` 和 `connectBlock` 在启动新会话前使用完整 reset，确保旧提示行与解析状态也不会进入新会话。

新增语义明确的清除图标，沿用 `.block-actions` 的 25×23 像素图标按钮样式。

## Acceptance To Verification

- 头部入口：LayoutView 行为测试断言按钮和 block 路由。
- xterm 清除：TerminalPanel 测试断言注册回调调用 `terminal.clear()`。
- 新会话边界：Provider 测试断言 SSH 连接调用之前已清除旧缓冲。
- 生命周期隔离：Provider 测试断言旧注册 cleanup 不移除新 clearer。

## Test / Verification

1. 先新增上述失败回归测试。
2. 实现图标、视图控制注册和会话启动清除。
3. 运行三个相关测试文件。
4. 运行 `pnpm check` 和 `git diff --check`。

## Documentation Updates

新增本 task spec 和 Standard plan；无目录或长期架构变化，无需更新 Directory Map 或长期项目上下文。
