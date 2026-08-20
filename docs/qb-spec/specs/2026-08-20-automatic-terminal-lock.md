# 自动终端锁与凭证有效期 Task Spec

Status: Complete (2026-08-20)。

## Goal

Qterm 使用两个跨平台且语义清晰的安全策略：凭证库按固定有效期自动锁定，终端在用户无操作达到设定时长后连同凭证库一起锁定。

## Scope

- 移除“Windows 锁屏后锁定凭证”设置、原生监听和锁定原因。
- 将原“定时锁定凭证”明确表达为“凭证库有效期”，继续从最近一次成功解锁或修改主密码开始计时，普通操作不续期。
- 新增“无操作后锁定终端”设备设置，默认关闭；开启时默认 15 分钟，可选 5、15、30、60、120 分钟。
- 键盘、指针按下和滚轮操作会重置终端空闲截止时间；终端输出、网络活动和窗口重绘不续期。
- 到期后复用既有“锁定终端和凭证”流程；后台 SSH、SFTP、Network 与 local PTY 会话继续运行。
- 焦点恢复、页面重新可见或系统唤醒后按绝对时间检查截止时间，避免挂起的前端定时器漏锁。
- 安全设置 schema 直接升级；旧版设置不迁移并允许清除后采用新安全默认值。

## Constraints

- 凭证固定有效期继续由 Rust application lifecycle 权威执行。
- 终端空闲判断和进程内锁屏由 Workspace 前端拥有；持久化模型只保存策略，不保存当前锁屏状态或最近活动时间。
- 自动终端锁只有在凭证库已初始化且非 legacy 时生效。
- 凭证锁定失败时不得显示终端已锁定；自动路径可在后续用户活动后重新计时。
- 不覆盖或重构工作区中无关的文件浏览、网络、更新检查和样式改动。

## Non-Goals

- 不迁移旧版 `settings.json` 的安全设置值。
- 不监听 Windows、macOS 或 Linux 的系统锁屏事件。
- 不暂停、断开或重连后台会话。
- 不把终端锁提升为操作系统安全边界，也不持久化终端锁状态。

## Acceptance

1. 安全设置页只显示“凭证库有效期”和“无操作后锁定终端”，不再出现 Windows 锁屏设置。
2. 新配置默认凭证有效期为 1 小时、终端空闲锁关闭；两项均可独立开关和选择时长。
3. 安全设置 DTO 与持久化 schema 只包含两种时长，拒绝越界值；旧 schema 被清除并回退新默认值。
4. 启用终端空闲锁后，达到截止时间会先锁定凭证库，再显示既有终端锁屏；后台会话不受影响。
5. 键盘、指针按下或滚轮输入会重置截止时间；终端输出不续期。
6. 页面恢复可见或窗口重新获得焦点时，若绝对截止时间已经过去，立即执行锁定。
7. 自动凭证锁仍从最近成功解锁或修改主密码开始计时，不受终端空闲活动影响。
8. 自动锁定失败不得产生假锁屏；解锁终端后重新开始空闲计时。

## Acceptance To Verification

- 1、2：`SettingsDialog` Testing Library 测试和样式契约。
- 2、3、7：settings domain/repository/command 与 credential lifecycle Rust 测试。
- 4—6、8：`WorkspaceShell` fake-timer 集成测试，覆盖输入续期、恢复检查、锁定失败和解锁重置。
- 全量：`pnpm check`、Rust fmt/clippy/tests、`git diff --check`。

## Open Questions

无。用户已确认不需要旧配置迁移，允许直接清除。

## Recommended Approach

采用 schema v2 的 `SecuritySettings { credential_auto_lock_after_seconds, terminal_auto_lock_after_seconds }`。Rust 继续只编排凭证生命周期；React WorkspaceShell 读取设备设置、维护非持久化最后活动时间，并复用既有终端锁动作。相比把两种计时合并到后端，这一方案保持安全密钥生命周期与 UI 隐私遮罩的所有权清晰，同时不新增平台 adapter。

## Next Skills

- `writing-qb-plans`：Strict，涉及安全 schema 与认证锁定行为。
- `maintaining-project-context`：更新长期自动锁定策略。
- `checking-architecture-boundaries`：保持 Rust credential lifecycle 与 Workspace UI idle policy 分离。
- `protecting-critical-behavior`：先补 schema、计时与失败路径回归测试。
- `verifying-before-completion`：执行前后端全量门禁。
- Directory Map: not needed（删除 Windows adapter，但不改变现有顶层目录或模块职责）。

## Verification Evidence

- `pnpm check`：通过；39 个测试文件、244 项测试全部成功，ESLint、TypeScript 与 Vite 生产构建成功。
- `cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test --all-targets --all-features`：通过；117 项成功，2 项环境依赖 OpenSSH 的测试按既有约定忽略。
- 本次修改的 Rust 文件经 `rustfmt --check --edition 2024`：通过。仓库级 `cargo fmt --check` 仍受大量既有 CRLF 文件阻塞；未为本任务改写无关文件。
- `git diff --check`：通过，仅输出工作树既有 LF/CRLF 转换提示。
