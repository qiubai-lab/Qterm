---
id: QB-20260907-shell-startup-integration
type: bugfix
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# SSH shell startup integration

用户在调研后明确要求“采纳方案，请你落地修改”，授权启动阶段集成及被动接收兼容模式。

## Scope and cause

当前 request_shell 后发送 hook + CR，导致交互 history 污染及首次提示符上的隐藏执行。ECHO 不控制 history。
改为 SSH exec 启动 shell 专属初始化流程；不修改用户启动文件或历史。不改认证、host key、IPC 会话事件、文件/Git用途、本地 PTY。

## Requirements and acceptance

- REQ-001 / AC-001：自动模式启动脚本不经过交互输入；真实 Bash PTY 首次提示符前已报告目录，历史内存及文件没有 hook，用户命令仍可记录。
- REQ-002 / AC-002：保留 shell 登录配置、prompt hook 和目录恢复；覆盖 Bash scalar/array PROMPT_COMMAND、特殊目录、无效目录、登录状态及退出码。
- REQ-003 / AC-003：启动文件只写私有临时目录并在加载时清理；准备失败回退普通登录，SSH exec 被拒绝时用新 channel request_shell；不隐藏用户启动输出、不发送恢复命令到 stdin。
- REQ-004 / AC-004：Bash/Zsh/Fish/PowerShell 均使用启动机制；未知 shell 被动接收；OSC 7 报告继续作为现有集成就绪证据，Connected 只代表 transport。
- REQ-005 / AC-005：新增自动集成开关，默认开启以兼容旧设置；关闭后仍解析 OSC 7，不探测/注入。设置持久化、旧文件迁移和界面行为有测试。

## Behavior Delta

### MODIFIED
- REQ-001：去除 PTY echo 切换与交互 hook 输入。
- REQ-002：启动阶段恢复目录并安装 hook；Bash 保留 login_shell，通过 ENV 启动入口恢复非 POSIX 模式并读取登录配置。
- REQ-003：初始化失败降级普通 shell；exec 与 shell 请求的 MOTD/PAM 展示可能不同。
- REQ-004：shell 专属适配取代单行交互命令。

### ADDED
- REQ-005：仅接收模式允许远端自行配置 OSC 7。

## Implementation and ownership

标准级质量检查通过：范围、回退、history 不变性与验收闭合。
domain 保留 shell 枚举、缓存身份与探测解析；infrastructure shell startup 模块拥有脚本、编码、SSH channel 启动；terminal runner 只委托。现有 IPC 连接契约不变。新模块遵守 700 行 Rust 上限；已有 baseline 不增长。

- [x] 增加启动脚本与真实 shell 行为回归保护，替换交互注入。
- [x] 增加启动失败回退的 SSH 测试。
- [x] 增加被动模式设置与相关测试，更新用户文档和 Directory Map。
- [x] 执行 focused tests、pnpm check、cargo fmt/clippy/test，记录平台验证边界。

## Verification

- AC-001/002：`cargo test shell_startup --lib -- --nocapture` 通过 7 项；包含实际 Git Bash 交互进程的 history 文件/内存、登录状态、scalar/array prompt、失败退出码、nounset、特殊目录与缺失目录，以及真实 Windows ConPTY 在输入任何 shell 命令前的首次 OSC 7/单一提示符。
- AC-003：`cargo test startup_file_write_failure --lib -- --nocapture` 通过，真实 /bin/sh bootstrap 写启动文件失败后进入普通登录。`terminal_startup` 的本地内存 SSH 测试覆盖 exec 请求、明确拒绝后新 channel 回退、保留启动输出与零初始化 stdin。
- AC-004：Bash 与 PowerShell 7 实际执行通过；Zsh/Fish 按各自启动机制实现并经代码检查，本机没有对应运行环境，尚未进行真实 shell/SSH/PAM 验证。不连接用户服务器进行测试。
- AC-005：SettingsDialog 13 项通过；Rust 旧配置兼容、被动模式 round-trip 与 master/passive 组合规则通过。
- `cargo test --all-targets --all-features`：303 passed，4 原有 ignored；此后仅增加启动文件写失败回归，该 focused test 通过。
- `cargo clippy --all-targets --all-features -- -D warnings`：通过；新增测试后的最终补检也通过。
- `cargo fmt --check` 因本地 Git checkout 的既有 CRLF 文件与 Unix 配置冲突失败；`cargo fmt --check -- --config newline_style=Auto` 通过。本次修改文件使用 LF，无关文件保持原状。
- `pnpm check` 默认高并发两次分别遇到未修改的 workspaceTabDeck 超时、GitChangePreview parser 加载等待失败；workspaceTabDeck 单独 5 项通过。最终在当前命令环境设置 `VITEST_MAX_WORKERS=2` 后 `pnpm check` 完整通过：127 文件 / 928 用例、17 脚本用例、ESLint、TypeScript、Vite build；不改项目测试配置。
- source-size（0 ratchet reminders）及 `git diff --check` 通过。

## Residual compatibility limits

Zsh 的全局配置覆盖 ZDOTDIR、关闭 RCS 或提前 exec 可能跳过集成并留下私有临时文件；进程被强杀同样不能保证清理。SSH exec 的 MOTD/Last login 与普通 shell 请求可能不同，外层 shell 也可能执行非交互启动配置。上述主机可关闭自动配置并保留 OSC 7 接收。已污染历史不做自动清理；嵌套 SSH/tmux 不在自动集成范围。

验收结论：当前变更通过，平台与特殊配置验证限制如上保留。未进行桌面打包（无原生依赖/打包配置变化）。
