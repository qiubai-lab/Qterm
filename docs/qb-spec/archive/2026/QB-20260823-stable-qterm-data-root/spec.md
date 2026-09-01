---
id: QB-20260823-stable-qterm-data-root
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

Qterm 默认从 `~/.qterm` 读取全部配置，同时允许用户把整个配置根目录指向其他绝对路径；覆盖安装或卸载后重装仍能通过用户 home 下的稳定 locator 找回该目录。

## Scope

- 默认 `~/.qterm` 为 Qterm 配置根目录，并允许用户配置其他绝对目录。
- `data/` 保存 `connections.json`、`secrets.vault` 与 `network-forwards.json`。
- `device/` 保存 `settings.json`、`known-hosts.json` 与 `workspaces.json`。
- `cache/` 保存可重新生成的浏览器代理 profile 数据。
- 系统设置“通用”页允许编辑或选择整个 Qterm 配置目录；派生的核心、设备和缓存路径只读展示。
- 启动时创建三个分层目录。

## Constraints

- 用户明确允许放弃旧配置；不读取、复制、合并、转换或自动删除旧位置文件。
- 不修改当前机器上的真实用户配置，仅改变新构建的运行时路径规则。
- 当前 schema 严格读取规则保持不变。
- 凭证正文、主密码和私钥不得进入 WebView 或日志。
- Tauri Commands → Application → Domain / Ports ← Infrastructure 的依赖方向保持不变。

## Non-Goals

- 不迁移旧 `~/.qterm` 根目录文件或系统 AppData 文件。
- 不迁移 `connections.json` v4/v5、旧 vault 或旧 Workspace schema。
- 不把 Tauri window-state 插件或 WebView 引擎缓存迁出其框架管理目录。
- 不允许单独修改 `data/`、`device/` 或 `cache/` 子目录。
- 不修改卸载器行为或删除任何用户文件。

## Acceptance

1. 组合根默认从 `~/.qterm` 构造全部 repositories；`~/.qterm-location.json` 存在且有效时从其指定根目录构造。
2. profile、credential 和 network repositories 从所选根目录的 `data/` 构造；known-host、Workspace 与安全设置从 `device/` 构造。
3. 浏览器代理 profile 位于所选根目录的 `cache/browser-profiles`，三个分层目录在启动时初始化。
4. 修改配置根只初始化目标分层目录并保存稳定定位，重启后生效；不读取、复制、覆盖或删除旧目录数据。
5. 系统设置把“配置目录设置”和“配置路径”拆为两个组件；前者提供路径编辑、系统目录选择、恢复默认和当前加载值，后者只读预览三个派生路径。
6. 安全设置保存、凭证锁定和其他既有设置行为保持不变。

## Acceptance To Verification

- A1–A4：Rust `DataPaths`、configuration location domain/repository/service tests 验证默认/自定义根、定位持久化、全分区切换与旧数据不搬迁。
- A5：Settings IPC 和 Testing Library 测试验证整个根目录可编辑/选择、两个组件分离且派生路径只读。
- A6：settings repository/service/command tests 与现有前端设置测试；运行完整 Rust 和前端质量门。

## Open Questions

无。用户已明确允许放弃旧配置，不需要迁移或恢复流程。

## Recommended Approach

由 Rust 组合根先从固定 `~/.qterm-location.json` 解析唯一可配置的 Qterm 根，再从该根统一派生 data/device/cache 和所有 repository 路径。配置目录规则由 domain/application/port 管理，command 只处理 DTO 与系统选择器；三个子目录没有独立写 API。相比把 locator 放在可移动根内部或系统 AppData，这既能在启动前找到整套配置，又不依赖安装生命周期。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `maintaining-project-context`
- `verifying-before-completion`
- `updating-directory-map`：组合根路径职责和 settings adapter 边界发生变化。
