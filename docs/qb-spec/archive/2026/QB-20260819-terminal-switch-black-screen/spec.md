---
id: QB-20260819-terminal-switch-black-screen
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

本地与远程终端或工作区切换后，已连接终端能够稳定恢复画面并保留切换期间产生的输出；应用重启恢复持久化布局后，远程终端能够按既有鉴权配置重新发起连接。

## Scope

- 终端重新挂载、容器尺寸变化和从隐藏状态恢复时，等待有效布局后执行完整重绘。
- writer 注册具有实例所有权，旧终端清理不能移除新终端 writer。
- 会话有效但 writer 暂时不可用时，有限缓存终端输出并在重新注册后回放。
- 本地 PTY 建立期间持续排队 xterm 输入与控制响应，直到 sessionId 可以稳定路由，避免启动握手丢包。
- 工作区完成持久化恢复前不启动默认占位布局中的本地 Shell。
- 持久化的远程终端在 profile 可用且运行态为 closed 时自动请求一次连接。
- 覆盖目标切换和隐藏恢复相关回归测试。

## Constraints

- 保持现有 xterm、PTY 与会话接口，不增加依赖。
- 输出缓存必须有容量上限，并在会话切换或关闭时清理。
- 不改变终端视觉样式和工作区切换方式。

## Non-Goals

- 不恢复上一次进程中的终端缓冲、进程状态或瞬时命令上下文。
- 不对明确失败的连接进行无限自动重试。
- 不长期持久化终端输出。

## Acceptance

- 隐藏终端重新显示后触发 fit 和全行 refresh。
- 旧组件注销不会删除同 block 的新 writer。
- writer 暂时缺失期间的有效会话输出会在注册后按顺序回放。
- 切换会话时不会把旧会话缓存输出回放到新目标。
- 本地输入缓冲正在异步写入时，新到达的终端控制响应仍按序写入同一 PTY。
- 持久化恢复前不创建临时本地 PTY；恢复后的远程终端只发起一次配置鉴权连接。

## Acceptance To Verification

- `TerminalPanel` 测试验证隐藏到显示后的完整刷新。
- `WorkspaceProvider` 测试验证 writer 所有权与输出回放。
- `WorkspaceProvider` 测试验证本地 sessionId 返回及缓冲 flush 期间的输入均不丢失。
- `TerminalPanel` 测试验证 hydration 前不启动本地 Shell；`LayoutView` 测试验证持久化远程终端自动连接。
- 聚焦测试和 `pnpm check` 验证回归与整体完整性。

## Open Questions

无。

## Recommended Approach

保留现有组件缓存模型，在可见生命周期中等待 `proposeDimensions` 有效后执行 `fit + refresh`；让 writer 注册返回带 token 的清理函数；在 Provider 会话边界内维护有上限的输出队列。相比无条件刷新、移除终端缓存或重建整个工作区，该方案避免在隐藏画布上破坏渲染状态，同时保留滚动内容。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed
