---
id: QB-20260829-remote-cli-image-paste
type: feature
tier: strict
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# Remote CLI Clipboard Image Paste Plan

## Background

实施 `QB-20260829-remote-cli-image-paste`。当前 Terminal 粘贴只读取文本；新路径必须在不向 WebView 暴露图片数据的前提下，由 Rust 读取并编码本机剪贴板图片，通过当前 Terminal SSH session 的 SFTP channel 上传到隔离远端临时目录，再有序插入绝对路径。

## Requirement

- 实施 spec 的 REQ-001 至 REQ-008，并以 AC-001 至 AC-008 作为完成条件。
- 维持 `docs/qb-spec/context/ARCHITECTURE_SPEC.md` 的前端不可信边界、窄 IPC、application 编排、第三方类型留在 infrastructure 和大数据不穿过 WebView 规则。
- 维持现有 Terminal/Files/Network session purpose 隔离、文本粘贴确认和人工文件上传授权路径。

## Non-Goals

- 不实现第三方 CLI adapter、OSC 图片协议、PTY/Base64 fallback、自定义临时目录设置或容器路径探测。
- 不重构通用 TransferDialog/FileBrowser 传输 UX，不把内部图片字节上传扩展为 WebView 可调用的通用 `uploadBytes`。
- 不新增 persistence schema、Workspace 字段或 profile 设置。

## Architecture Impact

- 新增 application-owned 的图片粘贴用例与 ports：原生剪贴板来源返回稳定 `{ width, height, png }` 模型，远端临时图片 store 接收已经验证的 PNG 和受限路径策略；两者不泄漏 Tauri Image、arboard、image encoder 或 russh-sftp 类型。
- 新增 native clipboard infrastructure adapter，使用现有 `tauri-plugin-clipboard-manager` 的 Rust API在阻塞工作线程读取 RGBA，并用显式 PNG encoder 生成内存 PNG。
- 扩展 `SshSessionManager` 的 Terminal-only control，使 session runner 在同一认证连接上打开 SFTP channel、准备私有目录、分块写 `.part`、设置权限、rename、登记与清理；Files/Network purpose 明确拒绝。
- 新增窄 Tauri command，输入只含 session ID，输出只含远端路径与非敏感图片元数据；command 不返回字节，也不在 capabilities 增加 read-image。
- 前端在现有 `TerminalInputScheduler.runExclusive` 中保持粘贴相对顺序：文本读取有结果时沿用原逻辑，否则远程 session 调用图片用例并 paste 返回路径。

## Domain Model Impact

- 新增稳定图片元数据与限制规则：宽高 `1..=8192`、像素上限 `16,777,216`、PNG 上限 `20 MiB`。
- 新增受限临时目录策略值：Unix `/tmp` 首选、canonical home fallback、固定安全前缀、session/image UUID、目录 `0700`、文件 `0600`、24 小时 home fallback TTL。
- 不改变既有 `RemotePath` 的人工文件传输语义；内部生成路径使用独立类型或构造器，避免把任意前端路径误当成受信临时路径。

## API Impact

- 新增前端窄调用，例如 `pasteRemoteClipboardImage(sessionId)`；实际 command 名在实现时保持 feature-specific，不能接收远端根目录、文件名、图片字节、权限或 fallback 开关。
- 成功 DTO：`{ remotePath, width, height }`。失败使用稳定错误码区分无图片、图片超限、编码失败、SFTP 不可用、临时目录不可用、上传取消/失败和 session 失效；不得返回本机剪贴板底层错误全文。
- 不新增公共网络 API，不改变现有 transfer IPC DTO。

## Database Impact

- 无数据库、JSON schema 或持久化迁移。
- 临时目录登记仅存在于 SSH session 运行时内存；home fallback TTL 扫描不写本地索引。

## Affected Files

- `src/terminal/TerminalPanel.tsx`、`TerminalPanel.test.tsx`：文本优先、图片 fallback、进度/错误和有序路径粘贴。
- `src/terminal/terminalInputScheduler.ts`、`terminalInputScheduler.test.ts`：仅在现有契约不足时补充异步独占顺序覆盖，不改变公开语义。
- `src/lib/tauri/sessions.ts`、`sessions.test.ts` 或新增同目录 feature-specific adapter：窄 IPC DTO。
- `src-tauri/src/domain/{mod.rs,clipboard_image.rs}`：稳定限制、生成路径策略和错误。
- `src-tauri/src/ports/{mod.rs,clipboard_image.rs}`：剪贴板来源与远端临时 store ports。
- `src-tauri/src/application/{mod.rs,clipboard_image_service.rs}`：校验、上传、fallback/清理请求和稳定结果编排。
- `src-tauri/src/infrastructure/{mod.rs,clipboard.rs}`：Tauri 原生剪贴板读取与 PNG 编码 adapter。
- `src-tauri/src/infrastructure/ssh/client.rs`、`client/session.rs`、`client/transfer.rs`、`client/tests.rs`：Terminal-only SFTP 字节写入、权限、rename、登记、清理和失败恢复。
- `src-tauri/src/commands/{mod.rs,clipboard.rs}`、`src-tauri/src/lib.rs`：窄 command、composition 和 invoke 注册。
- `src-tauri/capabilities/default.json`：只验证不新增 `allow-read-image`；除非现有生成流程要求排序，不应改动。
- `src-tauri/Cargo.toml`、`Cargo.lock`：增加直接、仅 PNG 编码所需的最小依赖或 feature。
- `docs/qb-spec/DIRECTORY_MAP.md`：实现产生新 domain/application/port/infrastructure 文件后更新职责定位。

## Implementation Tasks

- [x] TASK-001 [REQ-003, REQ-004, REQ-007] [AC-003, AC-004, AC-007]：新增 clipboard image domain 规则、大小安全计算、UUID 临时路径策略、权限/TTL 常量与纯单元测试；拒绝由前端提供路径组成部分。
- [x] TASK-002 [depends: TASK-001] [REQ-002, REQ-003, REQ-005, REQ-006, REQ-007] [AC-002, AC-003, AC-005, AC-006, AC-007]：定义 clipboard source/remote store ports 与 application service，用 fakes 覆盖校验失败时零远端写入和稳定错误；远端 fallback、清理及 session 生命周期由 store adapter 封装并测试。
- [x] TASK-003 [P] [depends: TASK-002] [REQ-002, REQ-003] [AC-002, AC-003]：实现 native clipboard adapter；将阻塞读取移出 Tauri 主线程、规范化 RGBA 为 PNG、限制日志，并添加编码/错误映射测试。
- [x] TASK-004 [P] [depends: TASK-002] [REQ-004, REQ-005, REQ-006, REQ-007] [AC-004, AC-005, AC-006, AC-007]：实现 Terminal-only SFTP store control，覆盖 `/tmp`/home fallback、原子不可覆盖创建、`0700/0600`、有界 chunk、`.part` rename、并发 session 登记、关闭/失败清理与 24 小时安全 TTL 扫描。
- [x] TASK-005 [depends: TASK-003, TASK-004] [REQ-002, REQ-005, REQ-006] [AC-002, AC-005, AC-006]：新增窄 command 和 composition；只接收 session ID，调用 application use case，返回稳定 DTO/错误，拒绝 Files/Network/local/失效 session，确认 capabilities 不扩大。
- [x] TASK-006 [depends: TASK-005] [REQ-001, REQ-005, REQ-006, REQ-008] [AC-001, AC-005, AC-006, AC-008]：接入 TerminalPanel 文本优先 fallback、上传中反馈和 input scheduler；成功仅 paste 安全绝对路径，不自动 Enter，失败/取消不改变 terminal input，组件/session 失效时丢弃迟到结果。
- [x] TASK-007 [depends: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006] [REQ-001 至 REQ-008] [AC-001 至 AC-008]：运行聚焦和完整质量门，记录 Unix SSH/SFTP smoke test 的环境限制，更新 Directory Map 与 spec 验证证据后完成 strict verification。

## Dependencies And Parallel Work

- TASK-003 与 TASK-004 在 ports/application 契约稳定后可并行；前者只改本机 clipboard adapter，后者只改 SSH/SFTP runtime。
- TASK-005 依赖两端 adapter；TASK-006 依赖稳定 IPC DTO，避免前端先复制临时契约。
- 使用现有 `tauri-plugin-clipboard-manager` Rust API；PNG encoder 必须作为直接依赖声明并限制 feature，不能依赖偶然的 transitive crate。
- 环境依赖 smoke test 需要可登录的 Unix SSH 目标、启用的 SFTP subsystem，以及能够检查 mode/rename/cleanup 的测试账号；缺失时不得伪报端到端通过。

## Acceptance To Verification

- VER-001 [AC-001, AC-008]：`TerminalPanel.test.tsx` 覆盖远程文本、截图、文本+图片、空剪贴板、本地 Terminal、多行确认和重复粘贴；`terminalInputScheduler.test.ts` 覆盖异步上传期间后续键入顺序。
- VER-002 [AC-002, AC-003]：Rust domain/application/native clipboard 测试验证窄模型、主线程外读取、尺寸/像素/PNG 边界、PNG 签名与校验失败零远端写入；静态检查 capabilities 不含 `allow-read-image`。
- VER-003 [AC-004, AC-007]：fake SFTP 测试验证 `/tmp` 优先、home fallback、随机目录、`0700/0600`、已存在/符号链接拒绝、并发 session 隔离、正常关闭清理和严格大于 24 小时的安全 TTL。
- VER-004 [AC-005, AC-006]：fake SFTP 故障注入覆盖 subsystem/mkdir/write/setstat/rename/cancel/disconnect，各点验证有界 chunk、`.part` 清理、原错误保留、无 PTY fallback 和无 terminal paste。
- VER-005 [AC-002, AC-005, AC-008]：command/manager purpose 测试验证只允许已连接 Terminal session，DTO 不含字节，Files/Network/local 被拒绝；现有 TransferDialog、Files upload 和 session purpose 测试继续通过。
- VER-006 [AC-001 至 AC-008]：在可用 Unix SSH/SFTP 目标上人工或 ignored integration smoke：粘贴截图后路径存在、PNG 可读、mode 正确、无自动 Enter；断开前目录被清理。容器命名空间不在本次通过条件内。

## Test Plan

按便宜到昂贵执行；实现期间先跑最接近变更的聚焦命令，最终 strict verification 再跑完整门禁。

1. `pnpm exec vitest run src/terminal/terminalInputScheduler.test.ts src/terminal/TerminalPanel.test.tsx src/lib/tauri/sessions.test.ts --maxWorkers=1`
2. `cargo test clipboard_image --all-targets --all-features`
3. `cargo test --all-targets --all-features`
4. `pnpm check`
5. `cargo fmt --check`
6. `cargo clippy --all-targets --all-features -- -D warnings`
7. `git diff --check`
8. 在可用 Unix 测试目标执行 VER-006；若环境缺失，保留 ignored fixture 并在 spec 记录未覆盖风险。

## Rollback Plan

- 回滚前端图片 fallback 和窄 command 注册后，现有文本粘贴立即恢复为唯一行为；不涉及 schema 或持久数据回滚。
- 移除内部 clipboard source/store ports 和 SSH control 后，现有人工 SFTP transfer 保持原契约。
- 回滚不会主动删除断网/崩溃遗留目录；`/tmp` 残留继续由系统策略处理，home fallback 残留仅包含 `0600` PNG，需在发布说明中给出手工删除前缀。

## Risks

- Linux 剪贴板底层可能阻塞：adapter 必须使用 blocking worker，且超时/取消不能把 Tauri 主线程挂起。
- SFTP server 对 mkdir/setstat/rename 的支持和 umask 不一致：权限无法确认即失败，不能为了兼容放宽到共享可读写。
- SSH Shell 与 SFTP 可能不共享容器 mount namespace：首版显式限制，不通过工作区任意路径或 Shell 命令绕过。
- session close 时网络可能已不可用：清理是尽力而为，不能阻止会话关闭；敏感残留主要依赖 `/tmp` 系统策略与私有 mode。
- 第三方 CLI 可能只把路径当文本：这是已接受兼容边界，Qterm 不伪造第三方按键或私有协议。

## Documentation Updates

- 实现新增模块后更新 `docs/qb-spec/DIRECTORY_MAP.md`，明确 frontend、application、ports、native clipboard 与 SSH/SFTP 的职责。
- 完成验证时在 spec 追加 VER-001 至 VER-006 证据与环境限制；不将该变更自动提升为长期 PRODUCT/ARCHITECTURE context，除非用户另行批准。

## Verification Result

- 聚焦前端回归共 41 项通过；仓库级 `pnpm check` 共 59 个测试文件、520 项测试通过，ESLint、TypeScript 与 Vite 生产构建通过。
- Rust 全量测试 205 项通过、3 项环境依赖测试忽略；`cargo fmt --check` 与严格 Clippy 通过。
- `pnpm tauri build` 成功生成 Windows MSI 与 NSIS 安装包；`git diff --check` 通过。
- Unix OpenSSH/SFTP ignored integration fixture 已扩展为验证随机远端路径、PNG 字节、`0700/0600` 和关闭清理；当前 Windows 主机没有 `/usr/sbin/sshd` 与 `sftp-server`，未伪报真实 Unix smoke 通过。

## Style Context

- 不涉及视觉风格变更，不加载 UI style context。
- 工程约束来自 `docs/qb-spec/context/ARCHITECTURE_SPEC.md` 与 `docs/qb-spec/DIRECTORY_MAP.md`：图片字节不得进入 WebView，command 保持薄，application 拥有编排，第三方剪贴板/SFTP 类型留在 infrastructure。
