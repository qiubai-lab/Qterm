# 主界面凭证库锁定入口 Standard Plan

Status: Complete (2026-08-20)。

## Background

当前手动锁定入口位于凭证管理弹窗标题栏，用户必须先打开弹窗才能锁定。后端已经提供锁定 IPC 和全局状态事件，可支持主界面直接操作与跨组件同步。

## Requirement

将手动锁定入口迁移至主界面工具栏的系统设置上方，并保持状态、安全与错误处理行为可观察。

## Non-Goals

不修改凭证库后端、加密算法、持久化 schema、自动锁定策略或其他凭证管理操作。

## Architecture Impact

- `WorkspaceShell` 作为全局工具栏所有者，读取并订阅凭证库状态，调用既有前端 Tauri adapter。
- `CredentialDialog` 保留对状态事件的订阅，以便在主界面锁定时清除列表和已显示的秘密；移除其本地手动锁定入口。
- 无后端、domain、application、port 或 command 变更。

## Implementation Tasks

1. 调整组件测试，固定主界面入口位置、可用状态、事件同步、成功和失败行为。
2. 在 `WorkspaceShell` 增加凭证库状态订阅与锁定 action，将按钮放在系统设置上方。
3. 从 `CredentialDialog` 移除锁定按钮和不再使用的本地 handler。
4. 补充工具栏 disabled 状态样式，移除过期的弹窗锁定按钮样式。
5. 运行聚焦测试和 `pnpm check`，检查 diff 与格式。

## Acceptance To Verification

- 入口位置与弹窗移除：DOM 顺序及可访问查询断言。
- 状态同步与防重复：初始状态、事件回调、disabled 断言。
- 成功与失败：adapter mock 调用、状态保持和错误提示断言。
- 完整回归：`pnpm check`。

## Risks

- 主界面和弹窗状态不同步：两者都订阅同一后端事件，锁定成功时主界面同时做幂等本地更新。
- 初始化状态查询竞态：订阅先建立，查询结果只在组件仍挂载时写入；事件继续作为后续权威更新。
- 重复点击：执行期间 disabled，并在 handler 中再次守卫。

## Rollback Plan

恢复弹窗锁定按钮及 handler，删除主界面状态订阅和工具栏入口。后端和数据格式均未改变，无数据回滚步骤。

## Completion Evidence

- 主界面入口顺序、成功锁定、状态事件同步、失败恢复及弹窗入口移除均有组件回归测试。
- 禁用状态沿用紧凑工具栏视觉语言，并通过现有样式契约测试。
- `pnpm check` 全量通过；未修改 Rust 后端或持久化格式。
