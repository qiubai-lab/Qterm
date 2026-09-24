# 无历史 Bash 会话（实验功能）

在“系统设置 → 高级”开启“无历史 Bash 会话”。默认关闭，修改即时保存到设备的 `terminal.json`；只影响之后新建、分屏或重连的终端，已有会话保持原来的行为。

开启后，Qterm 启动独立 Bash，跳过用户的 profile/rc 文件，不读取原 Bash 历史、不收集本会话命令历史，默认历史文件指向 `/dev/null`。历史文件与长度变量在该 Bash 内被设为只读；已有历史文件不被清空。用户别名、自定义提示符及由启动配置加载的环境不会自动生效。启动成功后终端显示英文的实验性无历史会话提示。

OSC 7 目录跟踪可以独立开启或关闭；初始化发生在受控启动阶段，不通过模拟键盘输入执行，也不调用普通模式的 `history -d` 清理逻辑。上/下方向键不能找回本会话的命令，这是禁用内存历史的预期行为。

支持范围：

- 远程：目标提供 Bash、兼容 POSIX 的命令启动环境及 `env -u`，SSH 服务端允许 exec。默认登录 Shell 可以与 Bash 不同，但服务器仍会先处理自身的账户 Shell/强制命令配置。
- 本地：Linux / macOS 且 PATH 中提供 Bash。Windows 本地终端暂不支持；Windows 上连接支持条件满足的远程主机不受影响。
- Bash 缺失、启动被拒绝、初始化超时或提前结束时连接失败，不会自动退回会记录历史的普通会话。

这不是完整的系统无痕模式。服务器审计、程序日志、Qterm 的目录恢复/通知/滚动缓冲，以及 `sudo -i`、`su`、嵌套 SSH、其他 Shell 或已有 tmux 会话，不属于此机制的保护范围。显式写文件或自行重新配置环境同样不构成隔离边界。

## 开发验证

`cargo test --all-targets --all-features` 包含内存 SSH 服务端测试：普通连接兼容、OSC 开关、分片握手、拒绝/关闭/超时以及初始化期间的输入阻断与取消。共享解析器测试覆盖命令回显不能冒充握手、有界输出和跨数据块处理。

真实 Bash/PTY 测试单独启用，使用临时 HOME 和预置历史，不访问真实账户历史：

```powershell
$env:QTERM_TEST_BASH = "D:/SDK/Git/bin/bash.exe"
cd src-tauri
cargo test history_free_live -- --ignored
```

Unix 可设置 `QTERM_TEST_BASH=/bin/bash` 运行同一测试。Git Bash 仅用于 Windows 开发环境中验证受控 Bash 和远程启动命令；这不表示支持 Windows 本地无历史会话。

真实测试覆盖 OSC 开/关 × 正常退出/强制断开的四种组合，普通与多行命令、带引号和 `$()` 的目录、跳过 `.bashrc`、空内存 history，以及原历史文件内容不变。
