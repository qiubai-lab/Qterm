# Non-blocking Recovery File Dialogs

## Goal

初始化凭证库或重置主密码时，恢复密钥的系统文件选择面板能够正常响应并完成或取消，不再阻塞 Qterm 与 macOS Open and Save Panel Service。

## Scope

- 修复初始化凭证库时保存恢复密钥面板造成的主线程阻塞。
- 同步修复恢复流程中选择旧恢复密钥、保存替代恢复密钥的同类调用。
- 保持恢复文件的生成、权限、原子提交/失败清理与取消语义不变。
- 为文件面板的异步桥接补充 Rust 回归测试。

## Constraints

- 原生文件面板必须使用 `tauri-plugin-dialog` 的非阻塞 API，不得从同步 Tauri 命令调用 blocking API。
- 恢复密钥内容与文件路径继续只在 Rust 后端处理，不进入 WebView 或日志。
- 用户取消文件选择仍返回 `{ completed: false }`，不得创建凭证库或修改现有 vault。
- 不改变 `secrets.vault`、恢复密钥文件格式或前端 IPC 契约。

## Non-Goals

- 不重设计主密码或恢复密钥对话框 UI。
- 不修改传输、数据目录或普通私钥导入的文件选择流程。
- 不进行凭证库格式迁移或密码学实现变更。

## Acceptance

1. 初始化时打开恢复密钥保存面板不会阻塞主进程，用户可选择目标并完成初始化。
2. 取消初始化保存面板会正常返回，且不会创建 vault 或恢复文件。
3. 主密码恢复流程中的旧密钥选择和新密钥保存同样使用非阻塞面板。
4. 面板结果成功、取消或发送端异常结束时，异步桥接都能结束等待并返回明确结果。
5. 恢复文件的独占创建、Unix `0600` 权限、写入同步及失败清理行为保持不变。

## Acceptance To Verification

- A1/A3：Rust 编译与 Clippy 证明三个命令及路径选择 helper 均使用可等待的非阻塞调用链；macOS 桌面手工复验记录为最终补充证据。
- A2：既有前端取消测试保持通过；代码审查确认取消在任何 vault 准备/提交前返回。
- A4：新增 Rust 单元测试覆盖回调成功、取消和回调发送端丢弃。
- A5：保留并运行现有恢复文件创建、大小限制与命名测试；运行完整 Rust 测试。

## Open Questions

- 无。

## Recommended Approach

将恢复文件保存/选择 helper 改为 `async`，使用 `tauri-plugin-dialog` 的 `save_file` / `pick_file` 回调 API，并通过 Tokio oneshot 通道把一次性结果安全地桥接回命令 future。三个涉及恢复密钥系统面板的 Tauri 命令随之改为异步命令。相较仅将同步命令改成 `async` 后继续调用 blocking API，此方案不占用工作线程，更直接消除主线程和原生面板事件循环互等的条件。

## Next Skills

- `writing-qb-plans`：使用 Strict 计划覆盖安全敏感回归。
- `checking-architecture-boundaries`：文件面板适配留在 command 层，vault 规则留在 application/domain 层。
- `protecting-critical-behavior`：为已发生的阻塞回归补 Rust 自动化保护。
- `verifying-before-completion`：运行 focused Rust 测试、fmt、Clippy、完整 Rust 测试与前端门禁。
- Directory Map：不需要；本次不改变目录、模块职责或入口。
