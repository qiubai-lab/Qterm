# 终端命令导航、进度与应用标题

Qterm 接收 OSC 133 命令标记、OSC 9;4 进度、OSC 0/2 应用标题。
所有状态只存在于当前终端，不写入工作区配置或命令历史。

## 命令导航与输出复制

在终端右键菜单（或 Shift+F10）使用「上一条命令」「下一条命令」和
「复制命令输出」。未手动导航时，复制最近一条已完成命令的输出；导航后，
复制所定位命令的输出。菜单底部显示命令编号与可用的退出码。

终端只在 shell 主动上报标记后启用这些能力。已有 OSC 133 集成可直接使用。
开启高级设置中的「OSC 133 命令导航」后，新建或重连的本地 Linux/macOS
Bash 4.4+ / Zsh 和已识别的 SSH Bash/Zsh 会话会自动加载 OSC 133。
免历史 Bash 同样自动安装，无需手动 source。关闭开关不卸载已有会话的 hook，
请重连；已有 OSC 133 发射器仍可被终端识别。

OSC 7 与 OSC 133 可分别启用；仅开启 OSC 133 也会探测受支持的 SSH Shell。
两个都关闭时不会自动注入。免历史 Bash 的历史策略不受这两个开关影响。
旧版本设置读取时，OSC 133 继承原 OSC 7 开关，保持原行为；保存后以 schema v3
分别存储 `remoteShellIntegrationEnabled` 和 `commandMarkersEnabled`。

Windows 默认 cmd、Fish、PowerShell 本轮保留原有 OSC 7 行为，不自动安装
OSC 133；嵌套 shell 也不自动注入。旧版 Bash 保留目录跟踪。

如需在已有会话手动启用，可加载仓库提供的脚本：

```sh
# Bash，替换为脚本实际路径
source /path/to/Qterm/scripts/shell-integration/qterm.bash
# Zsh
source /path/to/Qterm/scripts/shell-integration/qterm.zsh
```

仅手动加载时，SSH 会话需要先把对应脚本放到远程机器。自动模式无需上传文件。脚本不修改
`.bashrc` / `.zshrc`，不启用或关闭历史记录，不保存命令文本；自动模式会在每次连接重新安装。Bash 使用 PS0 而不接管 DEBUG trap；Zsh 使用 preexec/precmd。
如果提示符框架随后重写 PS1/PS0/PROMPT_COMMAND，需在其初始化完成后加载。
不要与另一套 OSC 133 提示符集成重复加载。其他 shell 可用自身的 OSC 133 集成。

仅跟踪普通缓冲区，最多保留 200 条标记。已滚出缓冲区的命令自动失效，
改变终端尺寸会清除旧标记，避免换行重排后复制错误边界。清除缓冲区、
会话重置会清除标记。全屏 alternate-screen 应用的输出不作为可复制的完整
命令输出；这些应用应使用自身复制或 Shift 拖选。正在执行、空输出、残缺
输出或超过 1 MiB 字符的输出不会复制。OSC 133 标记 shell 命令，不标记
Codex 内每一轮对话。

最小协议检查（先输入，再通过菜单复制，结果应为 `example output`）：

```sh
printf '\033]133;A\007$ example\r\n\033]133;C\007example output\r\n\033]133;D;0\007'
```

## 自动加载复验

1. 开启「OSC 133 命令导航」，新建本地 Bash 4.4+ / Zsh 或重新连接 SSH。
2. 执行 `printf 'auto-marker-test\n'`，通过右键「复制命令输出」确认结果仅含输出；再执行 `false`，导航到该命令确认退出码为 1。
3. 重连后重复检查，不需要 source 或上传脚本；免历史 Bash 会话采用同样流程。
4. 关闭开关并重连，确认 Qterm 不再自动安装标记。用户自己的 OSC 133 集成可能仍然生效。

自动安装复用 Shell 探测，并按两个独立开关组合脚本，不修改启动文件；不支持的 Shell 继续正常连接。
本轮在 Windows 上实际执行了生成的 Bash 初始化命令并通过回归测试；Linux/macOS
本地 PTY、真实远程服务器和 Zsh 解释器的端到端行为仍需按以上步骤复验。

## 进度和标题

应用无需 shell hook，可直接发送：

```sh
printf '\033]2;Codex - tests\007'     # 次级应用标题
printf '\033]9;4;1;42\007'           # 42% 进度
printf '\033]9;4;3\007'              # 不确定进度
printf '\033]9;4;4;42\007'           # 暂停
printf '\033]9;4;2;42\007'           # 错误
printf '\033]9;4;0\007'              # 清除进度，不表示成功
printf '\033]2;\007'                 # 清除应用标题
```

进度在终端头部显示，不触发通知；OSC 9 文本通知及 OSC 777 保持原行为。
标题最长 160 个 Unicode 码点，移除控制字符和双向格式字符，以纯文本显示，
不覆盖主机名或用户命名。连接断开后不显示进度和应用标题。

## OSC 52 与 tmux 兼容检查

先按 [剪贴板说明](terminal-clipboard.md) 验证直接本地/SSH 会话，再进入 tmux
使用同一测试命令。tmux 自身必须允许程序设置剪贴板（`set-clipboard on`），
且其外层终端能力包含 OSC 52；具体配置以安装的 tmux 版本为准，参见
[tmux 官方剪贴板说明](https://github.com/tmux/tmux/wiki/Clipboard)。
不要仅凭直接 SSH 成功推断 tmux 配置已经正确。

自动化测试使用真实 xterm 检查直接 OSC 52、BEL 结束的 tmux 转义包装、分段
输入、中文及错误恢复。这不是对所有 tmux DCS 透传、嵌套层数或 ST 包装的
全面保证；Qterm 未增加通用 DCS 解包或执行功能。原生剪贴板和远程 tmux
仍需在实际桌面会话检查。

Zsh hook 的退出状态处理遵循 [Zsh 官方说明](https://zsh.sourceforge.io/Doc/Release/Functions.html#Hook-Functions)：
各 hook 获得相同的初始退出码，Qterm hook 自身返回成功，避免阻断后续提示符 hook。
