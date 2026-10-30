# Qterm 开发指引

本文面向希望在本地运行、测试、构建或参与 Qterm 开发的贡献者。产品介绍与使用入口见项目根目录的 [README](../README.md)。

## 项目结构

- `src/`：React / TypeScript 前端。`workspace/` 管理布局和状态，`terminal/` 负责终端界面，`components/` 放置共享视图与弹窗，`lib/tauri/` 封装后端 IPC。
- `src-tauri/src/`：Tauri / Rust 后端。业务规则位于 `domain/`，用例编排位于 `application/`，接口定义位于 `ports/`，SSH 与持久化实现位于 `infrastructure/`，Tauri API 位于 `commands/`。
- `docs/qb-spec/`：产品目标、架构决策、任务规格与实施计划。

前端测试与被测模块放在一起，命名为 `*.test.ts` 或 `*.test.tsx`；Rust 测试通常位于对应模块内。

## 开发环境（dev-cef）

本分支使用 **Tauri 3 alpha + CEF**。正式发布渠道仍可能提供 Tauri 2 版本；
安装开发工具不会把已安装的旧 Qterm 自动升级为 CEF。

| 平台 | 当前范围 |
| --- | --- |
| macOS arm64 | 已验证完整应用、OpenSSH、Cookie/WebSocket、隔离、回收及 app/DMG 打包 |
| macOS Intel | 可准备原生 x86_64 工具链；本分支尚未实机验证 |
| Linux | 以下为依赖安装及编译准备方案；未实机验证，Web Block 能力暂未启用 |
| Windows x64 | 以下为编译环境准备方案；Web Block 暂未启用，且当前 runtime 无法满足 `SandboxPolicy::Required`，应用启动被阻断 |

Windows 沙箱限制来自固定的 runtime 实现，不能靠补装 CMake 或 WebView2 解决。
保持项目沙箱策略不变，后续需完成 runtime/打包方案适配。参见
[Tauri CEF 沙箱说明](https://v3.tauri.app/develop/cef/#process-sandbox)。

### 通用工具与版本

| 工具 | 要求 / 来源 |
| --- | --- |
| Node.js | **22.x**，`package.json` 要求 `>=22 <23` |
| pnpm | **11.0.8**，由 `packageManager` 固定 |
| Rust | **1.97.1**，通过 rustup 安装；`rust-toolchain.toml` 包含 clippy/rustfmt |
| Python | **3.12+**，必须能以 `python3` 启动；用于校验、解包和准备 runtime 补丁 |
| patch | 命令行工具，需支持 `--batch --fuzz=0 -p1`；不是 Python 包 |
| CMake / Ninja | macOS、Windows 编译 CEF C++ wrapper 必需；当前 CEF CMakeLists 要求 CMake ≥3.21 |
| C/C++ 编译器 | macOS：Apple Clang；Windows：MSVC + Windows SDK；Linux：发行版编译工具链 |
| Git | 获取源码及日常开发 |

本机已验证 CMake 4.4.4 与 Ninja 1.13.2 系列；这是验证记录，不是新增的精确版本锁。
Linux 当前 `cef-dll-sys` 分支不编译该 wrapper，但下方仍安装 CMake/Ninja，方便统一开发工具。
运行时依赖版本以 Cargo/Node 锁文件为准，不要直接照上游 alpha 示例改成其他版本。

Node 可使用已有版本管理器，或从 [Node.js 官方下载](https://nodejs.org/en/download)
选择 **22.x** 的对应平台安装包/二进制。不要直接安装默认最新版替代 22.x。
Node 安装并进入 PATH 后执行：

```sh
npm install --global pnpm@11.0.8
node --version
pnpm --version
```

Rust 安装方式见 [rustup 官方说明](https://rust-lang.org/tools/install/)。
macOS/Linux 可执行以下命令，安装后重新打开终端：

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

进入仓库后安装固定工具链：

```sh
rustup toolchain install 1.97.1 --profile minimal --component clippy --component rustfmt
rustup show active-toolchain
rustc --version
cargo --version
```

### macOS

安装 [Homebrew](https://brew.sh/) 后，在终端执行（Python 的 PATH 设置遵循 [Homebrew 公式说明](https://formulae.brew.sh/formula/python@3.12)）：

```sh
xcode-select --install
brew install cmake ninja python@3.12 node@22
export PATH="$(brew --prefix node@22)/bin:$(brew --prefix python@3.12)/libexec/bin:$PATH"
npm install --global pnpm@11.0.8
```

上面的 PATH 修改只作用于当前终端；需要长期使用时加入自己的 shell 配置，或由已有
版本管理器提供等价路径。Homebrew 本身也应按安装提示完成 `brew shellenv` 设置。
macOS 自带的 `/usr/bin/patch` 已用于本次验证；若系统缺少它，可通过 `brew install gpatch`
安装，并把 `$(brew --prefix gpatch)/libexec/gnubin` 加到 PATH。

仅安装任意版本的 Command Line Tools 还不够：本仓库 `dev` 需要 **macOS SDK 26.5 或更新**，
`build` 严格要求 **26.5**。安装对应 Xcode/Command Line Tools，必要时为当前终端选择 Xcode：

```sh
# 路径按实际安装位置调整
export DEVELOPER_DIR="/Applications/Xcode_26.5.app/Contents/Developer"
xcrun --sdk macosx --show-sdk-version
xcrun --sdk macosx26.5 --show-sdk-path
```

只有较新 SDK 时可以尝试开发启动，但第二条检查和 release 构建仍要求 26.5。
`scripts/macos-sdk.mjs` 自动设置 SDKROOT，无需手写 SDK 路径。Apple Silicon 使用
`aarch64-apple-darwin`，Intel 使用 `x86_64-apple-darwin`，避免混用 Rosetta 与原生工具链。

```sh
command -v node pnpm cargo python3 patch cmake ninja
python3 --version
patch --version
cmake --version
ninja --version
xcrun clang --version
```

### Windows x64（PowerShell）

通过 winget 安装基础工具；已有符合要求的工具可跳过对应命令：

```powershell
winget install --exact --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --exact --id Git.Git
winget install --exact --id Kitware.CMake
winget install --exact --id Ninja-build.Ninja
winget install --exact --id Python.Python.3.12
winget install --exact --id Rustlang.Rustup
```

在 Visual Studio Installer 中确认安装“使用 C++ 的桌面开发”、MSVC x64/x86 工具和
Windows SDK。安装 Node 22.x 与 pnpm 后，重新打开 **Developer PowerShell for VS 2022**，
选择 x64 开发环境；不要用 MinGW/GNU Rust target 替代 MSVC。VS 命令行配置见
[微软说明](https://learn.microsoft.com/en-us/cpp/build/building-on-the-command-line)。

```powershell
rustup toolchain install 1.97.1-x86_64-pc-windows-msvc --profile minimal --component clippy --component rustfmt
rustup show active-toolchain
```

仓库启动脚本调用的是 `python3`，只存在 `py`/`python` 或 PowerShell 的函数别名均不够。
如果 `Get-Command python3` 找不到真正的 Python 3.12+ 程序，可在用户目录创建专用 venv
及同目录的 `python3.exe` 入口（无需改项目或系统 Python）：

```powershell
$QtermTools = Join-Path $env:LOCALAPPDATA 'Qterm\build-tools'
py -3.12 -m venv $QtermTools
Copy-Item "$QtermTools\Scripts\python.exe" "$QtermTools\Scripts\python3.exe"
$env:Path = "$QtermTools\Scripts;$env:Path"
python3 --version
```

还需要 `patch.exe`。先检查 Git for Windows 的 `usr\bin` 是否包含它；若存在，
将该目录**追加**到当前 PATH（保留 MSVC、原生 CMake 和 Ninja 的优先级）：

```powershell
$GitUnixBin = Join-Path $env:ProgramFiles 'Git\usr\bin'
Test-Path "$GitUnixBin\patch.exe"
# 仅在上一条为 True 时使用；自定义 Git 安装位置需调整
$env:Path = "$env:Path;$GitUnixBin"
```

如果 Git 安装没有提供 patch，安装 [MSYS2](https://www.msys2.org/)，在其终端运行
`pacman -S --needed patch`，再将实际安装位置的 `usr\bin`（默认 `C:\msys64\usr\bin`）
追加到 Developer PowerShell 的 PATH。这只提供 patch，不切换到 MSYS2 的编译器或 Rust。
上述 PATH 均为当前会话设置；持久化后需重开终端/IDE。

```powershell
Get-Command node,pnpm,cargo,rustc,python3,patch,cmake,ninja,cl
node --version
pnpm --version
python3 --version
patch --version
cmake --version
ninja --version
```

CEF 随应用打包，安装 WebView2 不能替代上述工具。原生 Windows 构建请使用 Windows
工具链；WSL 属于 Linux 环境。这些安装步骤尚未在 Windows 主机实测，且安装成功后仍有
本节开头说明的 Required sandbox 启动阻塞。

### Linux（Ubuntu 24.04 / Debian 13）

下面是开发依赖准备方案，不能直接沿用旧 Tauri 2 CI 的 WebKitGTK 列表。
当前固定的 CEF runtime 使用 **GTK 4**；CEF 和平台插件还需要桌面、图形和系统库：

```sh
sudo apt-get update
sudo apt-get install --no-install-recommends --yes \
  build-essential clang cmake ninja-build pkg-config git patch \
  python3 python3-venv curl ca-certificates file \
  libgtk-4-dev libgtk-3-dev libssl-dev libxdo-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libx11-dev libxrandr-dev libxi-dev libxcursor-dev libxkbcommon-dev \
  libnss3-dev libgbm-dev libasound2-dev libsecret-1-dev \
  patchelf rpm xdg-utils
```

Node 22.x 与 Rust 按通用安装步骤安装；不要假定发行版自带的 `nodejs` 或 Python
满足版本要求。Ubuntu 22.04 等旧系统的默认 Python 低于 3.12，需要另外准备受支持的
Python 并确保 `python3` 指向它。其他发行版需选择等价软件包，当前未提供已验证配方。

```sh
command -v node pnpm cargo python3 patch cmake ninja pkg-config
python3 --version
cmake --version
ninja --version
pkg-config --modversion gtk4
cc --version
```

启动需要图形会话和 D-Bus；当前普通构建使用系统密钥存储，也需要桌面的 Secret Service /
KWallet 等服务。项目要求 Chromium sandbox；受 AppArmor/user namespace 限制的发行版可能
拒绝开发程序或 AppImage 启动。按 [CEF Linux 打包说明](https://v3.tauri.app/develop/cef/#linux)
处理发行版策略或沙箱 helper，不通过给 Qterm 加 `--no-sandbox` 解决。

### CEF 缓存和首次构建

Tauri CLI 首次构建会下载对应平台/架构的 CEF，约 1 GB，Rust 构建还需额外磁盘空间。
`pnpm tauri dev/build` 会先调用 `scripts/cef/prepare_runtime.py`，校验 upstream crate、应用
补丁并生成忽略目录 `.cef-runtime/`，因此 Python 和 patch 也必须可被 Node 子进程找到。
不要修改全局 Cargo registry。

| 平台 | Tauri CLI 默认 CEF 缓存 |
| --- | --- |
| macOS | `~/Library/Caches/tauri-cef` |
| Linux | `~/.cache/tauri-cef` |
| Windows | `%LOCALAPPDATA%\tauri-cef` |

可选择外部磁盘缓存；两个变量均可省略。示例目录需自行创建并保证可写：

```sh
# macOS/Linux，仅当前终端生效
export CEF_PATH="$HOME/.cache/qterm/cef"
export CARGO_TARGET_DIR="$HOME/.cache/qterm/target"
```

```powershell
# Windows，仅当前终端生效
$env:CEF_PATH = Join-Path $env:LOCALAPPDATA 'Qterm\cef'
$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'Qterm\target'
```

`CEF_PATH` 管 CEF 分发缓存，`CARGO_TARGET_DIR` 管 Rust 构建及打包输出；不要混为同一路径，
或指向 CMake/Ninja 安装位置。更换架构/SDK 应隔离构建缓存。直接调用 Cargo 时不会经过
CLI 的准备步骤，先运行 `python3 scripts/cef/prepare_runtime.py`；需要与 CLI 共用 CEF
缓存时显式设置 CEF_PATH。优先使用 `pnpm tauri dev/build` 完成应用运行与打包。
依赖下载、缓存与 wrapper 的上游说明见 [Tauri CEF 文档](https://v3.tauri.app/develop/cef/#prerequisites)。

## 安装与启动

安装锁定版本的前端依赖：

```bash
pnpm install --frozen-lockfile
```

启动完整桌面应用：

```bash
pnpm tauri dev
```

该命令通过仓库内的 Tauri 入口自动合并 `src-tauri/tauri.dev.conf.json`，开发应用使用 `Qterm Dev` / `com.qiubai.qterm.dev`，可以和正式版 `Qterm` / `com.qiubai.qterm` 同时运行。macOS 上由 Tauri 3 CLI 自带的 CEF runner 组装 `.app` 和 helper 后运行，不再使用旧的 `scripts/tauri-dev-runner.mjs`。无需手工传入 `--config`；如果显式追加其他 `--config`，Tauri 会在开发配置之后按参数顺序继续合并。

只预览浏览器前端：

```bash
pnpm dev
```

浏览器预览不包含 Tauri IPC，不能建立真实 SSH/SFTP 连接。

## 统一命令入口：Makefile

在仓库根目录运行 `make` 或 `make help` 查看命令。Makefile 只组合现有 pnpm/Cargo 入口，原命令继续可用。兼容 GNU Make 3.81 及更新版本，需要 POSIX shell 和 `awk`：macOS 可使用开发工具附带的 `make`；Linux 可使用发行版的 GNU Make；Windows 可在 MSYS2 shell 中运行，并确保该环境可以访问 Windows 的 Node.js、pnpm 与 MSVC Rust 工具链。纯 PowerShell 环境可继续使用下文的原始命令。

| 命令 | 用途 |
| --- | --- |
| `make install` | 按锁文件安装前端依赖 |
| `make dev` | 启动完整桌面应用，沿用 Qterm Dev 身份与 SDK 选择逻辑 |
| `make dev-web` | 仅启动浏览器界面，无原生 IPC |
| `make dev-demo` | 启动官网中的模拟工作台演示 |
| `make check` | 顺序执行全部前端及 Rust 质量门 |
| `make check-web` / `make check-rust` | 单独执行前端或 Rust 质量门 |
| `make lint` / `make typecheck` / `make check-size` | 前端 lint、类型或源码尺寸检查 |
| `make test` | 前端、仓库脚本及 Rust 测试 |
| `make test-web` / `make test-rust` | 单独执行前端（含脚本）或 Rust 测试 |
| `make test-unit` / `make test-watch` | 单次 Vitest 或持续监听测试 |
| `make fmt` / `make fmt-check` / `make lint-rust` | Rust 格式化、格式检查或 Clippy |
| `make build` / `make preview` | 构建或预览前端资源 |
| `make package` | 生成当前平台 release 桌面安装包 |
| `make package-macos` / `make package-windows` / `make package-linux` | 在指定平台本机生成标准安装包 |
| `make install-local` | 构建并本地安装/更新标准 Qterm，沿用现有配置 |
| `make build-site` / `make preview-site` | 构建或预览官网和浏览器演示 |
| `make test-demo` / `make check-site` | 演示测试或站点构建与产物隔离检查 |
| `make audit-rust` | Rust 依赖审计，需先安装 `cargo-audit` |

`make check` 包含前端生产构建，但不生成安装包。只有发布或修改原生依赖、Tauri 配置、打包逻辑时才需要 `make package`；它仍通过 `scripts/tauri.mjs` 执行，包括 macOS 正式构建的 SDK 校验。聚合检查按顺序执行，任一步失败即停止，即使传入 `-j` 也不会并发启动这些检查。

开发/预览、单次 Vitest、watch、Rust 测试、演示测试和打包入口支持 `ARGS` 追加参数，例如：

```bash
make dev-web ARGS='--host 127.0.0.1 --port 1420'
make test-unit ARGS='src/terminal/terminalClipboardShortcuts.test.ts'
make test-rust ARGS='configuration_storage'
make -n package                 # 仅查看打包命令，不实际执行
```

`PNPM` 和 `CARGO` 可覆盖命令入口，例如 `make typecheck PNPM='corepack pnpm'`。`ARGS` 按 shell 参数解释，包含空格的单个参数需保留内层引号；它不用于 `make check`、`make test-web` 等聚合命令。

## 质量检查

完整前端质量门包含 ESLint、Vitest、TypeScript 检查和 Vite 生产构建：

```bash
pnpm check
```

Rust 质量门（首次 checkout 先在仓库根目录运行 `python3 scripts/cef/prepare_runtime.py`）：

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
```

本机装有 OpenSSH 服务端、`ssh-keygen` 与 SFTP server 时，可运行被忽略的真实 SSH/SFTP 集成测试：

```bash
cd src-tauri
cargo test local_openssh_exercises_terminal_transfer_and_file_editing -- --ignored
```

安装并运行 Rust 依赖审计：

```bash
cargo install cargo-audit --version 0.22.2 --locked
pnpm audit:rust
```

`cargo audit` 可能列出由 Tauri 间接引入的维护状态警告；应区分当前平台目标依赖和可利用漏洞，并持续跟随上游版本处理。

## 构建安装包

下列格式描述打包入口；Windows/Linux 的运行限制和未验证状态见[开发环境](#开发环境dev-cef)。
普通分发包不要传 `--features cef-integration-test`；该 feature 启用测试控制入口和 Mock Cookie 密钥。
完整 CEF/OpenSSH 测试命令与证据见 [CEF 开发说明](../scripts/cef/README.md)。

生成当前平台的 release 安装包：

```bash
pnpm tauri build
```

普通 `build` 子命令不会合并开发配置；dev-cef 当前生成 `Qterm CEF` / `com.qiubai.qterm.cef` 产物。构建成功不等于已安装，也不会替换已运行的旧 Qterm。

也可使用按平台命名的入口。它们检查当前操作系统，随后调用相同的标准构建流程；macOS 命令不能在 Windows/Linux 上执行，反之亦然。架构默认跟随本机 Rust 工具链。

| 当前系统 | 命令 | 产物（默认在 `src-tauri/target/release/bundle/` 下） |
| --- | --- | --- |
| macOS | `make package-macos` | `macos/Qterm CEF.app` 和 `dmg/*.dmg` |
| Windows | `make package-windows` | `nsis/*-setup.exe` 和 `msi/*.msi` |
| Linux | `make package-linux` | `appimage/*.AppImage`、`deb/*.deb`、`rpm/*.rpm` |

Windows PowerShell 或没有 GNU Make 的环境可直接运行：

```powershell
pnpm package:desktop                    # 当前平台全部标准格式
pnpm package:desktop --platform windows # 显式校验平台
```

macOS/Linux 对应的 `--platform` 值为 `macos`、`linux`。`make package` 保留 Tauri 原生参数透传，例如 `make package ARGS='--target aarch64-apple-darwin'`；显式 target 的产物位于 `target/<target>/release/bundle/`，需要先安装对应 Rust target 与平台构建依赖。平台命名入口和本地安装入口只支持本机默认架构，不支持 `CARGO_BUILD_TARGET`；自定义 `CARGO_TARGET_DIR` 时以构建输出为准。

版本号由用户维护 `src-tauri/Cargo.toml` 中的 `[package].version`，修改后运行 `cargo check --manifest-path src-tauri/Cargo.toml` 同步 `Cargo.lock`。构建命令不会修改版本、生成时间戳、改名或额外生成开发版。macOS 标准构建仍要求 SDK 26.5，详见[发布流程](release.md)。底层参数和平台包格式见 [Tauri CLI](https://v3.tauri.app/reference/cli/) 与 [Windows 安装器说明](https://v3.tauri.app/distribute/windows-installer/)。

### 从本地源码安装和更新

在源码根目录先安装依赖，退出正在运行的 Qterm，再执行本地安装入口：

```bash
make install
make install-local
```

不使用 Make 时，等价命令为：

```bash
pnpm install --frozen-lockfile
pnpm install:local
```

`install-local` 每次先构建，成功后才安装；再次运行即使用当前源码更新本机应用。它是本地源码安装入口，无需创建 Homebrew tap，也不会下载 Homebrew 的已发布版本。dev-cef 的产品名为 `Qterm CEF`，应用标识为 `com.qiubai.qterm.cef`，沿用已有配置位置（默认 `~/.qterm`，也尊重已有自定义目录设置），不会删除连接、凭证或工作区。不要同时运行两个 release 变体访问同一个可写配置目录。与 `make dev` 的热更新运行不同，安装后的应用内置前端，可直接启动，无需 Vite。

- **macOS**：构建标准 `.app`，校验标识和签名后暂存并替换 `/Applications/Qterm CEF.app`；替换失败恢复旧包。不会自动关闭应用。安装后运行 `open "/Applications/Qterm CEF.app"`。若当前账户无权写入 `/Applications`，可用 `make package-macos` 构建 DMG，打开后通过 Finder 拖入应用程序并按系统提示授权，无需以 root 构建整个项目。
- **Windows**：构建 NSIS 安装包并打开安装向导，按向导完成覆盖安装后从开始菜单启动构建输出对应的 `Qterm CEF`。PowerShell 直接使用 `pnpm install:local`。需要 MSI 时使用 `make package-windows` 或 `pnpm package:desktop --platform windows`，再打开构建输出的 `.msi`。
- **Linux**：自动选择 PATH 中的 `apt`（deb）或 `dnf`（rpm），构建相应包后执行 `sudo apt install -- <本次构建的绝对路径>` 或 `sudo dnf install -- <本次构建的绝对路径>`，由系统包管理器处理权限与依赖。其他发行版使用 `make package-linux`，然后给构建输出的 AppImage 添加执行权限并运行，或使用发行版对应的本地包安装命令。

只预览操作而不构建或安装：

```bash
make package-macos ARGS=--dry-run
make install-local ARGS=--dry-run
# PowerShell 同样可用
pnpm install:local --dry-run
```

本地安装不创建发布标签或上传产物。macOS 构建与临时目录安装由本机验证；Windows/Linux 的命令分流、产物选择及失败处理有自动化覆盖，安装器本身仍需在相应系统验证。

仓库的 `.github/workflows/build-desktop.yml` 在版本标签或手动触发时分别使用原生 runner 构建 macOS ARM64、Windows x64 和 Linux x64 产物；推送 `v*` 标签时会额外发布 GitHub Release。涉及原生依赖、Tauri 配置或发布打包的改动，应至少验证对应平台构建。标签发布的完整流程见[发布流程](release.md)。

## 清理本地构建缓存

`src-tauri/target/` 只增不减：依赖升级后旧版本的编译产物会原地保留，增量编译缓存也持续累积，占用几十 GB 属于常见现象。磁盘不紧张时无需处理——这些产物是日常增量编译速度的来源。注意 `cargo check`、`clippy`、`test` 与 rust-analyzer 的 feature 组合不同，同一 crate 会产生多份不同哈希的产物，因此即使目录很"新"体积也会很大；`cargo sweep` 只清理超龄产物，对刚重建过的目录无效。需要回收空间时按激进程度选择：

```bash
# 温和：只清增量编译缓存，下次构建稍慢一次
rm -rf src-tauri/target/debug/incremental

# 中度：用 cargo-sweep 保留最近 30 天的产物（推荐在依赖升级后执行）
cargo install cargo-sweep --locked
cd src-tauri && cargo sweep --dry-run --time 30   # 先预览将删除的内容
cargo sweep --time 30

# 彻底：全部清掉，下次构建从零开始
cd src-tauri && cargo clean
```

这与 CI 的 rust-cache 无关：CI 缓存保存前会自动修剪增量和过期产物，体积远小于本地 `target/`。

## 代码与测试约定

- 遵循 `.editorconfig`：UTF-8、LF、文件末尾换行；TypeScript 使用两空格，Rust 使用四空格并交由 `rustfmt` 格式化。
- React 组件与 TypeScript 类型使用 `PascalCase`，函数和变量使用 `camelCase`，Rust 模块和函数使用 `snake_case`。
- Tauri transport 保持轻薄；业务规则应位于 domain 或 application 层。
- 测试可观察行为以及失败和边界情况。认证、主机密钥、凭证持久化、Workspace、布局或传输行为发生变化时必须添加回归覆盖。
- 环境依赖的 OpenSSH 测试可以保持 `#[ignore]`，但必须记录运行方式。

## 依赖升级策略

- `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock` 必须提交，CI 使用锁文件安装。
- JavaScript 直接依赖使用精确版本；安全边界中的 `russh` 和 dialog plugin 使用精确版本，其余 Rust 构建由 lockfile 固定。
- Dependabot 每月提出 npm、Cargo 和 GitHub Actions 更新；安全更新可以提前处理。
- 每次依赖升级至少应通过 `pnpm check`、Rust 格式化、Clippy 与测试；原生或打包依赖升级还应验证三平台构建。

## 提交与 Pull Request

提交信息遵循 Conventional Commits，并保持单一关注点，例如：

```text
feat: add session search
fix: reject changed host keys
docs: clarify Linux prerequisites
```

Pull Request 应说明行为变化、安全或迁移影响、关联 Issue / spec 以及实际执行的验证。界面改动请附截图或录屏。提交前不要加入真实主机地址、用户名、凭据、私钥、运行日志或本机生成的数据文件。

更多背景见[安全模型](security-model.md)、[故障排查](troubleshooting.md)与[架构规范](qb-spec/context/ARCHITECTURE_SPEC.md)。
