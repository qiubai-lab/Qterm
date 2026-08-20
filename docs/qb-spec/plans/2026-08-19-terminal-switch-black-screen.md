## Requirement

修复本地与远程终端切换后偶发已连接但画面全黑的问题，并恢复应用重启后的远程终端自动重连。

## Scope

调整 xterm 可见性恢复、writer 生命周期、本地启动输入路由、hydration 启动边界和持久化远程终端重连；不改 Rust PTY、会话协议或终端样式。

## Affected Files

- `src/terminal/TerminalPanel.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/workspace/WorkspaceProvider.tsx`
- `src/workspace/WorkspaceProvider.test.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`

## Design

抽取终端布局恢复函数，仅当 `proposeDimensions` 返回有效有限尺寸时执行 fit、全行 refresh 和尺寸同步；可见转换期间用有限帧重试等待布局稳定。Provider 为 writer 分配所有权 token，清理函数仅注销自己的注册；有效 epoch 的输出在 writer 缺失时进入有界队列，新 writer 注册后立即顺序回放。会话关闭和目标切换清空队列。

本地 PTY 启动时保持输入队列到全部缓冲数据写完，并用独立的活动 session 映射承接 React 运行态提交前的新输入，消除 sessionId 返回到状态可路由之间的丢包窗口。TerminalPanel 等待工作区 hydration 后再创建本地 Shell。TerminalBlock 对持久化 remote profile 增加与文件窗口一致的一次性自动连接请求，由现有 configured-auth 流程处理 ssh-agent、凭证库解锁或人工认证。

## Acceptance To Verification

- 画面恢复：xterm mock 断言可见转换调用 refresh。
- writer 隔离：旧清理函数执行后，新 writer 仍接收数据。
- 输出不丢失：writer 注册前的数据在注册后回放。
- 会话隔离：切换前缓存不会进入新会话。
- 启动握手：缓冲 flush 进行中到达的控制响应仍被顺序写入。
- 恢复边界：hydration 前不启动本地 Shell，持久化远程终端恢复后只请求一次连接。

## Test / Verification

1. 先增加上述失败回归测试。
2. 实现重绘、所有权清理和有界缓存。
3. 运行 TerminalPanel 与 WorkspaceProvider 聚焦测试。
4. 运行 `pnpm check`。

## Documentation Updates

新增本 task spec 与 Standard plan；无需更新长期项目上下文或 Directory Map。
