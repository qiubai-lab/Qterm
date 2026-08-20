# Qterm 开发指引

本文面向希望在本地运行、测试、构建或参与 Qterm 开发的贡献者。产品介绍与使用入口见项目根目录的 [README](../README.md)。

## 项目结构

- `src/`：React / TypeScript 前端。`workspace/` 管理布局和状态，`terminal/` 负责终端界面，`components/` 放置共享视图与弹窗，`lib/tauri/` 封装后端 IPC。
- `src-tauri/src/`：Tauri / Rust 后端。业务规则位于 `domain/`，用例编排位于 `application/`，接口定义位于 `ports/`，SSH 与持久化实现位于 `infrastructure/`，Tauri API 位于 `commands/`。
- `docs/qb-spec/`：产品目标、架构决策、任务规格与实施计划。

前端测试与被测模块放在一起，命名为 `*.test.ts` 或 `*.test.tsx`；Rust 测试通常位于对应模块内。

## 开发环境

- Node.js 22
- pnpm 11.0.8
- Rust 1.97.1（由 `rust-toolchain.toml` 固定）
- 对应平台的 Tauri 2 系统依赖

### Windows

Windows 桌面开发需要：

- Microsoft C++ Build Tools，并在安装器中选择“使用 C++ 的桌面开发”。
- Microsoft Edge WebView2 Runtime；受支持的 Windows 10 / 11 通常已预装。
- 通过 `rustup` 安装的 MSVC Rust 工具链。

首次启动 Tauri 前建议显式安装完整工具链：

```powershell
rustup toolchain install 1.97.1-x86_64-pc-windows-msvc --profile default
rustup show active-toolchain
rustc --version
cargo --version
```

已安装组件至少应包含 `cargo`、`rustc`、`rust-std`、`clippy` 和 `rustfmt`。下载中断可能留下只有 `cargo`、没有 `rustc` 的不完整工具链，修复方式见[故障排查](troubleshooting.md)。

### macOS

安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

Apple Silicon 设备使用 Rust 目标 `aarch64-apple-darwin`。

### Linux（Ubuntu / Debian）

安装当前 GitHub Actions 构建所需依赖：

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends --yes \
  build-essential \
  file \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  patchelf \
  rpm
```

其他发行版请参考 Tauri 2 官方系统依赖文档选择等价软件包。

## 安装与启动

安装锁定版本的前端依赖：

```bash
pnpm install --frozen-lockfile
```

启动完整桌面应用：

```bash
pnpm tauri dev
```

只预览浏览器前端：

```bash
pnpm dev
```

浏览器预览不包含 Tauri IPC，不能建立真实 SSH/SFTP 连接。

## 质量检查

完整前端质量门包含 ESLint、Vitest、TypeScript 检查和 Vite 生产构建：

```bash
pnpm check
```

Rust 质量门：

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

生成当前平台的 release 安装包：

```bash
pnpm tauri build
```

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
