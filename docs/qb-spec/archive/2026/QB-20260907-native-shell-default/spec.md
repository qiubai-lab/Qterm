---
id: QB-20260907-native-shell-default
type: bugfix
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# Native SSH shell as the default

用户发现自动 OSC 7 集成改用 PTY + exec 后，OpenSSH 不再展示 MOTD 与 Last login，并明确授权采用普通 shell + 被动 OSC 7 方案。

## Scope

远程终端默认通过 PTY + shell 进入原生交互登录，只监听服务器已有的 OSC 7。自动集成继续作为高级选项保留。迁移现有 terminal settings，使升级用户也采用原生登录；不修改本地 PTY、认证、文件/Git 会话、远程启动文件或 OSC 7 解析。

## Requirements and acceptance

- REQ-001 / AC-001：缺少终端设置时默认开启 OSC 7 接收并使用被动模式；SSH 终端走普通 shell，不探测 shell、不发送 exec 或初始化 stdin。
- REQ-002 / AC-002：现有 schema v1 设置迁移到被动模式；迁移后保存为 schema v2，schema v2 明确保留用户重新选择的自动模式；损坏和未来版本文件仍不覆盖。
- REQ-003 / AC-003：设置界面将原生登录说明为默认行为，明确其保留 MOTD/Last login 且依赖远端上报 OSC 7；自动集成只有经用户确认后开启，并说明 PTY + exec 的登录信息影响。
- REQ-004 / AC-004：关闭并重新开启 OSC 7 跟踪时回到被动模式；关闭自动集成仍保持 OSC 7 接收，保存失败时界面保持原状态。

## Behavior Delta

### MODIFIED

- REQ-001：远程目录跟踪从默认自动 PTY + exec 改为默认普通 shell + 被动 OSC 7。
- REQ-002：旧终端设置升级后采用原生登录；用户随后仍可显式选择并持久化自动模式。
- REQ-003：设置界面把自动集成呈现为可能隐藏 MOTD/Last login 的可选兼容模式。
- REQ-004：总开关重新开启时采用安全的原生登录默认值。

## Implementation and ownership

标准级质量检查通过：默认行为、迁移、显式回退和设置失败路径均有可观察验收。`domain/settings.rs` 拥有默认模式，terminal settings repository 拥有 schema 迁移，设置 DTO/UI 只传递和展示偏好，SSH infrastructure 继续按现有布尔能力选择 shell 探测与启动路径，不新增跨层依赖。

- [x] 先更新默认值、schema 迁移和设置交互的回归测试。
- [x] 实现 domain 默认、v1 → v2 迁移和严格 v2 round-trip。
- [x] 更新设置文案、确认流程与用户文档。
- [x] 运行 Rust focused tests、SettingsDialog tests、pnpm check 和 Rust 质量检查。

## Verification mapping

| Acceptance | Check |
| --- | --- |
| AC-001 | Domain 默认值测试；terminal startup 被动 shell 测试；session 设置路由测试 |
| AC-002 | JSON repository v1 migration、v2 round-trip、损坏/未来版本保护测试 |
| AC-003 | SettingsDialog 默认状态、文案和自动模式确认测试 |
| AC-004 | SettingsDialog 总开关、自动开关及保存失败测试 |

## Verification

- AC-001：domain 默认值断言被动模式且 `automatic_shell_integration()` 为 false；内存 SSH 测试 `passive_startup_only_requests_an_ordinary_shell` 确认只发送 shell request，不发送 exec 或 stdin。
- AC-002：terminal settings repository 3 项测试通过；真实 v1 自动模式样本迁移为被动模式，保存后写入 v2，v2 自动模式 round-trip，损坏/缺字段/未知字段/未来版本文件均保持原文。
- AC-003/004：SettingsDialog 与 settings IPC 聚焦测试共 14 项通过；覆盖默认原生登录文案、自动模式确认、MOTD/Last login 提示、总开关重启被动模式及保存失败回滚。
- `VITEST_MAX_WORKERS=2 pnpm check`：127 个测试文件 / 928 项用例、17 项脚本测试、source-size、ESLint、TypeScript 与 Vite production build 全部通过。
- `cargo test --all-targets --all-features`：304 passed，4 个环境依赖测试 ignored；`cargo clippy --all-targets --all-features -- -D warnings` 通过。
- `cargo fmt --check -- --config newline_style=Auto` 与 `git diff --check` 通过。

未连接用户服务器进行实机 SSH/PAM 验证；OpenSSH MOTD/Last login 的最终内容仍由服务器配置决定。自动测试已验证默认通道请求恢复为普通 shell，自动模式仍保留原有 PTY + exec 和拒绝回退行为。
