# 实验性终端通知

在「系统设置 → 高级」开启「终端通知（实验功能）」。默认开启，已保存的开关选择保持不变，与 OSC 7 目录跟踪互相独立。设置即时保存；关闭会清除未读状态和未完成的协议片段，已交给操作系统的通知不会被撤回。

开启后，已连接终端顶部显示「通知」。非当前聚焦终端收到信号时，标签和工作区显示未读提示；真正聚焦该终端后清除。Qterm 位于后台时还会尝试发送系统通知，标题显示「终端名 · 工作区」。默认正文为「终端程序需要你关注」；在高级设置开启「显示通知正文」后，显示 OSC9 正文或 OSC777 的标题与正文（以冒号连接）。BEL 或空正文仍使用通用提醒。正文可能出现在锁屏上。操作系统权限、勿扰模式与平台策略可能阻止展示；未读提示仍保留。首版没有原生通知点击定位。

## 协议

支持 BEL (`0x07`)、OSC 9 文本、OSC 777 `notify;title;body`。OSC 可以使用 BEL 或 ST (`ESC \\`) 结束。OSC 9 数字子命令（包括进度条）不会触发通知。OSC 7 只表示目录；OSC 99 暂不支持。DCS/APC/PM/SOS 内的 BEL 不视为独立提醒，tmux 的封装透传不在首版保证范围。

解析器只观察实时输出，不修改 xterm 输入；缓冲回放不补发通知。每个 Block/连接 epoch 独立解析，原始 OSC 缓冲最多 8192 个 UTF-16 单元。通知内容限制长度并移除控制字符。原生发送前再次检查正文偏好、过滤控制与双向字符，来源标题最多128个字符、正文最多1024个字符。系统提醒全局间隔至少 2 秒，同一终端连续相同提醒至少间隔 5 秒；未读状态不受此限流丢弃。

## 快速验证

在单独测试终端执行下列任一命令，然后在 5 秒内切换到其他工作区查看未读，或切换到其他应用检查系统展示：

```sh
sleep 5; printf '\007'
sleep 5; printf '\033]9;需要关注\007'
sleep 5; printf '\033]777;notify;示例;需要关注\033\\'
```

回到并聚焦测试终端应清除未读。关闭总开关后重复命令应不再产生标签或系统提醒。普通命令结束、输出停止、OSC 7 更新不会自动产生通知，也不能据此判断任务成功。

## CLI 接入

Qterm 提供接收能力，CLI 必须主动发送信号。以下是接入方向，具体字段和触发条件以安装版本为准，本轮未逐个启动 CLI 实测：

| 工具 | 接入方向 |
| --- | --- |
| Codex | 在其通知设置中显式选择 `osc9` 或 `bel`；检查通知开关与失焦触发条件。 |
| Claude Code | 配置终端铃声通知通道；铃声可能表示等待关注，不能解释为任务成功。 |
| pi | 使用官方通知扩展的 OSC 777 分支；环境变量可能让扩展选择其他协议。 |
| Kimi Code | 通过安装版本支持的 Stop/Notification hook 发送 BEL/OSC；hook 输出可能被捕获，需要验证写入的是当前 PTY。Unix `/dev/tty` 只适用于存在 controlling TTY 的场景。 |

官方入口：[Codex 通知配置](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications)、[Claude Code 终端配置](https://code.claude.com/docs/en/terminal-config#get-a-terminal-bell-or-notification)、[pi 通知示例](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/notify.ts)、[Kimi hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)。

## 设置与复验范围

开关保存在 Qterm 配置根目录下独立的 `device/notifications.json`；缺失时默认开启，读取失败时关闭。损坏或未来版本文件不会被保存操作覆盖，UI 会显示错误。无需迁移原有 terminal.json。

本轮已通过 macOS 构建、真实 PTY 后台工作区未读/聚焦清除/关闭隐藏验证，以及协议、epoch、保存失败和原生提交策略自动化测试。Windows/Linux 实机、操作系统实际横幅展示与各 CLI 的触发时机仍需复验。

macOS 使用 UserNotifications 与实际应用身份。首次接收后台通知时，尚未决定授权会请求系统 Alert 权限；拒绝后在系统设置 → 通知中允许 Qterm（开发版为 Qterm Dev）。发送失败在 Qterm 高级设置中显示，未读保留。系统提交成功仍不保证横幅可见，勿扰和展示方式由系统决定。

开发启动器会对 Qterm Dev.app 做完整 ad-hoc 签名，本地 macOS 打包默认也进行 ad-hoc 签名，以绑定真实 bundle identity。仅运行链接器签名的裸二进制不能作为系统通知验收方式。签名或原生请求异常在设置中提示，底层错误 domain/code 输出到进程日志。

「显示通知正文」默认关闭，独立保存在 `device/notification-content.json`；主通知开关关闭时该选项不可操作，但保留偏好。已有 notifications.json 无需迁移。通知只显示 CLI 明确发送的内容，不抓取完整终端回答。
