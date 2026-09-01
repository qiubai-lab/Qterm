---
id: QB-20260820-configurable-data-directory
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

在系统设置中新增可配置的可迁移数据目录，默认 `~/.qterm`；初始化空目标目录，明确要求用户手动迁移 `connections.json` 与 `secrets.vault`，并保持其他设备本地配置路径不变。

## Scope

包含数据目录值对象、定位 repository/application service、Tauri IPC、组合根路径构造、设置 UI、测试与长期产品/架构决策更新。不包含自动迁移、运行时热切换和旧文件清理。

## Affected Files

- `src-tauri/src/domain/settings.rs`
- `src-tauri/src/ports/settings_repository.rs`
- `src-tauri/src/application/settings_service.rs`
- `src-tauri/src/infrastructure/persistence/json_settings_repository.rs`
- `src-tauri/src/commands/settings.rs`
- `src-tauri/src/commands/error.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/settings.ts` 与相邻测试
- `src/components/dialogs/SettingsDialog.tsx` 与相邻测试
- `src/app/app.css`
- `docs/qb-spec/context/PRODUCT_SPEC.md`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`

## Design

- Domain：`DataDirectory` 负责默认值、空值、tilde 展开与绝对路径规则，不接触文件系统。
- Port/Application：独立数据目录 repository 与 service 负责编排载入、保存、警告和 active/configured 差异。
- Infrastructure：schema-versioned JSON 定位文件原子写入；保存前创建/验证目标目录，损坏文件拒绝覆盖。
- Composition root：从可迁移目录派生连接与凭证路径，从系统 app-data 派生 known-hosts、Workspace 与安全设置路径。
- UI：设置侧栏新增“通用”，提供路径输入、目录选择、恢复默认和精确到两个文件的迁移提示；保存后显示重启状态。

## Acceptance To Verification

- 默认与路径规则 → domain tests。
- 初始化与定位文件保护 → JSON repository tests。
- 可迁移与设备本地路径隔离 → composition helper test。
- IPC 契约 → TypeScript adapter tests 和 Rust DTO tests。
- 通用/安全界面行为与滚动契约 → SettingsDialog/样式 tests。
- 整体回归 → `pnpm check` 与 Rust 全测试。

## Test / Verification

1. 先补 Rust 路径规则、repository 和前端设置行为测试，确认关键测试在实现前失败。
2. 完成后运行相关 Vitest 与 `cargo test settings` 聚焦测试。
3. 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
4. 运行 `pnpm check`。

## Documentation Updates

更新产品原则、架构持久化边界和 accepted decision，记录仅连接与凭证跟随可迁移目录、固定定位文件、重启生效及不自动迁移规则。Directory Map 无需更新。
