---
id: QB-20260828-automatic-remote-shell-integration
type: feature
tier: strict
status: archived
created: 2026-08-28
updated: 2026-08-29
supersedes:
  - QB-20260828-terminal-cwd-shell-integration
---

# Automatic Remote Shell Integration

## Goal

让远程 Terminal Block 在连接后自动获得可信的 OSC 7 当前目录：用户可在系统设置中控制该能力；开启时明确获知 Qterm 会执行受限探测并向当前 SSH 会话注入临时 Hook；同一目标后续连接复用 Shell 探测缓存以缩短启动路径。

## Scope

- 在系统设置“通用”中提供默认开启的“自动获取远程终端目录”开关。
- 用户从关闭切换为开启时显示确认弹窗，说明远程命令、会话级影响、缓存内容与回退行为。
- 仅对 Terminal purpose 的 SSH 连接进行有界 Shell 探测、缓存读取/写入和会话级 Hook 注入。
- 支持 Bash、Zsh、Fish 与 PowerShell；未知 Shell、探测失败或缓存异常时保持终端可用并保留现有手动集成弹窗。
- 探测缓存按 profile、host、port、username 目标签名匹配；目标签名变化自动视为未命中。

## Non-Goals

- 不修改远程 `.bashrc`、`.zshrc`、Fish 配置、PowerShell profile 或任何远程文件。
- 不解析用户输入、`cd` 命令、提示符文本或终端屏幕内容推断路径。
- 不对 Files、Network 或本地终端会话执行探测和注入。
- 不缓存探测输出、终端内容、凭据、密钥或 Hook 脚本文本。
- 不保证远端在 profile 目标签名不变时主动通知 Qterm 默认 Shell 已被管理员更换；此时由现有手动回退入口恢复能力。

## Assumptions And Constraints

- “默认开启”表示缺失或首次创建设置文件时启用；首次启动不会额外弹窗。只有用户明确从关闭切到开启时才确认，避免默认值在每次启动阻塞连接。
- 探测命令必须有固定文本、固定输出标记、2 秒超时和 4 KiB 输出上限；探测失败不得令 SSH 登录失败。
- POSIX Hook 注入前通过 PTY mode 暂时关闭输入回显，注入命令第一步恢复回显；任何写入失败必须关闭该会话，避免留下不可交互的 PTY。
- 缓存属于可丢弃优化，损坏、未来版本或 I/O 失败均按未命中处理且不覆盖异常文件。
- 设置属于 device 数据，缓存属于 cache 数据；切换配置根后随应用重启切换。

## Requirements

- REQ-001：系统设置必须暴露默认开启的远程 Shell 自动集成开关，并在用户从关闭切换为开启时要求显式确认；确认文案必须说明受限探测、临时 Hook、不修改远程文件和缓存范围。
- REQ-002：设置值必须通过独立、严格版本化的 device JSON repository 持久化；缺失文件使用开启默认值，损坏或未来 schema 不得被自动覆盖。
- REQ-003：启用时，Terminal SSH 会话必须先用目标签名读取 Shell 缓存；匹配时跳过探测，未命中时执行有界探测并仅缓存受支持的 Shell 枚举。
- REQ-004：探测必须只接受固定标记中的 Bash、Zsh、Fish 或 PowerShell，限制执行时间与输出大小；未知输出、命令失败、超时及缓存错误都不得阻断正常登录。
- REQ-005：识别 Shell 后必须仅向当前交互会话注入对应 OSC 7 prompt Hook，不写远程文件；POSIX 注入不得把 Hook 命令回显到终端，且必须恢复输入回显。
- REQ-006：关闭设置、非 Terminal purpose 或无法识别 Shell 时不得自动探测或注入；现有 OSC 7 解析、手动集成对话框和远程主目录显式回退继续工作。
- REQ-007：缓存记录必须只包含 profile ID、host、port、username、受支持 Shell 枚举和 schema 版本；目标字段变化必须使旧记录失效。

## Acceptance

- AC-001 [REQ-001]：设置快照首次读取为开启；开关关闭可直接保存，关闭后再次点击开启先显示确认弹窗，取消保持关闭，确认后保存为开启。
- AC-002 [REQ-002]：terminal 设置 schema v1 可往返；未知字段、损坏和未来版本读取失败且原文件保持不变，SettingsService 用默认开启值并给出安全警告。
- AC-003 [REQ-003, REQ-007]：完全匹配的目标记录返回 Shell 并跳过探测；profile/host/port/username 任一变化均未命中；仅受支持 Shell 被写入 cache schema v1。
- AC-004 [REQ-004]：纯解析测试拒绝无标记、伪造前后缀、超长输出和未知 Shell；SSH 探测路径受 2 秒超时和 4 KiB 上限约束，失败返回 `None` 而非会话错误。
- AC-005 [REQ-005]：四类 Shell 生成固定的会话级 Hook；Bash/Zsh/Fish 命令以恢复 PTY echo 开始并发送 OSC 7，PowerShell 包装当前会话 `prompt` 且不触碰 profile 文件。
- AC-006 [REQ-003, REQ-005, REQ-006]：Terminal session 启用且缓存命中时注入但不探测，缓存未命中时探测后缓存并注入；关闭或非 Terminal session 均不触发集成；未知/失败仍进入 Connected。
- AC-007 [REQ-006]：前端现有 `cwdSource=osc7` 直接打开与未知路径手动弹窗回退测试继续通过。

## Behavior Delta

### ADDED

- REQ-001：新增默认开启、重新开启需确认的系统设置。
- REQ-002、REQ-007：新增独立 device 设置与可丢弃的目标 Shell cache。
- REQ-003 至 REQ-005：新增登录时有界探测、缓存复用和当前会话临时 Hook 注入。

### MODIFIED

- REQ-006：`QB-20260828-terminal-cwd-shell-integration` 的“绝不自动注入”调整为“设置开启且识别成功时自动注入”；原手动对话框降级为失败恢复入口。

## Architecture Boundaries

- `domain/settings.rs` 只定义默认值；Shell 枚举、目标签名与固定 Hook/解析规则位于稳定 domain 模块，不依赖 russh、JSON 或 Tauri。
- `ports/settings_repository.rs` 与新增 Shell cache port 由应用/领域侧拥有；JSON schema 和原子写入仅在 persistence adapter。
- `commands/settings.rs` 负责严格 DTO；`commands/session.rs` 只把设置快照转为 connect request 标志，不执行探测。
- russh exec、超时、PTY mode 与 channel 注入只在 `infrastructure/ssh/`。
- React 设置对话框只编排确认与 IPC，不拼接远端命令，也不访问 cache。

## Risk Review

- 安全：固定命令不接受用户拼接输入；缓存不含凭据或终端输出；远程持久文件零写入。
- 可靠性：探测、缓存均为软失败；POSIX echo 恢复位于注入命令首部，channel 写失败时终止会话。
- 兼容性：PowerShell PTY 回显行为由远端 OpenSSH 决定；不关闭其 echo，以免 Windows PTY 无法恢复。
- 性能：缓存命中不新开 exec channel；未命中最多两个顺序探测，各自受总流程超时控制。

## Independent Quality Review

- 结论：通过。REQ-001 至 REQ-007 均有可观察 AC，设置 schema、缓存 schema、远程执行和失败回退的高风险边界已显式覆盖。
- 修订：将“开启时提示”限定为用户从关闭切换为开启，消除默认开启与首次启动强制弹窗的歧义；增加 PTY echo 恢复失败、缓存未来版本与非 Terminal purpose 的验收。
- 剩余风险：目标签名未变化但默认 Shell 被远端更换时缓存会陈旧；本变更保留手动入口，后续可增加显式“重新探测”操作，不作为当前阻塞项。

## Verification Evidence

- VER-001 / AC-001：`SettingsDialog.test.tsx` 验证首次默认开启、关闭即时保存、重新开启确认/取消、确认后保存；设置 IPC 测试验证严格命令参数。
- VER-002 / AC-002：TerminalSettings domain、JSON repository 与 settings command 测试验证默认值、schema v1 往返、未知/损坏/未来文件保留和默认 warning 输出。
- VER-003 / AC-003：`json_remote_shell_cache` 测试验证完整目标签名命中、四字段任一变化失效、profile 更新替换及严格 Shell 枚举。
- VER-004 / AC-004、AC-005：Shell domain 与 SSH probe 测试验证 4 KiB 解析上限、固定标记/命令、四类 Hook、POSIX echo 恢复和无远程配置文件写入；PowerShell Hook 另通过 7.6.4 AST parser 语法检查。
- VER-005 / AC-006：`shell_integration_is_scoped_to_enabled_terminal_requests` 验证开关和 Terminal purpose 隔离；现有 Files/Network control 回归通过。ignored 本地 sshd 集成场景已扩展为检查 OSC 7、cache 内容与第二次连接，但当前 Windows 环境缺少测试所需 `/usr/sbin/sshd`/sftp-server，未执行该场景。
- VER-006 / AC-007：Terminal CWD、OSC 7、Workspace direct-open 与手动 fallback 聚焦回归 139 项通过；完整 `pnpm check` 为 61 个测试文件、488 项通过，ESLint、TypeScript 和 Vite production build 通过。
- Rust 完整检查：`cargo test --all-targets --all-features` 为 185 项通过、3 项环境依赖测试忽略；新增 request 隔离测试随后聚焦通过。`cargo clippy --all-targets --all-features -- -D warnings`、`cargo fmt --check` 通过。
- `git diff --check` 通过；未修改用户原有 `src-tauri/Cargo.toml` 工作树内容。

## Residual Risk

- 当前环境没有可运行的 Bash/Zsh/Fish 与本地 OpenSSH sshd 集成夹具，因此三类 POSIX Hook 的真实远端执行依赖后续 Linux/macOS CI 或人工 smoke test；固定命令、语法结构、OSC 7 内容、echo 恢复与失败降级已由单元测试和代码边界覆盖。
- 当远端默认 Shell 改变但 profile/host/port/username 均不变时会复用旧 cache；注入命令先恢复 echo，失败后终端仍可用并显示手动回退入口。
