---
schema: 1
id: QB-20260929-bash-history-compatibility
type: bugfix
tier: standard
status: archived
created: 2026-09-29
updated: 2026-09-29
supersedes: []
---

# 保留用户环境的 Bash 历史禁用

用户已在本会话明确要求落地：保留用户配置，仅禁用新命令历史；OSC 7 初始化自身不得进入历史。原实现的 `--norc` 和只读历史变量导致依赖 `.bashrc` 的命令缺失。

## Requirements

- REQ-001：保留既有交互式非登录 Bash 类型，按其规则加载系统配置与 `~/.bashrc`，保留 PATH、别名、提示符及用户 prompt hook；不强制读取登录 profile，也不重复加载 rc。
- REQ-002：配置加载后、接受交互输入前，关闭 history 收集并将 HISTFILE 指向 `/dev/null`；不清零历史长度、不锁定变量、不清除已有历史文件。OSC 7/初始化脚本通过启动文件执行，不作为终端输入。
- REQ-003：支持 prompt 字符串与数组；OSC 开关和目录恢复独立，保留有界握手和取消逻辑。历史设置不兼容时输出明确警告并允许使用终端；实际启动失败仍报启动错误。
- REQ-004：设置改名为“禁用 Bash 历史记录”，保留持久化字段、默认值和新建/重连生效范围。说明只控制当前 Bash，不强制拦截用户脚本或嵌套 Shell。

## Acceptance

- AC-001 [REQ-001, REQ-002]：真实 PTY 中 `.bashrc` 加载一次、PATH 中的测试程序/别名可用，自定义提示符保留；普通/多行命令以及初始化/OSC Hook 不出现在 history 中。
- AC-002 [REQ-002, REQ-003]：OSC 开/关 × 退出/断连，以及 prompt 字符串/数组，均验证原历史文件不变；只读 HISTFILE 冲突显示警告且握手成功。
- AC-003 [REQ-003, REQ-004]：SSH transport 拒绝、关闭、超时、取消及普通模式测试通过；设置保存/恢复与 OSC 独立测试通过。

## Behavior Delta

### MODIFIED
- REQ-001：由跳过用户配置改为交互式非登录 Bash 正常读取 `.bashrc`。
- REQ-002：由严格隔离及只读历史变量改为会话级关闭新命令记录；允许读取已有历史。
- REQ-003：配置冲突不再冒充连接失败；用户 prompt hook 与 OSC 共存。
- REQ-004：用户文案移除“无痕/跳过配置”承诺，旧设置继续兼容。

## Implementation plan

规则仍归 `domain/history_free_shell.rs`；Unix PTY 与 SSH exec 复用同一启动命令生成器。通过 Bash process substitution 提供一次性 rc 包装脚本，加载用户 rc 后初始化，不创建远端临时文件。IPC、持久化和会话握手协议不变。生产模块预计少于 200 行，真实 PTY 测试少于 300 行，不扩大 baseline 热点。

1. 更新真实 PTY 回归用例，保护配置加载、命令可用性、历史与 Hook。
2. 修改共享启动脚本和本地适配；更正文案、错误和说明。
3. 运行真实 PTY、SSH、前端回归，以及 pnpm check、Rust fmt/clippy/test。

## Verification

- AC-001/002：先在旧实现上复现 rc 未加载；修复后 `QTERM_TEST_BASH=/bin/bash cargo test history_free_live -- --ignored` 两项真实 PTY 测试通过，覆盖八组本地/远程 × OSC × 退出/断连及只读冲突。验证首条输入、rc 中重新启用 history 后的禁用、用户 PATH 程序/别名、历史长度可修改、旧记录可读、新输入与 Qterm 初始化/Hook 不在历史中、文件内容不变。
- AC-003：`QTERM_TEST_BASH=/bin/bash cargo test history_free -- --include-ignored` 九项通过，覆盖 SSH 拒绝/关闭/超时/取消和持久化兼容；设置定向测试两项通过。
- `pnpm check` 通过：179 个测试文件通过、1 个跳过，1106 项测试通过、2 项跳过，Node 脚本测试 17 项通过；ESLint、TypeScript、Vite 构建通过。使用已安装 Node 22.23.2；初始 Node 20 不满足 pnpm 版本要求，切换后验证完成。Vite 仅有已有的大 chunk 提示。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` 通过；真实 PTY 的两项 ignored 测试另行显式运行通过。
- 源码尺寸检查通过，零 ratchet 提醒；`git diff --check` 通过。生产规则仍归原 domain 模块，adapter 只负责启动；无新增 IPC/持久化模型或依赖。
- 真实 Bash 验证环境为 macOS 系统 Bash 3.2；没有声称在 Linux/Windows 真机运行。保留 Bash 5.1+ prompt 数组处理分支和跨平台测试入口。

自定义配置主动重启 Shell、重新启用 history、在配置中显式写历史或写指定文件不在控制范围内。受控 Bash 仍为交互式非登录 Shell，登录 profile 不额外加载。
