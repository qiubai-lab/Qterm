## Background

当前凭证库已支持初始化、解锁、手动 lock、clear 和 envelope encryption，但锁定只暴露为未接入 UI 的 IPC；静态设置弹窗没有持久化模型；Tauri 桌面 `WindowEvent` 不提供 Windows session lock。用户已确认首期仅支持 Windows 系统锁屏联动，并要求把锁定策略纳入系统设置，默认系统锁屏锁定开启、凭证会话有效期 3600 秒。同时继续完成凭证 header、强清库确认和主密码轮换。

## Requirement

实现 `docs/qb-spec/specs/2026-08-19-windows-credential-security-settings.md` 的全部 acceptance，形成后端可信、可配置、可测试的凭证安全生命周期。

## Non-Goals

- 不实现 macOS/Linux 系统锁屏 adapter。
- 不追踪普通键鼠 idle，不因 window blur 自动锁定。
- 不终止既有 SSH/SFTP session。
- 不实现其他系统设置项。
- 不迁移或修改 vault credential ciphertext 格式。

## Architecture Impact

### Boundary decision

- 新增独立 settings 垂直切片；安全设置不属于 Workspace、profile 或 vault document。
- Rust application credential lifecycle 是 lock policy 的唯一权威，拥有最近解锁时间、deadline generation/cancellation 和 lock reason；commands 与 React 不承载计时规则。
- Windows session listener 是 infrastructure inbound adapter，只输出 `Locked` 事件并调用应用用例；Win32 类型不越过 infrastructure/composition root。
- vault 状态变化通过不含秘密的事件通知前端，事件只用于失效 UI cache；后端状态始终权威。

### Placement

- Domain：`SecuritySettings { lock_on_windows_session_lock, auto_lock_after_seconds }`、范围校验和安全默认值。
- Application：settings load/update；credential unlock/lock/change-password 与 deadline 编排。
- Ports：settings repository；credential vault 增加 change-master-password 能力。
- Infrastructure：严格 JSON settings repository、Tokio deadline runtime、Windows WTS session listener、现有 JSON vault 的 data-key rewrap。
- Commands：DTO deny-unknown-fields、clear confirmation phrase校验、settings/credential use case 调用与稳定错误映射。
- Frontend：SettingsDialog 与 CredentialDialog 只维护表单、busy、错误、嵌套弹窗和状态刷新。

### Model separation

- Domain settings 不直接 Serialize；IPC DTO 与 persistence record 分开定义。
- `settings.json` 使用 schema v1，位于 app-data；`connections.json`/`secrets.vault` 继续位于 `~/.qterm`。
- `LockReason` 可进入无秘密事件与测试，但不持久化。

## Domain Model Impact

- 新增设备安全设置和值域：`lockOnWindowsSessionLock: bool`；`autoLockAfterSeconds: Option<NonZeroU32>`，启用范围 60–86400，默认 `Some(3600)`。
- 定时锁定是 unlock-session TTL：基准为最近一次成功 unlock 或 change-master-password，普通使用不续期。
- 所有 lock reason 共享同一幂等操作：清 runtime data key、取消 deadline、发布一次状态变化。
- change-master-password 必须验证旧密码、生成新 salt、新 KEK 和新 wrap nonce，保持 data key/check/credentials 不变并原子提交。

## API Impact

- 新增 `settings_get`、`settings_update_security`。
- 新增 `credential_vault_change_master_password`。
- `credential_vault_clear` 改为接收 `{ confirmation }` 并精确验证 `确认清除`。
- 现有 `credential_vault_lock` 复用统一 lifecycle lock，并产生状态变化事件。
- 前端 adapters 增加 settings API、change password 和 vault-status event listener；所有 DTO camelCase 且拒绝未知字段。

## Database Impact

- 新增 app-data `settings.json` schema v1：只保存两个安全策略字段，不包含 runtime timestamp、lock reason 或敏感值。
- 缺失文件返回默认设置；损坏/未知 schema 保留字节并回退安全默认值，同时保留可展示错误。
- `secrets.vault` schema 保持 v2；主密码修改只更新 `kdf` 和 `wrappedDataKey`。

## Affected Files

### Frontend

- `src/components/dialogs/SettingsDialog.tsx`、相邻测试（新增）。
- `src/components/dialogs/InfoDialogs.tsx`（移出静态 SettingsDialog，仅保留 Help）。
- `src/components/dialogs/CredentialDialog.tsx`、测试。
- `src/components/dialogs/MasterPasswordDialog.tsx` 或 feature-local `ChangeMasterPasswordDialog.tsx`、测试。
- `src/workspace/WorkspaceShell.tsx`、测试。
- `src/lib/tauri/settings.ts`、测试（新增）。
- `src/lib/tauri/credentials.ts`、测试。
- `src/components/Icon.tsx`、`src/app/app.css`、`src/app/appStyles.test.ts`。

### Rust

- `src-tauri/src/domain/settings.rs`、`domain/mod.rs`（新增）。
- `src-tauri/src/ports/settings_repository.rs`、`ports/mod.rs`（新增）。
- `src-tauri/src/application/settings_service.rs`、credential lifecycle/service、`application/mod.rs`。
- `src-tauri/src/infrastructure/persistence/json_settings_repository.rs`、mod（新增）。
- `src-tauri/src/infrastructure/windows/session_lock.rs`、windows/mod、infrastructure/mod（新增，Windows cfg）。
- `src-tauri/src/infrastructure/persistence/json_credential_vault.rs`。
- `src-tauri/src/ports/credential_vault.rs`。
- `src-tauri/src/commands/settings.rs`、commands/mod（新增）。
- `src-tauri/src/commands/credential.rs`、error mapping。
- `src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`、lockfile。

### Documentation

- `docs/qb-spec/context/PRODUCT_SPEC.md`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`
- `docs/qb-spec/DIRECTORY_MAP.md`（实现产生结构变化后）。

## Implementation Tasks

1. **先固定安全行为测试。** 为 settings defaults/validation、vault password rewrap、clear phrase、deadline 和 lock idempotence 添加失败测试；为 UI header、强确认、设置表单与嵌套弹窗添加 Testing Library 失败测试。
2. **实现 settings domain 与 persistence。** 新增安全默认值和值域；实现 schema v1 严格 reader/atomic writer、敏感字段拒绝、缺失默认、损坏保留与稳定告警；注册 settings service/commands/TS adapter。
3. **实现主密码 rewrap。** 扩展 vault port/application/command；旧密码解开并校验 data key，使用新 KDF salt 和 nonce 重包 data key；确保失败前不改 runtime/file，原子提交后保持 unlocked 并重置 TTL 基准。
4. **统一 credential lifecycle。** 将 initialize/unlock/lock/clear/change-password 的 runtime key 与 deadline 处理收口到 application/runtime coordinator；用 generation/abort 防止旧 timer 锁定新的 unlock session；手动/系统/timeout lock 幂等并发布无秘密事件。
5. **接入 Windows session lock。** 通过主窗口 HWND 注册 WTS session notification，隔离 `WM_WTSSESSION_CHANGE`/`WTS_SESSION_LOCK` 映射；按设置决定是否调用 lock；窗口销毁/应用退出时注销通知与 hook；忽略 unlock 自动解锁。
6. **实现系统设置页面。** 用标准设置 dialog 的“安全”分区提供两个 switch 和受控时长 select；显式保存、busy/error/success、禁用联动和持久化恢复；保留其他设置为只读/后续范围，不引入万能设置组件。
7. **重构凭证 header。** 状态在左，修改主密码、锁定、清除在右；锁定后清 reveal/list 并进入锁定 gate；监听状态事件处理系统/超时锁定；核心动作持续可见并有 aria-label。
8. **强化清库确认。** 从 sidebar 移除清除按钮；header danger action打开 compact dialog；输入精确短语才启用；command 再校验且错误输入零副作用。
9. **完成集成与文档。** 更新长期 context 与 Directory Map；Windows 上验证实际锁屏、超时、设置重启恢复、主密码变更与活跃 SSH session 不被断开。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1–4 默认与持久化 | Rust settings domain/repository/command tests；TS adapter；SettingsDialog tests |
| 5 TTL 与动态重配 | paused Tokio time/controlled clock tests：deadline、shorten immediate、disable cancel、stale timer generation |
| 6 Windows session lock | WTS message mapping unit test；Windows 实机 lock/unlock manual integration |
| 7 header | CredentialDialog RTL + CSS declaration tests + constrained viewport visual QA |
| 8 统一锁定 | vault/service tests；前端 event/reveal cleanup tests；活跃 session focused integration |
| 9 清库短语 | UI disabled/enabled tests；command DTO/error and byte-invariance tests |
| 10–11 主密码轮换 | vault old/new password round-trip、ciphertext equality、new salt/nonce、write failure unchanged tests |
| 12 交互状态 | Settings/Credential/ChangePassword/DialogFrame RTL keyboard and nested-modal tests |

## Test Plan

### Frontend focused

- SettingsDialog：默认、加载、保存、开关/时长联动、错误和 success。
- CredentialDialog：header 顺序、manual lock、事件锁定、reveal cleanup、typed clear、change password nested modal。
- IPC adapters：camelCase payload、clear phrase、change password、settings DTO。
- Styles：fixed header actions、窄宽度可用、focus-visible、reduced-motion。

### Rust focused

- Settings domain/repository/service/commands。
- Credential vault rewrap、tamper、wrong old password、weak new password、write failure、zeroize/locked behavior。
- Lifecycle timer with paused time；manual/system/timeout reasons and idempotence。
- Windows WTS message conversion and disabled-policy path。

### Gates

- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`
- Windows `pnpm tauri dev` manual matrix；因新增原生依赖和 hook，执行一次 `pnpm tauri build`。

## Rollback Plan

- settings schema 为独立新文件；回滚时可停止读取，不能自动删除用户设置文件。
- Windows listener 置于 `cfg(windows)` 独立 adapter，可单独撤回而不影响手动/timeout lock。
- change-master-password 不改变 vault schema/ciphertext；功能代码可回滚，已使用新密码重包的 vault 仍由现有 unlock 正常读取。
- 若 timer/runtime 协调器出现回归，优先回退自动策略但保留手动 lock；不得回退到前端 timer 或 window blur。

## Risks

- **原生窗口 hook 生命周期：** 未注销可能产生悬空回调；必须绑定 HWND 生命周期并在 destroy/exit 清理。
- **旧 timer 竞态：** 重解锁或修改设置后旧任务可能误锁；使用 generation/abort 并在 lock 后再次验证当前 session。
- **设置损坏导致 fail-open：** runtime 必须采用安全默认值，UI 同时提示但不覆盖损坏源。
- **前端状态滞后：** event 只做 cache invalidation，每个敏感 command 仍以后端 Locked 为准。
- **主密码轮换原子性：** 在成功 commit 前不替换 runtime data key/KDF；失败保持旧密码可用。
- **跨文件 clear：** 保留既有 profile/vault 协调语义并增加错误路径测试；若暴露部分提交，必须在实现阶段升级为应用层补偿/恢复，不能在 command 中隐藏失败。

## Documentation Updates

- 本轮更新 PRODUCT_SPEC、ARCHITECTURE_SPEC、DECISIONS。
- 实现新增模块后使用 `updating-directory-map` 更新 Directory Map。
