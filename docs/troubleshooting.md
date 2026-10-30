# Troubleshooting

## Homebrew 升级提示"已是最新"

`brew upgrade --cask qterm` 提示 `the latest version is already installed`，但 tap 中已有新版本时，通常是本地 tap 克隆没有同步：第三方 tap 不走 Homebrew 官方 API，只能靠 `brew update` 做 git pull。先执行 `brew update` 再升级即可：

```bash
brew update && brew upgrade --cask qterm
```

若仍无效，确认未设置 `HOMEBREW_NO_AUTO_UPDATE`，或手动同步 tap：

```bash
git -C "$(brew --repository qiubai-lab/tap)" pull
```

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

## CEF 构建找不到 CMake / Ninja / Python / patch

适用于 `dev-cef`。出现以下错误时，首先检查**启动 pnpm 的同一个终端/IDE 环境**：

```text
HOST_CMAKE = None
CMAKE = None
failed to execute command: No such file or directory (os error 2)
is `cmake` not installed?
```

`HOST_CMAKE` / `CMAKE` 为 None 只表示未设置自定义可执行文件路径。此处真正失败的是
构建脚本无法启动 PATH 上的 `cmake`；macOS/Windows 的 CEF wrapper 同时使用 Ninja。
无需因此删除 `target`、改 Rust 代码或禁用 CEF。

```sh
# macOS，已安装 Homebrew
brew install cmake ninja
command -v cmake ninja python3 patch
cmake --version
ninja --version
python3 --version
pnpm tauri dev
```

Windows 在 Developer PowerShell 中用 `Get-Command cmake,ninja,python3,patch,cl` 检查。
完整的 [macOS、Windows、Linux 安装方案](DEVELOPMENT.md#开发环境dev-cef) 包含 Python、
patch、Node/pnpm、Rust 和平台 SDK。安装后重开终端/IDE，让 Node/Cargo 子进程继承更新后的
PATH；PowerShell 函数或 shell alias 不等于存在可执行文件。

其他相关症状：

- `CMake was unable to find a build program corresponding to Ninja`：安装 Ninja 并检查 PATH。
- `python3` / `patch` 无法启动：runtime 补丁准备阶段缺少工具；仅装 Python 的 `py` launcher
  或 `python` 命令不满足当前脚本，按开发指引设置可执行入口。
- macOS SDK 版本错误：CMake 安装成功仍需匹配 SDK；开发要求 26.5+，打包固定 26.5。
- Linux `gtk4.pc` 缺失：安装 GTK 4 开发包与 pkg-config，旧的 WebKitGTK 依赖列表不够。
- Windows `SandboxPolicy::Required cannot be honored`：当前 runtime 沙箱 broker 限制，
  不是缺少编译工具；见开发指引中的平台状态，不通过关闭 sandbox 规避。
- `qterm-tunnel.invalid` 仍出现在地址栏：先确认打开的是本分支构建的 `Qterm CEF.app`，
  而非旧 `/Applications/Qterm.app`；构建不会自动安装。恢复的旧标签需改回原始 localhost URL。

此前验证用过的 `/tmp/qterm-cef-build-tools` 是临时环境，不属于项目依赖安装方案，
可能被系统清理；新终端也不会自动继承它。应按开发文档安装长期工具并检查 PATH。

## 开发与预览

- 完整功能必须使用 `pnpm tauri dev`。该命令会自动加载开发身份配置并显示为 `Qterm Dev`；`pnpm dev` 只预览 Web UI，不具备 Tauri IPC，因此不能连接 SSH。
- 本机真实链路验证需要 `/usr/sbin/sshd`、`ssh-keygen` 和 SFTP server；运行 README 中的 ignored 集成测试即可。

### `pnpm tauri dev` 只显示启动命令

如果终端长时间停留在下面的输出：

```text
$ pnpm tauri dev
$ node scripts/tauri.mjs dev
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
