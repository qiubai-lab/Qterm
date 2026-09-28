# 禁用 Bash 历史记录（实验功能）

在“系统设置 → 高级”开启“禁用 Bash 历史记录”。默认关闭，修改即时保存到设备的 `terminal.json`；只影响之后新建、分屏或重连的终端，已有会话保持原来的行为。持久化字段仍为 `historyFreeBashEnabled`，原有开关值继续有效，无需迁移。

## 用户环境与历史行为

Qterm 启动交互式、非登录 Bash，保留该类型的系统启动配置，并加载一次 `~/.bashrc`。其中配置的 PATH、Node 版本管理器、别名、函数和提示符正常生效。不强制加载登录 Shell 的 profile；仅在 profile 中配置的环境应由用户按正常 Bash 配置方式提供给 `.bashrc`。

用户配置加载完成后，Qterm 关闭 history 收集，并将 `HISTFILE` 指向 `/dev/null`，避免常规退出保存和默认 `history -a` 写回原历史文件。不清空或删除原历史文件，不将 `HISTSIZE`、`HISTFILESIZE` 设为零，也不锁定历史变量。原历史可以读取、查看或通过方向键检索，本会话输入的新命令不会加入历史。用户配置自身执行的文件操作保持原行为。

启动成功后终端显示历史记录已禁用的提示。若用户配置把 `HISTFILE` 设为只读、无法重定向，会显示历史禁用不完整的警告，终端仍可使用。之后手动重新加载配置可能重新启用历史或改回历史文件；本功能不强制拦截用户主动修改。

## OSC 7 与启动

OSC 7 开关和初始目录恢复独立。初始化通过内存中的 rc 包装脚本执行，不模拟键盘输入，不把初始化或 Hook 命令提交到交互历史。用户 `PROMPT_COMMAND` 的字符串/数组内容保留，OSC Hook 追加到可执行的 prompt 项中。若用户将 `PROMPT_COMMAND` 设为只读，显示 OSC Hook 未安装的警告。

SSH 和本地 Unix PTY 复用启动策略。Bash process substitution 提供一次性 rc 文件，不创建远程临时文件。保留按会话隔离、有界的初始化握手；初始化前禁止交互。Bash 缺失、SSH exec 被拒绝、配置脚本退出/阻塞导致启动失败或超时，仍作为启动失败处理，不自动创建另一种 Shell。

支持范围：

- 远程：目标提供 Bash、process substitution 所需的文件描述符支持，SSH 服务端允许 exec。服务器仍会先处理账户 Shell/强制命令配置。
- 本地：Linux / macOS 且 PATH 中提供 Bash。Windows 本地终端暂不支持；Windows 客户端可连接满足条件的远程主机。

这只是当前 Bash 的常规历史开关，不是系统无痕模式。服务器审计、应用日志、Qterm 目录恢复/通知/滚动缓冲不受影响；嵌套 Bash、`sudo -i`、`su`、嵌套 SSH、其他 Shell 或已有 tmux 会话不继承保证。用户脚本重新启用 history、显式调用 `history -w 文件` 或自行写日志也不在控制范围内。

## 开发验证

`cargo test --all-targets --all-features` 包含共享策略单测与内存 SSH transport 测试：普通连接、OSC 开关、分片握手、拒绝/关闭/超时以及初始化期间输入阻断与取消。共享握手解析器覆盖命令回显不能冒充初始化成功、有界输出和跨数据块处理。

真实 Bash/PTY 测试使用临时 HOME、预置历史和测试可执行文件，不访问真实账户历史：

```sh
cd src-tauri
QTERM_TEST_BASH=/bin/bash cargo test history_free_live -- --ignored
```

Windows 开发环境可设置 `QTERM_TEST_BASH` 为 Git Bash 的 `bash.exe`，测试远程命令生成策略；这不表示支持 Windows 本地无历史终端。

真实测试覆盖本地/远程启动 × OSC 开/关 × 退出/断连、rc 只加载一次、PATH 命令/别名、自定义提示符、字符串/数组 Hook、多行输入、特殊字符目录、历史变量可修改、旧历史可读、新输入及初始化/OSC 命令不进入历史、原文件不变，以及只读配置冲突后的警告与可用终端。
