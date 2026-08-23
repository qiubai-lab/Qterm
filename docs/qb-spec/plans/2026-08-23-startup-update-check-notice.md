> 实施状态（2026-08-23）：Phase 0–4 已完成。`device/updates.json`、Settings 聚合、默认关闭的关于页开关、启动静默检测、5 秒主题色按钮呼吸、回归测试与长期上下文均已落地并通过完整质量门。

## Background

Qterm 已有手动更新检测 adapter 与“关于”页结果弹窗，但没有启动偏好或全局更新提示。现有 Settings 聚合 security、configuration 与 appearance；新增能力涉及持久化 schema、IPC、启动副作用和跨组件提示，因此使用 Strict plan。

## Requirement

在“关于”页增加默认关闭的启动自动检测开关。启用后应用启动静默检查稳定版更新；发现新版时“关于”按钮按当前主题强调色呼吸 5 秒，不显示额外气泡。

## Architecture Impact

- settings domain 新增 `UpdateSettings`；SettingsService 聚合第四个 repository，但更新检查网络行为不进入 service/domain。
- 新增 `UpdateSettingsRepository` 与 JSON adapter，独立保存到 active configuration root 的 `device/updates.json`。
- `WorkspaceShell` 负责启动时一次性 orchestration 和通知生命周期；`HelpDialog` 只呈现受控偏好与局部保存反馈。
- `src/lib/updateCheck.ts` 继续独占 GitHub transport、稳定 SemVer 比较和固定 Release opener。

## Domain Model Impact

- `UpdateSettings { auto_check_on_startup: bool }`，默认 `false`。
- 该偏好是设备级应用行为，不是 Workspace、theme、security 或 release domain state。

## API Impact

- `settings_get` 新增 `updates: { autoCheckOnStartup: boolean }`。
- 新增 `settings_update_updates`，严格输入同一字段并返回完整 Settings snapshot。
- TypeScript settings bridge 增加 `UpdateSettings` 与 `updateUpdateSettings`。

## Database Impact

- 新增 `device/updates.json` schema v1，仅包含 `schemaVersion` 与 `autoCheckOnStartup`。
- 缺失文件使用关闭默认；损坏、未知字段、超限和未来版本安全回退且不能被保存覆盖。
- 不迁移或改写现有 `settings.json`、`appearance.json`、Workspace、profiles 或 credentials。

## Implementation Tasks

### Phase 0 — Contracts and regression protection

1. 写入当前 spec/plan，并先增加 UpdateSettings 默认值、repository strictness 与 IPC DTO 失败测试。
2. 为 HelpDialog 开关和 WorkspaceShell 启动检查建立 observable-behavior 测试；使用 mock adapter 与 fake timers，禁止真实网络。

### Phase 1 — Domain, persistence and IPC

1. 在 settings domain/port 增加 UpdateSettings 与 UpdateSettingsRepository。
2. 新增 `JsonUpdateSettingsRepository`，复用 appearance adapter 的大小限制、strict serde、原子写入和保留损坏文件策略。
3. 扩展 SettingsService generic、snapshot、warning 聚合与 update 用例，并更新所有组合根和测试构造器。
4. 扩展 command DTO、state、command registration 与 frontend bridge。

### Phase 2 — About preference control

1. 扩展 HelpDialog props，增加受控 switch、简短说明、busy/disabled 和局部 error。
2. 将开关放在手动按钮之前，保持检测卡在窄窗口可换行且手动按钮稳定。
3. WorkspaceShell 保存偏好成功后以返回 snapshot 为准更新本地状态；失败时保持旧值。

### Phase 3 — Startup check and transient notice

1. 首次 settings load 成功后写入 security/update state；只有 update preference 为 true 时调用一次 `checkForUpdate`。
2. 只将 `available.latestVersion` 映射为通知；latest/error 静默丢弃，unmount 后不得提交状态。
3. 在 About rail button 增加瞬时 attention 状态，不创建额外浮层或改变 rail/layout 结构。
4. attention 使用主题 `navigation-accent`、5 秒颜色/阴影呼吸；通过按钮可访问名称携带版本号，点击或打开 About 时清除，reduced motion 下静态强调。

### Phase 4 — Verification and durable context

1. 运行 focused frontend/Rust tests，再运行 `pnpm check` 与 Rust fmt/clippy/test。
2. 手工检查三主题、窄窗口、键盘 focus、reduced motion，以及网络失败/最新版/新版三条路径。
3. 更新 Architecture Spec 与 Directory Map，记录 update setting 独立持久化和 WorkspaceShell orchestration 边界。

## Test Plan

- Frontend focused：`pnpm vitest run src/lib/tauri/settings.test.ts src/components/dialogs/InfoDialogs.test.tsx src/workspace/WorkspaceShell.test.tsx src/components/dialogs/aboutUpdateStyles.test.ts`
- Frontend full：`pnpm check`
- Rust focused：在 `src-tauri` 运行 `cargo test settings --all-targets --all-features`
- Rust full：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`
- Manual：Dark/Light/Cyberpunk；开关成功/失败；available/latest/error；按钮呼吸自动消失、点击打开、键盘 focus 与 reduced motion。

## Rollback Plan

- 新偏好使用独立文件；移除 command/repository/UI 后，遗留 `updates.json` 不影响任何旧能力。
- 默认关闭且启动检查失败静默，发生 adapter 问题时可先停用 shell orchestration而不修改手动检测。
- 不通过删除或重写其他 settings、Workspace、profile 或 credential 数据回滚。

## Risks

- SettingsService 新增 generic 会影响多个 Rust 测试构造器；用编译器和全量测试定位所有组合点。
- React StrictMode 或重渲染可能重复启动请求；检测必须绑定单次 mount，并用 disposed guard 防止过期提交。
- 自动消失 timer 可能在卸载后提交；effect cleanup 必须清理 timeout。
- 呼吸阴影若过强会抢夺注意力；只使用主题导航强调色并限制为 5 秒，reduced motion 下保持静态。
- 偏好保存失败若乐观切换会误导用户；使用受控状态并以成功 snapshot 更新。

## Documentation Updates

- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`：新增独立 update preference persistence 与启动检查 orchestration 边界。
- `docs/qb-spec/DIRECTORY_MAP.md`：记录 update settings adapter 与 frontend update adapter/owner 职责。
