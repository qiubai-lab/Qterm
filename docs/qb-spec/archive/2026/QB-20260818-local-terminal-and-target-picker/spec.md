---
id: QB-20260818-local-terminal-and-target-picker
status: archived
archived: 2026-09-02
legacy: true
---
# 本地终端与连接选择器 Task Spec

Status: Completed on 2026-08-18. Frontend checks, focused PTY tests, relaxed Clippy, native Windows PTY/manual verification, and UI visual checks passed. The repository-wide strict Rust gate remains blocked by pre-existing auth warnings and one unrelated SSH connection-failure test.

## Goal

每个新建终端 Block 默认打开本机交互式 Shell，并允许用户点击 Block 左上角名称，在本地终端与连接管理中保存的 SSH 配置之间切换。

## Scope

- 为 Windows、macOS 和 Linux 提供本地 PTY 会话的创建、输入、缩放、输出和关闭能力。
- `profileId: null` 明确定义为本地终端；新工作区和新分割 Block 自动启动本地会话。
- 将 Block 左上角终端名称改为可点击的目标选择器。
- 选择“本地终端”时关闭当前 SSH 会话并启动新的本地 Shell。
- 选择 SSH 配置时关闭当前本地/远程会话、绑定配置，并打开现有连接管理界面输入本次凭据后连接。
- 本地与 SSH 会话共用现有 xterm 输入、输出、resize 和 Block 生命周期。

## Constraints

- 不保存密码、私钥口令或其他临时认证信息。
- 本地进程由独立基础设施适配器拥有；Tauri command 只做 IPC 编排。
- SSH 会话和本地会话的字节流必须继续按稳定 Block ID 隔离。
- 工作区持久化 schema 不变化，已有 `profileId` 语义保持兼容。
- 目标选择器不能触发 Block 拖动。

## Non-Goals

- 不增加自定义 Shell 路径、启动参数或环境变量设置界面。
- 不为 SSH 凭据增加系统钥匙串存储。
- 不修改连接配置的数据模型与主机密钥安全策略。

## Acceptance

1. 新工作区与新分割 Block 在桌面运行时自动打开系统默认 Shell，并可输入、输出和调整尺寸。
2. 左上角名称显示“本地终端”或当前 SSH 配置名，点击后列出本地终端和所有已保存连接。
3. 从 SSH 切回本地时关闭旧会话并启动干净的本地终端。
4. 选择 SSH 配置时绑定目标并打开连接管理界面；临时凭据仍只用于本次连接。
5. 关闭 Block、工作区或应用相关流程会关闭对应的本地/SSH 会话，不发生跨 Block 输出串流。
6. 前端检查、Rust 格式/Clippy/测试和桌面手工验证通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1, 3, 5 | 本地 PTY manager 测试、WorkspaceProvider 会话路由测试、桌面输入输出与 resize 验证。 |
| 2, 4 | 目标选择器组件测试与桌面交互验证。 |
| 5 | 多 Block 字节隔离回归测试和关闭路径测试。 |
| 6 | `pnpm check`、Rust fmt/clippy/test、桌面截图。 |

## Open Questions

无。第一版使用操作系统默认 Shell，不提供 Shell 偏好设置。

## Recommended Approach

方案 A：使用跨平台 PTY adapter，增加本地 session IPC，并在 WorkspaceProvider 中按 session kind 统一路由。方案 B：用普通子进程管道模拟终端。推荐方案 A；PTY 能正确处理交互式 Shell、终端尺寸和控制序列，而普通管道在 PowerShell、bash/zsh 交互场景下行为不完整。目标选择器只负责目标切换；SSH 认证继续复用连接管理界面，避免复制敏感凭据表单。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed；这是单次功能扩展，未改变长期产品定位。
- Directory Map: not needed；新增文件位于现有 terminal/workspace/commands/infrastructure 边界内，目录职责不变。
