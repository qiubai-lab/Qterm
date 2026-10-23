# 终端协议集成

Qterm 保留 OSC 7 目录跟踪、OSC 8 超链接、OSC 52 只写剪贴板，以及 BEL、OSC 9 文本、OSC 777 通知。
通知设置和示例见 [终端通知](terminal-notifications.md)，剪贴板行为见 [终端剪贴板](terminal-clipboard.md)。

应用标题（OSC 0/2）、任务进度（OSC 9;4）和 OSC 133 命令标记功能已移除。
终端头部继续显示主机或用户命名，不显示应用上报的标题或进度；普通选区复制保持可用。
OSC 9 数字子命令仍被排除，进度数据不会误触发文本通知。

旧终端设置 v1–v5 可读取；下次保存升级为 v6，移除旧标题和命令标记字段，保留目录跟踪与历史策略。
本地普通 Shell 直接启动；macOS 的 OSC 7 通过系统 Shell 集成加载，不向输入行写入初始化命令。
SSH OSC 7 与免历史 Bash 保留各自的目录跟踪和启动方式。

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
