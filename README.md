<div align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Qterm 软件图标">
  <h1>Qterm</h1>
  <p>轻量、安全、跨平台的 SSH 终端与远程文件工作台</p>
  <p>
    <a href="https://github.com/qiubai-lab/Qterm/releases/latest"><img src="https://img.shields.io/github/v/release/qiubai-lab/Qterm?logo=github" alt="最新版本"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/qiubai-lab/Qterm" alt="许可证"></a>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="支持平台">
  </p>
</div>

Qterm 基于 Tauri 2、React、TypeScript 与 Rust 构建，将本地终端、SSH 会话、SFTP 文件管理和网络转发组织在可持久化、可自由拆分的 Workspace 中。

## 🌠 界面预览

![Qterm 工作台：远程终端、本地终端、文件编辑、网络转发与文件浏览](images/screenshoot.png)

## 📥 安装

各平台最新安装包统一发布在 [GitHub Releases](https://github.com/qiubai-lab/Qterm/releases/latest)：macOS `.dmg`、Windows `.msi`/NSIS `.exe`、Linux `.AppImage`/`.deb`/`.rpm`。

### macOS

推荐通过 Homebrew 安装，cask 会自动处理未公证应用的隔离属性，打开时不会触发 Gatekeeper"已损坏"提示：

```bash
brew tap qiubai-lab/tap

# Homebrew 6.0+ 需要的一次性确认
brew trust qiubai-lab/tap

brew install --cask qterm
```

后续升级与卸载：

```bash
brew upgrade --cask qterm          # 升级到新版本

brew uninstall --cask qterm        # 卸载（保留配置与数据）
brew uninstall --cask --zap qterm  # 卸载并清理全部配置、缓存与应用数据

brew untap qiubai-lab/tap          # 卸载后如不再需要，可移除 tap
```

也可以从 [Releases](https://github.com/qiubai-lab/Qterm/releases/latest) 直接下载 dmg（Apple Silicon 选 `Qterm_*_aarch64.dmg`，Intel 选 `Qterm_*_x86_64.dmg`），打开后将 Qterm 拖入「应用程序」。由于应用未经过 Apple 公证，通过浏览器下载的 dmg 会带有隔离属性，首次打开若提示"Qterm 已损坏，无法打开"，在终端执行一次即可正常使用：

```bash
xattr -cr /Applications/Qterm.app
```

### Windows / Linux

从 [Releases](https://github.com/qiubai-lab/Qterm/releases/latest) 下载对应平台的安装包：Windows 使用 `.msi` 或 NSIS `.exe` 安装程序，Linux 使用 `.AppImage`、`.deb` 或 `.rpm`。

## ✨ 功能特性

### Workspace 与终端

- **多 Workspace 工作台**：顶部标签直接代表独立工作环境，会话、布局与终端输出在切换后继续保留。
- **自由分割布局**：Terminal、Files 与 Network Block 可以横向或纵向分割，并支持调整比例、重排与最大化。
- **本地与远程终端**：在同一界面中同时运行本机 shell 和 SSH 会话，终端尺寸变化会同步到底层 PTY。
- **会话保护**：支持手动锁定终端界面，也可配置应用内空闲自动锁定。

### SSH 连接与凭证

- **集中管理连接**：保存主机、端口、用户名和认证偏好，并使用单层分组整理连接。
- **多种认证方式**：支持一次性密码、加密保存的密码、OpenSSH 私钥凭证和系统 SSH Agent。
- **严格主机密钥校验**：首次连接显示 SHA-256 指纹并要求确认；已信任主机的密钥发生变化时默认阻断。
- **加密凭证库**：通过 Argon2id 派生密钥，使用 AES-256-GCM 分项加密密码、私钥和口令；支持离线恢复密钥。

### 文件与网络工具

- **SFTP 文件工作区**：Files Block 可独立连接本机或远程目标，支持目录浏览、排序、上传、下载、预览和文本编辑。
- **上下文联动**：可从终端当前目录打开文件工作区，同时保留独立的连接与会话生命周期。
- **网络转发**：Network Block 支持本地端口转发、远程端口转发和本地 SOCKS5 动态代理。
- **可迁移配置**：连接、凭证库和网络规则可以保存到用户指定的数据目录。

安全设计、信任边界与已知残余风险请阅读[安全模型](docs/security-model.md)。

## ⌨️ 常用操作

快捷键中的 `Mod` 在 macOS 上是 `Command`，在 Windows 和 Linux 上是 `Ctrl`。

| 操作 | 快捷键或手势 |
| --- | --- |
| 新建 Workspace | `Mod+T` |
| 左右分割当前 Block | `Mod+D` |
| 上下分割当前 Block | `Shift+Mod+D` |
| 切换到第 1–9 个 Workspace | `Mod+1` … `Mod+9` |
| 循环切换 Workspace | `Shift+Mod+[` / `Shift+Mod+]` |
| 打开连接管理 | `Mod+K` |
| 重命名 Workspace | 双击标签 |
| 重排 Workspace / Block | 拖动标签或 Block 标题栏 |

## 🚀 从源码运行

开发环境需要 Node.js 22、pnpm 11.0.8、Rust 1.97.1，以及对应平台的 Tauri 2 系统依赖。

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm dev` 仅启动浏览器界面，不包含 Tauri IPC，无法建立真实 SSH/SFTP 连接。各平台依赖、测试和构建命令见[开发指引](docs/DEVELOPMENT.md)。

## 📚 文档索引

| 文档 | 内容 |
| --- | --- |
| [开发指引](docs/DEVELOPMENT.md) | 环境准备、源码运行、测试、构建与贡献约定 |
| [安全模型](docs/security-model.md) | 凭据、主机密钥、文件传输与信任边界 |
| [故障排查](docs/troubleshooting.md) | SSH、私钥、SFTP 与开发环境常见问题 |
| [发布流程](docs/release.md) | 版本检查、标签发布、CI 产物与失败处理 |
| [产品目标](docs/qb-spec/context/PRODUCT_SPEC.md) | 目标用户、核心流程与产品原则 |
| [架构规范](docs/qb-spec/context/ARCHITECTURE_SPEC.md) | 技术基线、模块边界、数据流与安全规则 |
| [架构决策](docs/qb-spec/context/DECISIONS.md) | 重要设计选择及其背景 |
| [目录地图](docs/qb-spec/DIRECTORY_MAP.md) | 仓库结构与模块职责速查 |
| [功能规格](docs/qb-spec/specs/) | 各项功能的需求、范围与验收标准 |
| [实施计划](docs/qb-spec/plans/) | 对应功能的实现步骤与验证计划 |

## 🛠 技术栈

- 桌面框架：[Tauri 2](https://tauri.app/)
- 前端：React 19、TypeScript、Vite、xterm.js、CodeMirror
- 后端：Rust、russh、russh-sftp
- 测试与质量：Vitest、Testing Library、ESLint、Clippy、rustfmt

## 🤝 参与贡献

欢迎提交 Issue、设计讨论、文档改进和 Pull Request。开始修改前请阅读[开发指引](docs/DEVELOPMENT.md)，并为认证、主机密钥、凭证持久化、Workspace、布局或文件传输等关键行为补充回归测试。

提交信息遵循 Conventional Commits，例如 `feat: add session search` 或 `fix: reject changed host keys`。界面变更请在 Pull Request 中附截图或录屏。

<a href="https://github.com/qiubai-lab/Qterm/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=qiubai-lab/Qterm" alt="贡献者">
</a>

## ⭐ Star History

如果觉得 Qterm 对你有帮助，欢迎点一个 Star 支持项目发展。

[![Star History Chart](https://api.star-history.com/svg?repos=qiubai-lab/Qterm&type=Date)](https://www.star-history.com/#qiubai-lab/Qterm&Date)

## 📜 许可证

Qterm 采用 [GNU General Public License version 3](LICENSE)，SPDX 标识为 `GPL-3.0-only`。GPLv3 允许个人使用、修改、再分发和商业使用；分发副本、二进制或衍生作品时，需遵守相应的源码提供、声明保留、修改标注和同许可证授权要求。完整条款以仓库中的许可证正文为准。
