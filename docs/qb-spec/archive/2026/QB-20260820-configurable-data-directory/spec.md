---
id: QB-20260820-configurable-data-directory
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

用户可以在系统设置中查看并修改 Qterm 的可迁移数据存储目录；默认目录为 `~/.qterm`，空路径回退到该默认值，目标目录会被初始化，已有连接与凭证数据由用户自行迁移。

## Scope

- 在系统设置中新增“通用”分类和数据目录编辑/选择能力。
- 用设备本地启动定位文件持久化所选目录，并在下次启动时生效。
- 仅将 `connections.json` 与 `secrets.vault` 置于所选可迁移目录。
- `known-hosts.json`、`workspaces.json` 与 `settings.json` 保持系统 app-data 默认路径，不受该设置影响。
- 保存时创建尚不存在的目标目录；空输入恢复 `~/.qterm`。
- 明确提示不会自动迁移已有配置，变更后需要重启。

## Constraints

- 不自动复制、移动、覆盖或删除任何已有配置文件。
- 目录定位文件必须留在固定的系统 app-config 位置，避免启动时循环依赖。
- 只接受绝对路径、`~` 或 `~/...`；路径异常时保持原文件并使用安全默认值。
- 维持 Tauri Commands → Application → Domain / Ports ← Infrastructure 的依赖方向。

## Non-Goals

- 不实现自动迁移、合并或配置版本转换。
- 不在运行中热切换已经构造的 repository 和活动会话。
- 不删除旧 app-data 或旧数据目录。

## Acceptance

- 首次启动或定位值为空时，可迁移目录为 `~/.qterm`，目录不存在则创建。
- 用户可输入路径或通过系统目录选择器选择目录；非法相对路径被拒绝。
- 保存新目录后 UI 提示重启生效和手动迁移，应用下次启动仅从新目录构造连接与凭证 adapter。
- known-host、Workspace 与安全设置 adapter 始终从系统 app-data 构造。
- 已有目标目录和已有定位文件不会被静默覆盖或迁移。
- “通用”和“安全”设置分类均可通过键盘访问，且仅内容区滚动。

## Acceptance To Verification

- Rust domain/repository tests覆盖默认/空路径、`~` 展开、相对路径拒绝、目录初始化、损坏定位文件保护与往返持久化。
- Rust composition-root helper test覆盖仅连接与凭证位于可迁移目录，其余三类文件位于系统 app-data。
- 前端 IPC tests覆盖读取、保存和目录选择命令形状。
- SettingsDialog tests覆盖分类切换、路径编辑、恢复默认、保存后的迁移/重启提示与安全设置回归。
- 运行聚焦测试、`cargo fmt --check`、`cargo test --all-targets --all-features` 和 `pnpm check`。

## Open Questions

无阻塞问题。路径变更按下次启动生效实现。

## Recommended Approach

使用固定 app-config 下的小型定位文件保存解析后的可迁移目录；应用组合根启动时先读取定位文件，缺失或异常则使用 `~/.qterm`，再以该目录仅构造连接与凭证 repositories。设备本地 repositories 仍由 app-data 构造。系统设置提供通用页，保存时验证并初始化目标目录，但不迁移数据。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `maintaining-project-context`
- `verifying-before-completion`
- Directory Map: not needed；不改变目录、模块或 adapter 边界，只在现有 settings/persistence 职责内扩展。
