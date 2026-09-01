---
id: QB-20260823-stable-qterm-data-root
status: archived
archived: 2026-09-02
legacy: true
---
## Background

当前组合根从系统 app-config 的 `storage-location.json` 决定连接、凭证和网络规则目录，并把 known-host、Workspace 与安全设置放在系统 app-data。定位文件或 AppData 状态变化会让应用回退到另一套数据。用户已选择固定 `~/.qterm` 分层结构，并明确放弃旧配置迁移。

## Requirement

新构建默认使用 `~/.qterm`，但允许用户配置整个 Qterm 根目录；定位文件固定保存在 `~/.qterm-location.json`，使启动前即可定位 data/device/cache，且不依赖系统 AppData。

## Non-Goals

- 不迁移、转换、合并或删除旧配置。
- 不更改各持久化文档的 schema version。
- 不接管 Tauri window-state 或 WebView 引擎缓存。
- 不修改 SSH、凭证加密或 host-key 校验规则。

## Architecture Impact

- `lib.rs` 组合根在构造任意 repository 前读取稳定 locator，并从选定 root 派生 data/device/cache。
- settings application service 同时负责安全设置与配置根目录选择；configuration directory domain/port 不接触 Tauri。
- settings command 只允许修改整个根目录并投影派生路径，不提供子目录写入。
- persistence repositories 继续只接收具体文件路径，不感知全局目录结构。

## Domain Model Impact

新增 `ConfigurationDirectory`，负责默认 `~/.qterm`、tilde 展开和绝对路径规则；`SecuritySettings` 不变。三个分区是配置根的固定派生布局。

## API Impact

- 提供窄化的 `settings_update_configuration_directory` 和 `settings_select_configuration_directory` commands。
- `SettingsSnapshot.general` 返回 `rootDirectory`、`activeRootDirectory`、`dataDirectory`、`deviceDirectory`、`cacheDirectory` 与 `restartRequired`。
- 前端只有配置根的 update/select API。

## Database Impact

文件内容 schema 不变；物理位置改变。旧位置文件按用户决定不迁移也不读取。

## Implementation Tasks

1. 先调整 Rust 定位契约测试和前端设置测试，表达“整个配置根可配置，分区不可单独配置”。
2. 实现 `ConfigurationDirectory`、固定 home locator repository 与 settings service 编排。
3. 组合根先加载配置根，再初始化其 data/device/cache 并构造全部 repositories。
4. 实现窄配置根 IPC；更新 SettingsDialog，把目录表单与派生路径拆成两个组件。
5. 更新长期产品、架构、决策文档与 Directory Map。
6. 运行聚焦验证和完整质量门。

## Acceptance To Verification

- A1：路径测试断言默认和 locator 指定根均让全部 repositories 随根目录切换。
- A2：同一测试断言 settings/known-hosts/workspaces 位于所选根的 `device/`。
- A3：同一测试断言 browser profiles 位于 `cache/`；目录初始化测试断言三个目录存在。
- A4：repository/service tests 断言保存只创建目标与 locator，不搬迁或删除旧文件，并标记重启生效。
- A5：settings command、TypeScript bridge 与 SettingsDialog tests 断言只有根目录存在 textbox、选择与恢复默认操作，并验证两个组件边界。
- A6：Rust settings tests、前端 SettingsDialog/WorkspaceShell tests，加上 `pnpm check` 与 Rust fmt/clippy/test。

## Test Plan

- `cargo test data_paths --all-features`
- `cargo test settings --all-features`
- `pnpm vitest run src/lib/tauri/settings.test.ts src/components/dialogs/SettingsDialog.test.tsx src/workspace/WorkspaceShell.test.tsx`
- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

## Rollback Plan

回滚代码会恢复配置根为 `~/.qterm`；本实现不移动或删除数据，自定义目录内容仍保留但不会被回滚版本读取。

## Risks

- 定位文件损坏时运行时回退默认配置根并警告，不能覆盖损坏文件。
- `secrets.vault` 与 profile 必须共同位于 `data/`，避免引用错配。
- known-hosts 移动后首次连接需要重新信任主机，这是放弃旧配置的预期结果。
- window-state 仍由 Tauri 插件管理，不应误称所有运行状态均位于 `.qterm`。

## Documentation Updates

- 更新 PRODUCT_SPEC、ARCHITECTURE_SPEC 与 DECISIONS，取代可配置数据目录决策。
- 更新 DIRECTORY_MAP 中 settings 和 composition-root 的职责。
