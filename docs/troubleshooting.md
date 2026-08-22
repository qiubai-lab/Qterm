# Troubleshooting

## 无法连接

- 确认主机、端口和用户名正确，且网络允许访问 SSH 端口。
- `connectionFailed` 表示 TCP、SSH 握手、PTY 或连接生命周期中断；应用不会显示可能包含敏感上下文的底层错误。
- 密码认证失败后重新输入密码；密码不会保存到连接配置。

## 私钥认证

- 私钥必须通过“选择私钥”系统对话框重新选择。应用不会扫描 `~/.ssh`，仅保存路径并不等于下一次启动时已授权读取。
- `privateKeyEncrypted` 表示需要口令；`invalidKeyPassphrase` 表示口令不正确；`unsupportedPrivateKey` 可能表示未验证的密钥或加密算法。
- 当前支持 Ed25519、ECDSA P-256/P-384/P-521 与 RSA 导入。RSA 凭证显示“不安全”标签，因为当前依赖仍存在 RUSTSEC-2023-0071 时序风险；应优先迁移到 Ed25519/ECDSA。
- RSA 认证只尝试 RSA-SHA2-512/256。只支持旧 SHA-1 `ssh-rsa` 签名的服务器会被拒绝，不会自动降级。

## 主机密钥

- 首次连接必须通过可信渠道核对 SHA-256 指纹后再接受。
- `hostKeyChanged` 会强制阻断。先确认服务器是否重装或轮换密钥；MVP 不提供在 UI 中自动替换信任记录的操作。
- 应用不读取或修改 `~/.ssh/known_hosts`，信任记录位于应用数据目录的 `known-hosts.json`。

## SFTP

- 上传目标已存在时会失败，以避免静默覆盖；请改用新的远程路径。
- 本地路径必须由系统文件选择器产生。取消对话框后，之前的选择不应被视为新授权。
- 取消或失败会清理 `.terminal-demo.part`；进程被强制终止时，远端或本地可能残留该后缀的临时文件，可在确认无活动传输后手动处理。

## 开发与预览

- 完整功能必须使用 `pnpm tauri dev`。`pnpm dev` 只预览 Web UI，不具备 Tauri IPC，因此不能连接 SSH。
- 本机真实链路验证需要 `/usr/sbin/sshd`、`ssh-keygen` 和 SFTP server；运行 README 中的 ignored 集成测试即可。

### `pnpm tauri dev` 只显示启动命令

如果终端长时间停留在下面的输出：

```text
$ pnpm tauri dev
$ tauri "dev"
```

先在另一个终端运行 `rustc --version`。项目通过 `rust-toolchain.toml` 固定 Rust 1.97.1；如果 Windows 尚未安装该版本，`rustup` 会在 Tauri 启动过程中同步并下载工具链。首次下载和 Rust 依赖编译可能需要数分钟，而 `pnpm dev` 只启动 Vite，不会验证 Rust 环境，因此前端正常不代表 Tauri 工具链完整。

建议退出当前启动命令，单独安装工具链以便观察下载进度：

```bash
rustup toolchain install 1.97.1-x86_64-pc-windows-msvc --profile default
rustc --version
cargo --version
```

### Tauri CLI 在 `rust.rs` 中 `Option::unwrap()` panic

已遇到的典型输出如下：

```text
thread '<unnamed>' panicked at crates\tauri-cli\src\interface\rust.rs:
called `Option::unwrap()` on a `None` value
[ELIFECYCLE] Command failed with exit code 3221226505
```

先检查当前项目选中的工具链和已安装组件：

```bash
rustup show active-toolchain
rustup component list --installed --toolchain 1.97.1-x86_64-pc-windows-msvc
rustc --version
cargo --version
```

如果 `cargo` 可用，但 `rustc --version` 报告 `rustc.exe is not installed`，说明工具链下载曾被中断。Tauri CLI 2.11.4 在这个状态下可能直接 panic，而没有显示缺少编译器的原始错误。补齐编译器和标准库：

```bash
rustup component add --toolchain 1.97.1-x86_64-pc-windows-msvc rustc rust-std
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

如果组件修复失败，完整重装项目工具链：

```bash
rustup toolchain uninstall 1.97.1-x86_64-pc-windows-msvc
rustup toolchain install 1.97.1-x86_64-pc-windows-msvc --profile default
```

仍然 panic 时，使用 `RUST_BACKTRACE=full pnpm tauri dev`（Git Bash）或 `$env:RUST_BACKTRACE = "full"; pnpm tauri dev`（PowerShell）获取完整回溯，再根据第一个外部命令失败点继续排查。
