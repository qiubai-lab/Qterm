---
id: QB-20260821-multi-node-connection-progress
status: archived
archived: 2026-09-02
legacy: true
---
# 多节点连接进度组件实施计划（Standard）

## 范围与边界

- `src/workspace/connectionProgress.ts`：把 `SessionEvent.routeProgress` 映射为稳定、可测试的展示状态；不包含 React 或定时器。
- `src/workspace/WorkspaceProvider.tsx`：为 Terminal/File/Network runtime 编排共享的结构化进度；失败和关闭清理，成功标记完成。
- `src/components/ConnectionRouteProgress.tsx`：唯一视觉组件，负责成功态延时隐藏和无障碍输出；不解释 SSH 业务事件。
- `src/workspace/LayoutView.tsx`：在三类 Block 的同一层级挂载共享组件。
- `src/app/app.css`：小组件、节点状态、动效与可访问性样式。
- 不修改后端和 IPC 契约。

## 实施步骤

1. 添加纯进度模型与 route 阶段映射，并覆盖首跳、隧道推进、目标会话和完成态测试。
2. 扩展三种 runtime，统一处理 route progress、connected、failed/closed，同时保留原有错误 notice。
3. 实现悬浮组件：节点圆点、当前状态文本、成功态 1.2 秒退出、reduced-motion 支持。
4. 在 Terminal、Files、Network Block 挂载同一组件，移除 route 过程对通用 notice 的占用。
5. 增加 Provider 与组件回归测试，更新 Directory Map。

## 风险与控制

- 事件阶段与可视节点推进错位：集中在纯函数中映射并用每个 stage 的测试保护。
- 成功提示永久残留：组件使用受控 effect 清理 timer，并用 fake timer 测试。
- 重连时旧 timer 隐藏新进度：进度变化时取消旧 timer并恢复可见。
- 失败提示被遮挡：失败事件先清理 progress，再显示现有 notice。
- 三窗口行为漂移：runtime 共用同一类型/映射函数，布局只挂载同一组件。

## 验证

- `pnpm vitest run src/workspace/connectionProgress.test.ts src/components/ConnectionRouteProgress.test.tsx src/workspace/WorkspaceProvider.test.tsx src/workspace/LayoutView.test.tsx`
- `pnpm check`

