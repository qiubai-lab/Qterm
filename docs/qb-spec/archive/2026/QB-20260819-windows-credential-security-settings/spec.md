---
id: QB-20260819-windows-credential-security-settings
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

为 Windows 首期建立完整、可配置且后端可信的凭证生命周期：用户可手动锁定，系统锁屏或凭证会话到期可自动锁定；系统设置持久化安全策略；高风险的清库和主密码变更拥有明确防误触与原子安全语义。

## Scope

- 将现有静态“系统设置”扩展为可工作的设置页面，首个可编辑分区为“安全”。
- 提供“Windows 锁屏后自动锁定凭证”开关，默认开启。
- 提供“指定时间后自动锁定凭证”开关与时长选择，默认开启且为 3600 秒。
- 自动锁定时长从最近一次成功解锁或成功修改主密码开始计算，不因普通鼠标、键盘、窗口焦点或凭证读取活动重置。
- 安全设置作为设备本地配置持久化，不进入 `~/.qterm` 可迁移目录，也不进入 Workspace 文档。
- 凭证管理 header 右侧依次放置锁定状态、修改主密码、锁定、清除凭证库；清除操作位于业务操作最右侧、关闭按钮左侧。
- 手动锁定、Windows 系统锁屏锁定与超时锁定统一清除 Rust 运行时 data key 和前端已 reveal 的密码；不删除持久化凭证、不关闭既有 SSH/SFTP 会话。
- 清除凭证库确认弹窗要求准确输入 `确认清除`，并在 Tauri command 边界再次校验。
- 修改主密码要求旧密码、新密码与确认；后端验证旧密码后使用新 salt/KDF 重新包装现有 data key，并原子写回 vault。

## Constraints

- 首期系统锁屏监听只支持 Windows；macOS/Linux 不声明该能力，但手动锁定和超时锁定保持平台无关。
- 系统锁屏必须使用 Windows 会话通知，禁止用 `blur`、窗口失焦或 `visibilitychange` 近似。
- Windows 解锁不得自动解锁凭证库；只能由用户重新输入主密码。
- 主密码至少 12 个字符；主密码、KEK、data key、私钥正文和口令不得进入设置文件、事件 payload、日志或 panic message。
- 计时和锁定判定由 Rust 应用/runtime 边界拥有；React 只展示状态和发起设置更新。
- `settings.json` 缺失时使用安全默认值；文件损坏或 schema 不支持时保留原始字节、运行时回退安全默认值，并向 UI 暴露稳定存储告警。
- 设置保存使用原子写入；仅接受当前 schema，不实现旧 schema 迁移。
- 超时设置在领域层表达为可选秒数；启用时允许 60–86400 秒，UI 首期提供受控常用选项并以秒持久化。

## Non-Goals

- 首期不实现 macOS NSWorkspace 或 Linux logind/DBus 锁屏监听。
- 不因锁定凭证库而断开已经建立的 Terminal/Files 会话。
- 不按普通用户活动重置凭证有效期，也不实现全局 idle-input 追踪。
- 不把安全设置做成可迁移配置或与凭证库密文打包。
- 不修改 AES-GCM 加密对象格式，不逐条重加密凭证。
- 不在本任务中开放主题、字体、滚动缓冲等其他设置编辑能力。

## Acceptance

1. 首次启动或不存在设置文件时，`lockOnWindowsSessionLock=true`、`autoLockAfterSeconds=3600`；设置页准确显示这些默认值。
2. 安全设置保存到设备 app-data 的 `settings.json` schema v1，重启后恢复；文件不包含任何敏感值。
3. 设置文件损坏、包含未知字段、敏感字段或非当前 schema 时不被覆盖，运行时采用安全默认值并展示稳定告警。
4. 用户可以分别关闭 Windows 锁屏锁定和定时锁定；重新启用定时锁定时可以选择 60–86400 秒内的受控时长。
5. 凭证成功解锁后启动 Rust 侧截止时间；到期即锁定。修改时长时按最近一次成功解锁时间重新计算：新截止时间已过去则立即锁定，禁用则取消截止时间。
6. Windows 收到当前会话 `WTS_SESSION_LOCK` 时，仅在设置开启时锁定；`WTS_SESSION_UNLOCK` 不自动解锁。
7. 凭证管理 header 的业务操作顺序为状态、修改主密码、锁定、清除凭证库；锁定和清除无需 hover 才可发现，并有可访问名称。
8. 手动、系统和超时锁定均释放 zeroizing runtime data key，取消未完成的定时任务，清除所有前端 reveal 状态，并让 list/load/reveal 返回 Locked；既有 SSH/SFTP 会话继续运行。
9. 清库确认文字不是精确 `确认清除` 时最终按钮禁用；即使绕过 UI 调用 command，后端也拒绝且 profile/vault 字节不变。
10. 修改主密码时旧密码错误、新密码过弱或确认不一致均不修改 vault；成功时旧密码失效、新密码可解锁，所有既有密码和私钥凭证仍可读取。
11. 修改主密码只生成新 KDF salt 和新的 wrapped-data-key nonce，并重新包装同一个 data key；凭证 ciphertext、ID、引用和 vault schema 保持不变，写入失败时原文件保持不变。
12. 安全设置保存、主密码修改、锁定和清库期间提供 busy/error/success 状态；嵌套弹窗只允许最上层响应 Escape 和焦点循环。

## Acceptance To Verification

- 1–4：settings domain/repository/command/IPC tests + SettingsDialog Testing Library tests。
- 5、8：credential lifecycle 使用可控时钟或暂停 Tokio 时间测试 deadline、重配、取消和锁定后访问拒绝。
- 6：Windows 消息映射纯函数测试 + Windows 桌面手工/集成验证清单。
- 7、9、12：CredentialDialog/SettingsDialog/DialogFrame tests 与样式契约测试。
- 9：command DTO 测试确认错误短语零副作用。
- 10–11：JsonCredentialVault round-trip、旧/新密码、nonce/salt、字节不变与原子写失败测试。
- 全部：前端 `pnpm check`；Rust fmt、clippy、all-target tests；Windows `pnpm tauri dev` 聚焦验收；原生依赖变化补 `pnpm tauri build`。

## Open Questions

无。首期平台、默认策略和时长语义均已确定。

## Recommended Approach

采用“Rust 权威生命周期 + 设备本地安全设置 + Windows 原生会话适配器”。设置 repository 与 vault 分离；application 层协调 unlock timestamp、deadline 与统一 lock；Windows infrastructure 只把 WTS 消息转换成系统会话事件；前端监听无秘密的 vault 状态变化并刷新。相比 React timer/窗口失焦方案，该方案在 WebView 暂停时仍可靠；相比一次覆盖三平台，能控制首期原生风险并保留未来 adapter 扩展点。

## Next Skills

- `writing-qb-plans`：Strict。
- `checking-architecture-boundaries`：新增 settings 与 credential lifecycle 边界。
- `protecting-critical-behavior`：主密码轮换、系统锁定、截止时间和 destructive confirmation 必须先有回归保护。
- `verifying-before-completion`：前后端全量门禁和 Windows 原生验收。
- `maintaining-project-context`：安全默认值、设备本地设置和 Windows 首期属于长期产品/架构决策。
- `updating-directory-map`：实现阶段新增 settings 和 Windows infrastructure 模块后更新。
