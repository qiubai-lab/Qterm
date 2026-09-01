---
id: QB-20260819-file-connection-feedback
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

远程文件窗口在连接建立期间保持安静，仅在连接已明确失败时于窗口顶部显示准确错误。

## Scope

- 连接中、等待主机密钥、认证中、关闭中和未连接状态不显示文件连接错误。
- `failed` 状态在文件导航栏下方显示紧凑错误条，优先展示运行时失败原因。
- 连接成功后自动加载目标目录。
- 移除文件窗口外部重复的运行时错误提示。

## Constraints

- 不通过延迟、防抖或定时器判断失败。
- 已连接后的目录读取错误继续使用现有顶部错误条。
- 不修改会话状态协议或后端连接流程。

## Non-Goals

- 不重新设计认证或主机密钥确认界面。
- 不增加连接进度动画。

## Acceptance

- 建立连接期间不出现“文件连接尚未建立”等错误。
- 只有 `failed` 状态显示连接失败信息，且位置位于文件窗口顶部。
- 从连接中切换到已连接后正常请求目录。
- 同一失败信息不在文件窗口底部重复显示。

## Acceptance To Verification

- 组件测试覆盖 connecting、closed、failed 和 connecting → connected 状态。
- DOM 断言验证错误条紧邻文件导航栏之后。
- `pnpm check` 验证完整前端行为、类型和构建。

## Open Questions

无。

## Recommended Approach

使用 `FileRuntime.status` 作为唯一判断依据。文件组件在未连接状态跳过目录请求，仅由 `failed` 派生连接错误；成功连接后依靠现有响应式加载重新请求目录。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed
