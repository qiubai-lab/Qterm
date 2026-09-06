# 终端目录跟踪

「系统设置 → 高级」中的「OSC 7 终端目录跟踪」控制目录报告的解析和展示。新安装与 schema v1 设置升级后默认使用普通 SSH shell，只接收远端已有配置或主题上报的 OSC 7，以保留 MOTD、Last login 和服务器的原生登录流程。

「自动配置远程目录跟踪」是可选兼容模式。用户确认开启后，新 SSH 会话通过 PTY + exec 加载 Qterm 的当前会话集成；关闭后恢复普通 shell。设置变更在下次连接生效。

自动配置在首次交互输入前加载集成，恢复终端目录，并通过 OSC 7 报告当前位置。Qterm 不向终端输入流发送 hook，不关闭 PTY 回显、不删除或改写 history。已连接会话的 hook 不会被在线卸载；过去版本已经写入的历史条目不会自动删除。

## 启动与兼容

- Bash：通过临时 ENV 入口启动真正的交互登录 shell，进入脚本即恢复普通 Bash 模式，读取 `/etc/profile`，以及 `.bash_profile`、`.bash_login`、`.profile` 中第一个可读文件。`.bashrc` 仍由用户/系统的登录配置按原规则加载，不额外重复执行。保留 scalar/array PROMPT_COMMAND、历史策略和 login_shell 状态。
- Zsh：临时 ZDOTDIR 包装 `.zshenv`、`.zprofile`、`.zshrc`、`.zlogin`，转交原配置，最后恢复配置目录并安装 precmd hook。系统配置强制改变 ZDOTDIR、关闭 RCS 或直接 exec 其他程序时可能绕过集成。
- Fish：使用 `--init-command` 在用户配置之后、读取交互输入之前安装 fish_prompt 事件函数。
- PowerShell：通过启动参数加载目录集成，保留原 prompt，不额外调用一次 prompt。

Bash/Zsh 仅在远端 `/tmp/qterm-shell.XXXXXXXXXX` 私有目录写入固定启动文件，目录权限 0700、文件 0600，正常加载时删除。不修改用户启动文件。异常退出、Zsh 配置提前跳出启动流程或远端进程被强制终止可能留下私有临时文件；可按主机临时目录维护策略清理。

自动配置使用 PTY + exec。OpenSSH 通常将带 command 的会话作为 quiet login，可能不显示 MOTD 与 Last login；PAM、审计或受限账户策略也可能与普通 shell 请求不同。Qterm 保留实际收到的启动输出。准备临时文件失败会尝试普通登录；服务器明确拒绝 exec 时新开 channel 请求普通 shell。请求超时或连接断开时不重复启动未知状态的命令。

Connected 表示 SSH 通道已启动，首个有效 OSC 7 仍是目录集成就绪的依据。未知 shell、自动集成失败或用户关闭自动配置时，可继续使用普通终端；未收到目录报告时顶部维持现有等待/异常提示。

## 仅接收已有集成

默认保留「OSC 7 终端目录跟踪」并关闭「自动配置远程目录跟踪」。Qterm 不探测或自动初始化远端 shell，仍接受远端现有启动配置/主题发出的 OSC 7。此模式适合需要 MOTD、Last login、已有集成、特殊登录脚本、tmux 包装或受限服务器；它不依赖 Qterm 写入远端辅助文件。

若服务器尚未提供 OSC 7，需要在自己的 shell 启动配置中安装目录报告函数。报告应为 `ESC ] 7 ; file://host/percent-encoded-path BEL`，在每次提示符出现前发送。该配置由用户或服务器管理员维护。

## 验证

连接后应仅出现正常首次提示符。执行命令、切换到含空格/中文/百分号的目录，确认目录跟踪；按 ↑、Ctrl+R 并查看 history，退出重新登录后检查历史文件，确保只保留用户命令。已有历史污染不在自动清理范围。

自动测试：`cargo test shell_startup --lib` 覆盖 Bash history、登录状态、prompt 数组/字符串、退出码、目录编码和真实 PTY；Windows PowerShell 7 验证 prompt 与目录。`cargo test terminal_startup --lib` 用本地内存 SSH 连接验证 exec、拒绝回退、被动模式与零初始化 stdin。测试需要 Bash（Windows 使用 Git Bash，可通过 QTERM_TEST_BASH 指定路径）及 Windows 上 PATH 中的 pwsh。

服务器端 PAM、复杂 shell 主题、Zsh/Fish 配置以及嵌套 SSH/tmux 应在对应目标环境复核；自动集成只覆盖 Qterm 建立的首层 shell。
