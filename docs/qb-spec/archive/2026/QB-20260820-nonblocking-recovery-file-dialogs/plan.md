---
id: QB-20260820-nonblocking-recovery-file-dialogs
status: archived
archived: 2026-09-02
legacy: true
---
# Non-blocking Recovery File Dialogs Implementation Plan

## Background

恢复密钥路径 helper 当前调用 `blocking_save_file` / `blocking_pick_file`，而初始化与恢复命令是同步 Tauri 命令。`tauri-plugin-dialog` 明确禁止在主线程调用这些 blocking API；在 macOS 上保存面板需要应用事件循环推进，形成主线程等待面板、面板等待主线程的阻塞。

## Requirement

所有恢复密钥系统文件面板改用非阻塞调用链，保持现有安全、取消、提交和错误语义。

## Non-Goals

- 不改变前端交互、IPC DTO、vault 或恢复文件格式。
- 不借机重构其他文件选择器。
- 不改变恢复密钥生成和密码学逻辑。

## Architecture Impact

- 文件面板与 callback-to-future 桥接属于 Tauri command adapter，保留在 `commands/credential.rs`。
- application lifecycle 继续编排 vault 操作；domain/infrastructure 继续拥有验证、加密与持久化规则。
- 不新增跨层 DTO 或依赖方向。

## Domain Model Impact

无。`RecoveryKeyFile`、vault generation 与恢复提交规则保持不变。

## API Impact

无前端契约变化。Rust command 实现从同步变为异步，但命令名、输入和序列化结果不变。

## Database Impact

无。文件格式与数据目录均不变。

## Implementation Tasks

1. 先为 callback-to-future 桥接补充成功、取消和发送端丢弃的 Rust 回归测试。
2. 实现通用的一次性文件面板结果等待 helper，并把恢复文件保存/选择 helper 改为非阻塞异步实现。
3. 将初始化、恢复准备、恢复提交三个 Tauri 命令改为异步并等待面板结果。
4. 检查取消路径仍发生在恢复材料生成、文件写入或 vault 提交之前。
5. 运行 focused tests、格式化、Clippy、完整 Rust 测试与前端 `pnpm check`。

## Acceptance To Verification

- A1/A3：`cargo clippy --all-targets --all-features -- -D warnings` 和代码审查确认恢复密钥命令不再调用 blocking dialog API。
- A2：`MasterPasswordDialog.test.tsx` 的取消行为测试通过，并审查后端早返回顺序。
- A4：新增 `credential.rs` 单元测试验证 bridge 的 `Some`、`None` 与 sender-drop 结果。
- A5：`cargo test --all-targets --all-features` 中现有 recovery file 测试通过。

## Test Plan

- Focused Rust：`cargo test commands::credential::tests --all-features`。
- Rust quality gate：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- Frontend contract：`pnpm vitest run src/components/dialogs/MasterPasswordDialog.test.tsx src/components/dialogs/RecoveryMasterPasswordDialog.test.tsx`，最终运行 `pnpm check`。
- 手工：在 macOS 打开初始化保存面板，确认可编辑文件名、切换目录、取消和保存；该项若当前会话无法稳定驱动桌面应用，则作为残余复验项明确报告。

## Rollback Plan

恢复三个命令及两个路径 helper 的同步 blocking 实现即可回滚；无数据迁移。若异步通道异常，命令返回现有恢复文件存储错误，不提交 vault。

## Risks

- 原生面板回调若因运行时异常未发送结果，future 不能永久等待；通过 sender 生命周期和接收错误映射确保结束。
- 命令 future 可能跨线程恢复；仅传递 `PathBuf`，不让文件面板对象或敏感材料跨回调边界。
- 改动覆盖三个同源入口以避免只修初始化、遗留恢复流程死锁。

## Documentation Updates

- 新增本 task spec 与 plan。
- 无长期产品、领域或架构决策变化，不更新 context 文档。
- 无目录结构变化，不更新 Directory Map。
